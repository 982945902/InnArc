import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import fastifyStatic from "@fastify/static";
import type { FastifyInstance, FastifyReply } from "fastify";
import Fastify from "fastify";
import {
  ApiErrorSchema,
  ClarificationAnswerRequestSchema,
  ConsentRequestSchema,
  ConsentResponseSchema,
  CreateSessionRequestSchema,
  DrawRequestSchema,
  DrawResponseSchema,
  ReadingAcceptedSchema,
  ReadingTaskSchema,
  PublicConfigSchema,
  SafetyFeedbackRequestSchema,
  SafetyFeedbackResponseSchema,
  SessionSchema,
  ShuffleResponseSchema,
  type ClarificationAnswerRequest,
  type ConsentRequest,
  type CreateSessionRequest,
  type DrawRequest,
  type ReadingAccepted,
  type ReadingTask,
  type SafetyFeedbackRequest
} from "@heart-mirror/contracts";
import { Effect, Either } from "effect";
import { recordConsent, submitSafetyFeedback } from "./compliance-service.js";
import { toPublicConfig } from "./config.js";
import type { DomainError } from "./errors.js";
import { resolveActor, type Actor } from "./identity.js";
import {
  answerClarification,
  createSession,
  drawCard,
  getSession,
  shuffleSession
} from "./reflection-service.js";
import { createReadingTask, getReadingTask, processReadingTask } from "./reading-task-service.js";
import { appConfig, appRuntime } from "./runtime.js";

interface SessionParams {
  id: string;
}

const CommonErrorResponses = {
  400: ApiErrorSchema,
  401: ApiErrorSchema,
  404: ApiErrorSchema,
  409: ApiErrorSchema,
  422: ApiErrorSchema,
  428: ApiErrorSchema,
  429: ApiErrorSchema,
  500: ApiErrorSchema,
  503: ApiErrorSchema
} as const;

const replyDomainError = (reply: FastifyReply, requestId: string, error: DomainError) => {
  switch (error._tag) {
    case "SessionNotFound":
      return reply.code(404).send({ requestId, code: "SESSION_NOT_FOUND", message: "没有找到这次会话。", retryable: false });
    case "ReadingTaskNotFound":
      return reply.code(404).send({ requestId, code: "READING_TASK_NOT_FOUND", message: "没有找到这次解读任务。", retryable: false });
    case "ContentBlocked":
      return reply.code(422).send({
        requestId,
        code: error.category === "crisis" ? "CRISIS_SUPPORT" : "CONTENT_BLOCKED",
        message: error.message,
        retryable: false,
        category: error.category,
        ...(error.support ? { support: error.support } : {})
      });
    case "InvalidSessionState":
    case "InvalidDraw":
      return reply.code(409).send({ requestId, code: "INVALID_SESSION_STATE", message: error.message, retryable: false });
    case "AgentFailure":
      return reply.code(503).send({ requestId, code: "AGENT_UNAVAILABLE", message: "内容生成暂时不可用，请稍后重试。", retryable: true });
    case "AuthenticationRequired":
      return reply.code(401).send({ requestId, code: "AUTHENTICATION_REQUIRED", message: error.message, retryable: false });
    case "ConsentRequired":
      return reply.code(428).send({ requestId, code: "CONSENT_REQUIRED", message: error.message, retryable: false });
    case "RateLimited":
      reply.header("retry-after", String(error.retryAfterSeconds));
      return reply.code(429).send({ requestId, code: "RATE_LIMITED", message: error.message, retryable: true });
    case "PersistenceFailure":
      return reply.code(503).send({ requestId, code: "PERSISTENCE_UNAVAILABLE", message: "数据服务暂时不可用，请稍后重试。", retryable: true });
    case "OutputRejected":
      return reply.code(503).send({ requestId, code: "OUTPUT_REJECTED", message: "本次内容未通过安全检查，请重试。", retryable: true });
  }
};

const run = async <A, R>(program: Effect.Effect<A, DomainError, R>) =>
  appRuntime.runPromise(Effect.either(program as Effect.Effect<A, DomainError, never>));

const actorFor = async (headers: Parameters<typeof resolveActor>[0]) =>
  appRuntime.runPromise(Effect.either(resolveActor(headers, appConfig)));

const contextFor = (actor: Actor, requestId: string) => ({ actor, requestId });

export const buildServer = (): FastifyInstance => {
  const app = Fastify({
    bodyLimit: 16 * 1024,
    genReqId: () => `req_${randomUUID()}`,
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      redact: {
        paths: [
          "req.headers.authorization",
          "req.headers.x-wx-openid",
          "req.headers.x-wx-unionid",
          "req.headers.x-cloudbase-context"
        ],
        censor: "[REDACTED]"
      }
    }
  });
  if (appConfig.environment !== "production") {
    app.register(fastifyStatic, {
      root: fileURLToPath(new URL("../../../assets", import.meta.url)),
      prefix: "/assets/"
    });
  }
  const requestBuckets = new Map<string, { start: number; count: number }>();

  const scheduleReadingTask = (
    taskId: string,
    actor: Actor,
    requestId: string
  ): void => {
    void appRuntime.runPromise(Effect.either(processReadingTask(
      taskId,
      contextFor(actor, requestId)
    ))).then((result) => {
      if (Either.isLeft(result)) {
        app.log.error({ taskId, errorTag: result.left._tag }, "asynchronous reading task failed");
      }
    }).catch((cause: unknown) => {
      app.log.error({ taskId, cause }, "asynchronous reading task crashed");
    });
  };

  app.addHook("onRequest", async (request, reply) => {
    reply.header("x-request-id", request.id);
    const key = request.ip;
    const timestamp = Date.now();
    const bucket = requestBuckets.get(key);
    if (!bucket || timestamp - bucket.start >= 60_000) {
      requestBuckets.set(key, { start: timestamp, count: 1 });
      return;
    }
    bucket.count += 1;
    if (bucket.count > 120) {
      reply.header("retry-after", "60");
      return reply.code(429).send({
        requestId: request.id,
        code: "TRANSPORT_RATE_LIMITED",
        message: "请求过于频繁，请稍后再试。",
        retryable: true
      });
    }
    if (requestBuckets.size > 10_000) {
      for (const [bucketKey, value] of requestBuckets) {
        if (timestamp - value.start >= 60_000) requestBuckets.delete(bucketKey);
      }
    }
  });

  app.get("/health", async () => ({ status: "ok", aiDriver: process.env.AI_DRIVER ?? "fake" }));
  app.get(
    "/v1/config/public",
    { schema: { response: { 200: PublicConfigSchema } } },
    async () => toPublicConfig(appConfig)
  );

  app.post<{ Body: ConsentRequest }>(
    "/v1/consents",
    {
      schema: {
        body: ConsentRequestSchema,
        response: { 200: ConsentResponseSchema, ...CommonErrorResponses }
      }
    },
    async (request, reply) => {
      const actorResult = await actorFor(request.headers);
      if (Either.isLeft(actorResult)) return replyDomainError(reply, request.id, actorResult.left);
      const result = await run(recordConsent(actorResult.right, request.body));
      return Either.isLeft(result) ? replyDomainError(reply, request.id, result.left) : result.right;
    }
  );

  app.post<{ Body: SafetyFeedbackRequest }>(
    "/v1/safety/feedback",
    {
      schema: {
        body: SafetyFeedbackRequestSchema,
        response: { 200: SafetyFeedbackResponseSchema, ...CommonErrorResponses }
      }
    },
    async (request, reply) => {
      const actorResult = await actorFor(request.headers);
      if (Either.isLeft(actorResult)) return replyDomainError(reply, request.id, actorResult.left);
      const result = await run(submitSafetyFeedback(actorResult.right, request.id, request.body));
      return Either.isLeft(result) ? replyDomainError(reply, request.id, result.left) : result.right;
    }
  );

  app.post<{ Body: CreateSessionRequest }>(
    "/v1/sessions",
    { schema: { body: CreateSessionRequestSchema, response: { 200: SessionSchema, ...CommonErrorResponses } } },
    async (request, reply) => {
      const actorResult = await actorFor(request.headers);
      if (Either.isLeft(actorResult)) return replyDomainError(reply, request.id, actorResult.left);
      const result = await run(createSession(
        request.body.question,
        contextFor(actorResult.right, request.id)
      ));
      return Either.isLeft(result) ? replyDomainError(reply, request.id, result.left) : result.right;
    }
  );

  app.get<{ Params: SessionParams }>(
    "/v1/sessions/:id",
    { schema: { response: { 200: SessionSchema, ...CommonErrorResponses } } },
    async (request, reply) => {
      const actorResult = await actorFor(request.headers);
      if (Either.isLeft(actorResult)) return replyDomainError(reply, request.id, actorResult.left);
      const result = await run(getSession(
        request.params.id,
        contextFor(actorResult.right, request.id)
      ));
      return Either.isLeft(result) ? replyDomainError(reply, request.id, result.left) : result.right;
    }
  );

  app.post<{ Params: SessionParams; Body: ClarificationAnswerRequest }>(
    "/v1/sessions/:id/clarifications",
    {
      schema: {
        body: ClarificationAnswerRequestSchema,
        response: { 200: SessionSchema, ...CommonErrorResponses }
      }
    },
    async (request, reply) => {
      const actorResult = await actorFor(request.headers);
      if (Either.isLeft(actorResult)) return replyDomainError(reply, request.id, actorResult.left);
      const result = await run(answerClarification(
        request.params.id,
        request.body.answer,
        contextFor(actorResult.right, request.id)
      ));
      return Either.isLeft(result) ? replyDomainError(reply, request.id, result.left) : result.right;
    }
  );

  app.post<{ Params: SessionParams }>(
    "/v1/sessions/:id/shuffle",
    { schema: { response: { 200: ShuffleResponseSchema, ...CommonErrorResponses } } },
    async (request, reply) => {
      const actorResult = await actorFor(request.headers);
      if (Either.isLeft(actorResult)) return replyDomainError(reply, request.id, actorResult.left);
      const result = await run(shuffleSession(
        request.params.id,
        contextFor(actorResult.right, request.id)
      ));
      return Either.isLeft(result) ? replyDomainError(reply, request.id, result.left) : result.right;
    }
  );

  app.post<{ Params: SessionParams; Body: DrawRequest }>(
    "/v1/sessions/:id/draws",
    {
      schema: {
        body: DrawRequestSchema,
        response: { 200: DrawResponseSchema, ...CommonErrorResponses }
      }
    },
    async (request, reply) => {
      const actorResult = await actorFor(request.headers);
      if (Either.isLeft(actorResult)) return replyDomainError(reply, request.id, actorResult.left);
      const result = await run(drawCard(
        request.params.id,
        request.body.slotId,
        contextFor(actorResult.right, request.id)
      ));
      return Either.isLeft(result) ? replyDomainError(reply, request.id, result.left) : result.right;
    }
  );

  app.post<{ Params: SessionParams }>(
    "/v1/sessions/:id/reading",
    { schema: { response: { 202: ReadingAcceptedSchema, ...CommonErrorResponses } } },
    async (request, reply) => {
      const actorResult = await actorFor(request.headers);
      if (Either.isLeft(actorResult)) return replyDomainError(reply, request.id, actorResult.left);
      const result = await run(createReadingTask(
        request.params.id,
        contextFor(actorResult.right, request.id)
      ));
      if (Either.isLeft(result)) return replyDomainError(reply, request.id, result.left);
      scheduleReadingTask(result.right.taskId, actorResult.right, request.id);
      return reply.code(202).send(result.right satisfies ReadingAccepted);
    }
  );

  app.get<{ Params: SessionParams }>(
    "/v1/reading-tasks/:id",
    { schema: { response: { 200: ReadingTaskSchema, ...CommonErrorResponses } } },
    async (request, reply) => {
      const actorResult = await actorFor(request.headers);
      if (Either.isLeft(actorResult)) return replyDomainError(reply, request.id, actorResult.left);
      const result = await run(getReadingTask(
        request.params.id,
        contextFor(actorResult.right, request.id)
      ));
      if (Either.isLeft(result)) return replyDomainError(reply, request.id, result.left);
      if (result.right.status === "pending") {
        scheduleReadingTask(result.right.id, actorResult.right, request.id);
      }
      return result.right satisfies ReadingTask;
    }
  );

  app.setErrorHandler((error, request, reply) => {
    if (typeof error === "object" && error !== null && "validation" in error && error.validation) {
      return reply.code(400).send({
        requestId: request.id,
        code: "VALIDATION_ERROR",
        message: "请求内容格式不正确。",
        retryable: false
      });
    }
    app.log.error(error);
    return reply.code(500).send({
      requestId: request.id,
      code: "INTERNAL_ERROR",
      message: "服务暂时不可用。",
      retryable: true
    });
  });

  app.addHook("onClose", async () => {
    await appRuntime.dispose();
  });

  return app;
};
