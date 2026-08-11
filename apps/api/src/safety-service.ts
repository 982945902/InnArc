import { createHmac } from "node:crypto";
import type { ReadingDraft } from "@heart-mirror/contracts";
import { Context, Effect, Layer } from "effect";
import type { AppConfig } from "./config.js";
import { ComplianceRepository, makeSafetyEvent } from "./compliance-repository.js";
import { ContentBlocked, OutputRejected, type PersistenceFailure } from "./errors.js";
import { PlatformSafetyService } from "./platform-safety.js";

export interface SafeText {
  readonly value: string;
  readonly categories: readonly string[];
}

export interface ExpectedReadingCard {
  readonly id: string;
  readonly positionName: string;
}

export interface SafetyServiceShape {
  readonly inspectInput: (input: {
    readonly text: string;
    readonly userId: string;
    readonly platformUserId?: string | undefined;
    readonly requestId: string;
  }) => Effect.Effect<SafeText, ContentBlocked | PersistenceFailure>;
  readonly inspectGeneratedText: (
    text: string,
    platformUserId?: string
  ) => Effect.Effect<void, OutputRejected | PersistenceFailure>;
  readonly inspectReading: (input: {
    readonly reading: ReadingDraft;
    readonly expectedCards: readonly ExpectedReadingCard[];
    readonly platformUserId?: string | undefined;
  }) => Effect.Effect<ReadingDraft, OutputRejected | PersistenceFailure>;
}

export class SafetyService extends Context.Tag("@heart-mirror/SafetyService")<
  SafetyService,
  SafetyServiceShape
>() {}

const RULE_VERSION = "safety-2026-08-07.v1";
const CRISIS_SUPPORT = "如果存在立即危险，请立刻联系当地紧急服务；在中国大陆可拨打 110 或 120。也请尽快联系身边可信任的人，不要独自承担。";

const crisisPattern = /自杀|不想活|结束生命|伤害自己|割腕|跳楼|杀死|杀了他|伤害他人|马上去死/;
const professionalPattern = /确诊|什么病|疾病结果|停药|换药|药量|怀孕结果|抑郁症|焦虑症|判刑|官司结果|股票|基金|彩票|投资建议/;
const predictionPattern = /算命|占卜|运势|财运|桃花运|正缘|复合概率|会不会复合|什么时候结婚|他爱不爱我|预言|吉凶|开运|转运/;
const unsafePattern = /制作炸弹|购买毒品|实施诈骗|虐待|强迫性行为/;
const outputForbiddenPattern = /命中注定|注定|一定会|必然会|将会发生|预示|吉凶|运势|算命|开运|转运|疾病结果|建议停药|建议买入|建议卖出|复合概率|他心里一定/;

export const sanitizeUserText = (text: string): string =>
  text
    .trim()
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[邮箱已隐藏]")
    .replace(/(?<!\d)1[3-9]\d{9}(?!\d)/g, "[手机号已隐藏]")
    .replace(/(?<!\d)\d{17}[\dXx](?!\d)/g, "[证件号已隐藏]")
    .replace(/(?:微信|wx|wechat)\s*[:：]?\s*[A-Za-z][-_A-Za-z0-9]{5,19}/gi, "[账号已隐藏]")
    .slice(0, 120);

const digest = (text: string, secret: string): string =>
  createHmac("sha256", secret).update(text).digest("hex");

export const makeSafetyLayer = (config: AppConfig) =>
  Layer.effect(
    SafetyService,
    Effect.gen(function* () {
      const compliance = yield* ComplianceRepository;
      const platform = yield* PlatformSafetyService;

      const block = (input: {
        readonly text: string;
        readonly userId: string;
        readonly requestId: string;
        readonly category: "reframe" | "professional" | "unsafe" | "crisis";
        readonly message: string;
        readonly support?: string | undefined;
      }) =>
        compliance.recordSafetyEvent(makeSafetyEvent({
          userId: input.userId,
          requestId: input.requestId,
          category: input.category,
          action: "blocked",
          contentDigest: digest(input.text, config.userIdHmacSecret),
          ruleVersion: RULE_VERSION
        })).pipe(
          Effect.flatMap(() => Effect.fail(new ContentBlocked({
            category: input.category,
            message: input.message,
            ...(input.support ? { support: input.support } : {})
          })))
        );

      return {
        inspectInput: (input) =>
          Effect.gen(function* () {
            const sanitized = sanitizeUserText(input.text);
            if (crisisPattern.test(sanitized)) {
              return yield* block({
                ...input,
                text: sanitized,
                category: "crisis",
                message: "现在最重要的是确保你和他人的安全，本次不继续生成卡片内容。",
                support: CRISIS_SUPPORT
              });
            }
            if (professionalPattern.test(sanitized)) {
              return yield* block({
                ...input,
                text: sanitized,
                category: "professional",
                message: "这个问题需要由合格的专业人员结合真实情况判断。你可以改写为：我现在有哪些感受和可控行动？"
              });
            }
            if (predictionPattern.test(sanitized)) {
              return yield* block({
                ...input,
                text: sanitized,
                category: "reframe",
                message: "请把问题改写为对自己的感受、需要、边界或可控行动的探索。"
              });
            }
            if (unsafePattern.test(sanitized)) {
              return yield* block({
                ...input,
                text: sanitized,
                category: "unsafe",
                message: "这个主题不适合在此生成内容。"
              });
            }

            const platformDecision = yield* platform.checkText(sanitized, input.platformUserId);
            if (platformDecision !== "pass") {
              return yield* block({
                ...input,
                text: sanitized,
                category: "unsafe",
                message: platformDecision === "review"
                  ? "内容需要进一步确认，请换一种更简短的方式描述。"
                  : "这个主题不适合在此生成内容。"
              });
            }
            return { value: sanitized, categories: [] };
          }),
        inspectGeneratedText: (text, platformUserId) =>
          Effect.gen(function* () {
            if (outputForbiddenPattern.test(text)) {
              return yield* new OutputRejected({ reason: "模型中间输出包含确定性或专业建议表述" });
            }
            const platformDecision = yield* platform.checkText(text, platformUserId);
            if (platformDecision !== "pass") {
              return yield* new OutputRejected({ reason: "模型中间输出未通过平台内容审核" });
            }
          }),
        inspectReading: (input) =>
          Effect.gen(function* () {
            const actual = input.reading.cards;
            if (actual.length !== input.expectedCards.length) {
              return yield* new OutputRejected({ reason: "卡片数量与服务端事实不一致" });
            }
            for (let index = 0; index < input.expectedCards.length; index += 1) {
              const expected = input.expectedCards[index]!;
              const current = actual[index]!;
              if (current.cardId !== expected.id || current.positionName !== expected.positionName) {
                return yield* new OutputRejected({ reason: "卡片身份或位置与服务端事实不一致" });
              }
            }
            const serialized = JSON.stringify(input.reading);
            if (outputForbiddenPattern.test(serialized)) {
              return yield* new OutputRejected({ reason: "模型输出包含确定性或专业建议表述" });
            }
            if (input.reading.actions.some((action) => action.length > 80)) {
              return yield* new OutputRejected({ reason: "行动建议过长" });
            }
            const platformDecision = yield* platform.checkText(serialized, input.platformUserId);
            if (platformDecision !== "pass") {
              return yield* new OutputRejected({ reason: "模型输出未通过平台内容审核" });
            }
            return input.reading;
          })
      } satisfies SafetyServiceShape;
    })
  );
