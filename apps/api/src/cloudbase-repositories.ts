import { randomUUID } from "node:crypto";
import cloudbase from "@cloudbase/node-sdk";
import { Either, Effect, Layer } from "effect";
import type { AppConfig } from "./config.js";
import {
  ComplianceRepository,
  type ComplianceRepositoryService
} from "./compliance-repository.js";
import { InvalidSessionState, PersistenceFailure, ReadingTaskNotFound, SessionNotFound, type DomainError } from "./errors.js";
import type { SessionRecord } from "./model.js";
import {
  ReadingTaskRepository,
  type ReadingTaskRecord,
  type ReadingTaskRepositoryService
} from "./reading-task-repository.js";
import { SessionRepository, type SessionRepositoryService } from "./repository.js";

const SESSION_COLLECTION = "reflection_session";
const CONSENT_COLLECTION = "consent_log";
const SAFETY_COLLECTION = "safety_event";
const FEEDBACK_COLLECTION = "safety_feedback";
const QUOTA_COLLECTION = "daily_usage";
const READING_TASK_COLLECTION = "reading_task";

class DomainFailureBox extends Error {
  readonly domainError: DomainError;

  constructor(domainError: DomainError) {
    super(domainError._tag);
    this.domainError = domainError;
  }
}

const normalizeDocument = (value: unknown): Record<string, unknown> | undefined => {
  if (Array.isArray(value)) return value[0] as Record<string, unknown> | undefined;
  if (value && typeof value === "object") return value as Record<string, unknown>;
  return undefined;
};

const serialize = <A>(value: A): A => JSON.parse(JSON.stringify(value)) as A;

const persistenceError = (operation: string, cause: unknown): DomainError =>
  cause instanceof DomainFailureBox
    ? cause.domainError
    : new PersistenceFailure({
        operation,
        message: cause instanceof Error ? cause.message : String(cause)
      });

export const makeCloudBaseLayers = (config: AppConfig) => {
  const app = cloudbase.init({ env: config.cloudBaseEnvId });
  const db = app.database();
  type TransactionLike = Pick<typeof db, "collection">;

  const sessionLayer = Layer.succeed(SessionRepository, {
    get: (id) =>
      Effect.tryPromise({
        try: async () => {
          const response = await db.collection(SESSION_COLLECTION).doc(id).get();
          const document = normalizeDocument(response.data);
          if (!document) throw new DomainFailureBox(new SessionNotFound({ sessionId: id }));
          const { _id: _ignored, ...record } = document;
          return record as unknown as SessionRecord;
        },
        catch: (cause) => persistenceError("session_get", cause)
      }),
    put: (record) =>
      Effect.tryPromise({
        try: async () => {
          await db.collection(SESSION_COLLECTION).doc(record.id).set(serialize(record));
        },
        catch: (cause) => persistenceError("session_put", cause)
      }),
    modify: (id, change) =>
      Effect.tryPromise({
        try: async () => {
          const result = await db.runTransaction(async (transaction: TransactionLike) => {
            const reference = transaction.collection(SESSION_COLLECTION).doc(id);
            const response = await reference.get();
            const document = normalizeDocument(response.data);
            if (!document) throw new DomainFailureBox(new SessionNotFound({ sessionId: id }));
            const { _id: _ignored, ...rawRecord } = document;
            const changed = change(rawRecord as unknown as SessionRecord);
            if (Either.isLeft(changed)) throw new DomainFailureBox(changed.left);
            await reference.set(serialize(changed.right));
            return changed.right;
          });
          const transactionResult = result as { result?: SessionRecord };
          return transactionResult.result ?? (result as unknown as SessionRecord);
        },
        catch: (cause) => persistenceError("session_modify", cause)
      })
  } satisfies SessionRepositoryService);

  const complianceLayer = Layer.succeed(ComplianceRepository, {
    hasConsent: (userId, version) =>
      Effect.tryPromise({
        try: async () => {
          const id = `${userId}_${version.replace(/[^A-Za-z0-9_-]/g, "_")}`;
          const response = await db.collection(CONSENT_COLLECTION).doc(id).get();
          return Boolean(normalizeDocument(response.data));
        },
        catch: (cause) => persistenceError("consent_get", cause) as PersistenceFailure
      }),
    recordConsent: (userId, version) =>
      Effect.tryPromise({
        try: async () => {
          const response = { acceptedAt: new Date().toISOString(), consentVersion: version };
          const id = `${userId}_${version.replace(/[^A-Za-z0-9_-]/g, "_")}`;
          await db.collection(CONSENT_COLLECTION).doc(id).set({
            userId,
            ...response
          });
          return response;
        },
        catch: (cause) => persistenceError("consent_put", cause) as PersistenceFailure
      }),
    recordSafetyEvent: (event) =>
      Effect.tryPromise({
        try: async () => {
          await db.collection(SAFETY_COLLECTION).doc(event.id).set(serialize(event));
        },
        catch: (cause) => persistenceError("safety_event_put", cause) as PersistenceFailure
      }),
    recordFeedback: (userId, feedback) =>
      Effect.tryPromise({
        try: async () => {
          const id = `feedback_${randomUUID()}`;
          const receivedAt = new Date().toISOString();
          await db.collection(FEEDBACK_COLLECTION).doc(id).set(serialize({
            id,
            userId,
            sessionId: feedback.sessionId ?? null,
            category: feedback.category,
            message: feedback.message ?? null,
            receivedAt,
            status: "pending"
          }));
          return { id, receivedAt };
        },
        catch: (cause) => persistenceError("feedback_put", cause) as PersistenceFailure
      }),
    consumeDailyReflection: (userId, date, limit) =>
      Effect.tryPromise({
        try: async () => {
          const id = `${userId}_${date}`;
          const result = await db.runTransaction(async (transaction: TransactionLike) => {
            const reference = transaction.collection(QUOTA_COLLECTION).doc(id);
            const response = await reference.get();
            const document = normalizeDocument(response.data);
            const used = typeof document?.used === "number" ? document.used : 0;
            if (used >= limit) return false;
            await reference.set({ userId, date, used: used + 1, updatedAt: new Date().toISOString() });
            return true;
          });
          const transactionResult = result as { result?: boolean };
          return transactionResult.result ?? Boolean(result);
        },
        catch: (cause) => persistenceError("daily_usage_modify", cause) as PersistenceFailure
      })
  } satisfies ComplianceRepositoryService);

  const readingTaskLayer = Layer.succeed(ReadingTaskRepository, {
    get: (id) =>
      Effect.tryPromise({
        try: async () => {
          const response = await db.collection(READING_TASK_COLLECTION).doc(id).get();
          const document = normalizeDocument(response.data);
          if (!document) throw new DomainFailureBox(new ReadingTaskNotFound({ taskId: id }));
          const { _id: _ignored, ...record } = document;
          return record as unknown as ReadingTaskRecord;
        },
        catch: (cause) => persistenceError("reading_task_get", cause)
      }),
    getOrCreate: (record) =>
      Effect.tryPromise({
        try: async () => {
          const result = await db.runTransaction(async (transaction: TransactionLike) => {
            const reference = transaction.collection(READING_TASK_COLLECTION).doc(record.id);
            const response = await reference.get();
            const document = normalizeDocument(response.data);
            if (document) {
              const { _id: _ignored, ...existing } = document;
              const current = existing as unknown as ReadingTaskRecord;
              if (current.status !== "degraded") return current;
              const retried: ReadingTaskRecord = {
                ...current,
                status: "pending",
                message: undefined,
                leaseOwner: undefined,
                leaseUntil: undefined,
                updatedAt: new Date().toISOString()
              };
              await reference.set(serialize(retried));
              return retried;
            }
            await reference.set(serialize(record));
            return record;
          });
          const transactionResult = result as { result?: ReadingTaskRecord };
          return transactionResult.result ?? (result as unknown as ReadingTaskRecord);
        },
        catch: (cause) => persistenceError("reading_task_create", cause)
      }),
    claim: (id, workerId, leaseUntil) =>
      Effect.tryPromise({
        try: async () => {
          const result = await db.runTransaction(async (transaction: TransactionLike) => {
            const reference = transaction.collection(READING_TASK_COLLECTION).doc(id);
            const response = await reference.get();
            const document = normalizeDocument(response.data);
            if (!document) throw new DomainFailureBox(new ReadingTaskNotFound({ taskId: id }));
            const { _id: _ignored, ...rawRecord } = document;
            const current = rawRecord as unknown as ReadingTaskRecord;
            const claimable = current.status === "pending" || (
              current.status === "processing" &&
              (!current.leaseUntil || Date.parse(current.leaseUntil) <= Date.now())
            );
            if (!claimable) return undefined;
            const claimed: ReadingTaskRecord = {
              ...current,
              status: "processing",
              leaseOwner: workerId,
              leaseUntil,
              updatedAt: new Date().toISOString()
            };
            await reference.set(serialize(claimed));
            return claimed;
          });
          if (result && typeof result === "object" && "result" in result) {
            return (result as { result?: ReadingTaskRecord }).result;
          }
          return result as unknown as ReadingTaskRecord | undefined;
        },
        catch: (cause) => persistenceError("reading_task_claim", cause)
      }),
    finish: (id, workerId, completion) =>
      Effect.tryPromise({
        try: async () => {
          const result = await db.runTransaction(async (transaction: TransactionLike) => {
            const reference = transaction.collection(READING_TASK_COLLECTION).doc(id);
            const response = await reference.get();
            const document = normalizeDocument(response.data);
            if (!document) throw new DomainFailureBox(new ReadingTaskNotFound({ taskId: id }));
            const { _id: _ignored, ...rawRecord } = document;
            const current = rawRecord as unknown as ReadingTaskRecord;
            if (["complete", "blocked", "degraded"].includes(current.status)) return current;
            if (current.status !== "processing" || current.leaseOwner !== workerId) {
              throw new DomainFailureBox(new InvalidSessionState({ message: "解读任务已由其他执行器接管。" }));
            }
            const finished: ReadingTaskRecord = {
              ...current,
              status: completion.status,
              ...(completion.reading ? { reading: completion.reading } : {}),
              ...(completion.message ? { message: completion.message } : {}),
              leaseOwner: undefined,
              leaseUntil: undefined,
              updatedAt: new Date().toISOString()
            };
            await reference.set(serialize(finished));
            return finished;
          });
          const transactionResult = result as { result?: ReadingTaskRecord };
          return transactionResult.result ?? (result as unknown as ReadingTaskRecord);
        },
        catch: (cause) => persistenceError("reading_task_finish", cause)
      })
  } satisfies ReadingTaskRepositoryService);

  return { sessionLayer, complianceLayer, readingTaskLayer };
};
