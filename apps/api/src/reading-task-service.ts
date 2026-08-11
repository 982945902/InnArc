import { randomUUID } from "node:crypto";
import type { ReadingAccepted, ReadingTask } from "@heart-mirror/contracts";
import { Effect, Either } from "effect";
import { AppConfigService } from "./config.js";
import { ComplianceRepository } from "./compliance-repository.js";
import { InvalidSessionState, SessionNotFound, type DomainError } from "./errors.js";
import type { ReflectionRequestContext } from "./reflection-service.js";
import { generateReading } from "./reflection-service.js";
import {
  ReadingTaskRepository,
  toPublicReadingTask,
  type ReadingTaskRecord,
  type ReadingTaskRecordStatus
} from "./reading-task-repository.js";
import { SessionRepository } from "./repository.js";
import { AgentService } from "./agent-service.js";
import { SafetyService } from "./safety-service.js";

const POLL_AFTER_MS = 1_000;
const LEASE_MS = 120_000;

export const createReadingTask = (
  sessionId: string,
  context: ReflectionRequestContext
): Effect.Effect<ReadingAccepted, DomainError, SessionRepository | ReadingTaskRepository> =>
  Effect.gen(function* () {
    const sessions = yield* SessionRepository;
    const tasks = yield* ReadingTaskRepository;
    const session = yield* sessions.get(sessionId);
    if (session.userId !== context.actor.id || Date.parse(session.expiresAt) <= Date.now()) {
      return yield* new SessionNotFound({ sessionId });
    }
    if (!session.spread || !["reading", "completed"].includes(session.status)) {
      return yield* new InvalidSessionState({ message: "请先选完觉察结构需要的全部卡片。" });
    }

    const timestamp = new Date().toISOString();
    const record: ReadingTaskRecord = {
      id: `reading_${sessionId}`,
      sessionId,
      userId: context.actor.id,
      status: "pending",
      createdAt: timestamp,
      updatedAt: timestamp
    };
    const task = yield* tasks.getOrCreate(record);
    return {
      taskId: task.id,
      status: "pending",
      pollAfterMs: POLL_AFTER_MS
    };
  });

export const getReadingTask = (
  taskId: string,
  context: ReflectionRequestContext
): Effect.Effect<ReadingTask, DomainError, ReadingTaskRepository> =>
  Effect.gen(function* () {
    const tasks = yield* ReadingTaskRepository;
    const task = yield* tasks.get(taskId);
    if (task.userId !== context.actor.id) {
      return yield* new SessionNotFound({ sessionId: task.sessionId });
    }
    return toPublicReadingTask(task);
  });

const failureResult = (error: DomainError): {
  readonly status: Extract<ReadingTaskRecordStatus, "blocked" | "degraded">;
  readonly message: string;
} => {
  switch (error._tag) {
    case "RateLimited":
    case "InvalidSessionState":
    case "SessionNotFound":
    case "ReadingTaskNotFound":
    case "AuthenticationRequired":
    case "ConsentRequired":
    case "ContentBlocked":
    case "InvalidDraw":
      return { status: "blocked", message: error.message ?? "当前解读任务无法继续。" };
    case "AgentFailure":
    case "PersistenceFailure":
    case "OutputRejected":
      return { status: "degraded", message: "完整解读暂时没有生成成功，请稍后重试。" };
  }
};

export const processReadingTask = (
  taskId: string,
  context: ReflectionRequestContext
): Effect.Effect<ReadingTask | undefined, DomainError,
  ReadingTaskRepository | SessionRepository | AgentService | SafetyService | ComplianceRepository | AppConfigService
> =>
  Effect.gen(function* () {
    const tasks = yield* ReadingTaskRepository;
    const workerId = `worker_${randomUUID()}`;
    const claimed = yield* tasks.claim(
      taskId,
      workerId,
      new Date(Date.now() + LEASE_MS).toISOString()
    );
    if (!claimed) return undefined;

    const result = yield* Effect.either(generateReading(claimed.sessionId, context));
    const finished = Either.isRight(result)
      ? yield* tasks.finish(taskId, workerId, { status: "complete", reading: result.right })
      : yield* tasks.finish(taskId, workerId, failureResult(result.left));
    return toPublicReadingTask(finished);
  });
