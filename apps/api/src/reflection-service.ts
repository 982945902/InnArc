import { randomInt, randomUUID } from "node:crypto";
import { FakeReflectionAgent } from "@heart-mirror/agent";
import { Disclaimer, type DrawResponse, type Reading, type Session, type ShuffleResponse } from "@heart-mirror/contracts";
import { DECK_VERSION, deckData, getCardById } from "@heart-mirror/deck";
import { Effect, Either } from "effect";
import { AgentService } from "./agent-service.js";
import { AppConfigService } from "./config.js";
import { ComplianceRepository } from "./compliance-repository.js";
import { ConsentRequired, InvalidDraw, InvalidSessionState, RateLimited, SessionNotFound, type DomainError } from "./errors.js";
import type { Actor } from "./identity.js";
import { toPublicSession, type SessionRecord } from "./model.js";
import { SessionRepository } from "./repository.js";
import { SafetyService } from "./safety-service.js";

export interface ReflectionRequestContext {
  readonly actor: Actor;
  readonly requestId: string;
}

const now = (): string => new Date().toISOString();
const fallbackAgent = new FakeReflectionAgent();

const ensureAccess = (
  record: SessionRecord,
  context: ReflectionRequestContext
): Effect.Effect<SessionRecord, SessionNotFound> =>
  record.userId === context.actor.id && Date.parse(record.expiresAt) > Date.now()
    ? Effect.succeed(record)
    : Effect.fail(new SessionNotFound({ sessionId: record.id }));

const failState = (message: string): Either.Either<never, InvalidSessionState> =>
  Either.left(new InvalidSessionState({ message }));

export const createSession = (
  question: string,
  context: ReflectionRequestContext
): Effect.Effect<
  Session,
  DomainError,
  SessionRepository | AgentService | SafetyService | ComplianceRepository | AppConfigService
> =>
  Effect.gen(function* () {
    const repository = yield* SessionRepository;
    const compliance = yield* ComplianceRepository;
    const safety = yield* SafetyService;
    const config = yield* AppConfigService;
    const { agent, run } = yield* AgentService;
    const consented = yield* compliance.hasConsent(context.actor.id, config.consentVersion);
    if (!consented) {
      return yield* new ConsentRequired({
        message: "请先确认已满 18 周岁并阅读免责声明。",
        consentVersion: config.consentVersion
      });
    }
    const compliantQuestion = yield* safety.inspectInput({
      text: question,
      userId: context.actor.id,
      platformUserId: context.actor.platformUserId,
      requestId: context.requestId
    });
    const clarificationInput = { originalQuestion: compliantQuestion.value, round: 1 as const, previousAnswers: [] };
    const clarification = yield* run("clarification", (signal) =>
      agent.clarify(clarificationInput, signal)
    ).pipe(
      Effect.catchTag("AgentFailure", () => Effect.promise(() => fallbackAgent.clarify(clarificationInput)))
    );
    yield* safety.inspectGeneratedText(JSON.stringify(clarification), context.actor.platformUserId);
    const timestamp = now();
    const record: SessionRecord = {
      id: randomUUID(),
      userId: context.actor.id,
      question: compliantQuestion.value,
      status: "clarifying",
      clarification,
      answers: [],
      deckOrder: [],
      selectedSlotIds: [],
      cards: [],
      version: 1,
      expiresAt: new Date(Date.now() + config.sessionTtlHours * 60 * 60 * 1_000).toISOString(),
      createdAt: timestamp,
      updatedAt: timestamp
    };
    yield* repository.put(record);
    return toPublicSession(record);
  });

export const answerClarification = (
  sessionId: string,
  answer: string,
  context: ReflectionRequestContext
): Effect.Effect<Session, DomainError, SessionRepository | AgentService | SafetyService> =>
  Effect.gen(function* () {
    const repository = yield* SessionRepository;
    const safety = yield* SafetyService;
    const { agent, run } = yield* AgentService;
    const record = yield* repository.get(sessionId).pipe(
      Effect.flatMap((current) => ensureAccess(current, context))
    );
    if (record.status !== "clarifying" || !record.clarification) {
      return yield* new InvalidSessionState({ message: "当前会话不在追问阶段。" });
    }

    const inspectedAnswer = yield* safety.inspectInput({
      text: answer,
      userId: context.actor.id,
      platformUserId: context.actor.platformUserId,
      requestId: context.requestId
    });
    const answers = [...record.answers, inspectedAnswer.value];
    const round = record.clarification.round;
    const needsThirdRound = answers.some((item) => /不清楚|看不清|不知道|都可以/.test(item));
    const shouldContinue = round < 2 || (round === 2 && needsThirdRound);

    if (shouldContinue) {
      const nextRound = (round + 1) as 2 | 3;
      const clarificationInput = {
        originalQuestion: record.question,
        round: nextRound,
        previousAnswers: answers
      };
      const clarification = yield* run("clarification", (signal) =>
        agent.clarify(clarificationInput, signal)
      ).pipe(
        Effect.catchTag("AgentFailure", () => Effect.promise(() => fallbackAgent.clarify(clarificationInput)))
      );
      yield* safety.inspectGeneratedText(JSON.stringify(clarification), context.actor.platformUserId);
      const updated: SessionRecord = {
        ...record,
        answers,
        clarification,
        version: record.version + 1,
        updatedAt: now()
      };
      const persisted = yield* repository.modify(sessionId, (current) => {
        if (current.userId !== context.actor.id || Date.parse(current.expiresAt) <= Date.now()) {
          return Either.left(new SessionNotFound({ sessionId }));
        }
        if (current.version !== record.version || current.status !== "clarifying") {
          return Either.left(new InvalidSessionState({ message: "这一轮已经处理，请刷新后继续。" }));
        }
        return Either.right({ ...updated, version: current.version + 1 });
      });
      return toPublicSession(persisted);
    }

    const spreadInput = { originalQuestion: record.question, answers };
    const spread = yield* run("spread", (signal) =>
      agent.recommendSpread(spreadInput, signal)
    ).pipe(
      Effect.catchTag("AgentFailure", () => Effect.promise(() => fallbackAgent.recommendSpread(spreadInput)))
    );
    yield* safety.inspectGeneratedText(JSON.stringify(spread), context.actor.platformUserId);
    const updated: SessionRecord = {
      ...record,
      status: "spread_ready",
      answers,
      clarification: undefined,
      spread,
      version: record.version + 1,
      updatedAt: now()
    };
    const persisted = yield* repository.modify(sessionId, (current) => {
      if (current.userId !== context.actor.id || Date.parse(current.expiresAt) <= Date.now()) {
        return Either.left(new SessionNotFound({ sessionId }));
      }
      if (current.version !== record.version || current.status !== "clarifying") {
        return Either.left(new InvalidSessionState({ message: "这一轮已经处理，请刷新后继续。" }));
      }
      return Either.right({ ...updated, version: current.version + 1 });
    });
    return toPublicSession(persisted);
  });

const shuffledDeckIds = (): readonly string[] => {
  const ids = deckData.map((card) => card.id);
  for (let index = ids.length - 1; index > 0; index -= 1) {
    const swapIndex = randomInt(index + 1);
    [ids[index], ids[swapIndex]] = [ids[swapIndex]!, ids[index]!];
  }
  return ids;
};

export const shuffleSession = (
  sessionId: string,
  context: ReflectionRequestContext
): Effect.Effect<ShuffleResponse, DomainError, SessionRepository> =>
  Effect.gen(function* () {
    const repository = yield* SessionRepository;
    const updated = yield* repository.modify(sessionId, (record) => {
      if (record.userId !== context.actor.id || Date.parse(record.expiresAt) <= Date.now()) {
        return Either.left(new SessionNotFound({ sessionId }));
      }
      if (!record.spread || !["spread_ready", "drawing"].includes(record.status)) {
        return Either.left(new InvalidSessionState({ message: "请先完成追问并确认觉察结构。" }));
      }
      return Either.right({
        ...record,
        status: "drawing" as const,
        deckOrder: shuffledDeckIds(),
        selectedSlotIds: [],
        cards: [],
        reading: undefined,
        version: record.version + 1,
        updatedAt: now()
      });
    });
    return { slots: updated.deckOrder.map((_id, index) => ({ id: `slot_${String(index).padStart(2, "0")}` })) };
  });

export const drawCard = (
  sessionId: string,
  slotId: string,
  context: ReflectionRequestContext
): Effect.Effect<DrawResponse, DomainError, SessionRepository> =>
  Effect.gen(function* () {
    const repository = yield* SessionRepository;
    const updated = yield* repository.modify(sessionId, (record) => {
      if (record.userId !== context.actor.id || Date.parse(record.expiresAt) <= Date.now()) {
        return Either.left(new SessionNotFound({ sessionId }));
      }
      if (record.status !== "drawing" || !record.spread || record.deckOrder.length !== 78) {
        return failState("当前会话不能抽牌，请先洗牌。");
      }
      if (record.selectedSlotIds.includes(slotId)) {
        return Either.left(new InvalidDraw({ message: "这张牌已经选过了。" }));
      }
      if (record.cards.length >= record.spread.positions.length) {
        return Either.left(new InvalidDraw({ message: "所需卡牌已经选完。" }));
      }
      const slotIndex = Number(slotId.slice(5));
      const cardId = Number.isInteger(slotIndex) ? record.deckOrder[slotIndex] : undefined;
      const definition = cardId ? getCardById(cardId) : undefined;
      const position = record.spread.positions[record.cards.length];
      if (!definition || !position) {
        return Either.left(new InvalidDraw({ message: "无效的牌位。" }));
      }
      const card = {
        id: definition.id,
        name: definition.nameZh,
        nameEn: definition.nameEn,
        image: definition.image,
        positionId: position.id,
        positionName: position.name
      };
      const cards = [...record.cards, card];
      return Either.right({
        ...record,
        status: cards.length === record.spread.positions.length ? "reading" as const : "drawing" as const,
        selectedSlotIds: [...record.selectedSlotIds, slotId],
        cards,
        version: record.version + 1,
        updatedAt: now()
      });
    });
    return {
      card: updated.cards[updated.cards.length - 1]!,
      selectedCount: updated.cards.length,
      requiredCount: updated.spread!.positions.length
    };
  });

export const generateReading = (
  sessionId: string,
  context: ReflectionRequestContext
): Effect.Effect<
  Reading,
  DomainError,
  SessionRepository | AgentService | SafetyService | ComplianceRepository | AppConfigService
> =>
  Effect.gen(function* () {
    const repository = yield* SessionRepository;
    const compliance = yield* ComplianceRepository;
    const safety = yield* SafetyService;
    const config = yield* AppConfigService;
    const { agent, run } = yield* AgentService;
    const record = yield* repository.get(sessionId).pipe(
      Effect.flatMap((current) => ensureAccess(current, context))
    );
    if (record.reading) return record.reading;
    if (record.status !== "reading" || !record.spread || record.cards.length !== record.spread.positions.length) {
      return yield* new InvalidSessionState({ message: "请先选完觉察结构需要的全部卡片。" });
    }
    const quotaAllowed = yield* compliance.consumeDailyReflection(
      context.actor.id,
      new Date().toISOString().slice(0, 10),
      config.dailyReflectionLimit
    );
    if (!quotaAllowed) {
      return yield* new RateLimited({
        message: "今天的完整觉察次数已经用完，可以明天再来。",
        retryAfterSeconds: 86_400
      });
    }
    const facts = record.cards.map((card) => {
      const definition = getCardById(card.id);
      const position = record.spread!.positions.find((item) => item.id === card.positionId);
      if (!definition || !position) throw new Error("牌面事实缺失");
      return {
        id: definition.id,
        name: definition.nameZh,
        nameEn: definition.nameEn,
        positionName: position.name,
        positionPrompt: position.prompt,
        keywords: definition.keywords,
        reflection: definition.reflection,
        action: definition.action
      };
    });
    const input = {
      question: record.question,
      answers: record.answers,
      spread: record.spread,
      cards: facts
    };
    const expectedCards = facts.map((card) => ({ id: card.id, positionName: card.positionName }));
    const aiAttempt = run("reading", (signal) => agent.read(input, signal)).pipe(
      Effect.flatMap((reading) => safety.inspectReading({
        reading,
        expectedCards,
        platformUserId: context.actor.platformUserId
      })),
      Effect.map((reading) => ({
        reading,
        mode: config.aiDriver === "fake" ? "fallback" as const : "ai" as const
      }))
    );
    const fallbackAttempt = Effect.promise(() => fallbackAgent.read(input)).pipe(
      Effect.flatMap((reading) => safety.inspectReading({
        reading,
        expectedCards,
        platformUserId: context.actor.platformUserId
      })),
      Effect.map((reading) => ({ reading, mode: "fallback" as const }))
    );
    const rewritten = aiAttempt.pipe(
      Effect.catchTag("OutputRejected", () => aiAttempt)
    );
    const resolved = yield* rewritten.pipe(
      Effect.catchTags({
        AgentFailure: () => fallbackAttempt,
        OutputRejected: () => fallbackAttempt
      })
    );
    const reading: Reading = {
      ...resolved.reading,
      disclaimer: Disclaimer,
      generation: {
        mode: resolved.mode,
        label: resolved.mode === "ai" ? "AI 生成" : "固定内容",
        modelName: resolved.mode === "ai" ? config.modelName : "心镜固定牌义模板",
        promptVersion: config.promptVersion,
        deckVersion: DECK_VERSION
      }
    };
    const updated = yield* repository.modify(sessionId, (current) => {
      if (current.userId !== context.actor.id || Date.parse(current.expiresAt) <= Date.now()) {
        return Either.left(new SessionNotFound({ sessionId }));
      }
      if (current.reading) return Either.right(current);
      if (current.version !== record.version || current.status !== "reading") {
        return Either.left(new InvalidSessionState({ message: "会话状态已经变化，请刷新后继续。" }));
      }
      return Either.right({
        ...current,
        status: "completed" as const,
        reading,
        version: current.version + 1,
        updatedAt: now()
      });
    });
    return updated.reading!;
  });

export const getSession = (
  sessionId: string,
  context: ReflectionRequestContext
): Effect.Effect<Session, DomainError, SessionRepository> =>
  Effect.gen(function* () {
    const repository = yield* SessionRepository;
    const record = yield* repository.get(sessionId).pipe(
      Effect.flatMap((current) => ensureAccess(current, context))
    );
    return toPublicSession(record);
  });
