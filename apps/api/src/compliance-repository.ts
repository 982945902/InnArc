import { randomUUID } from "node:crypto";
import type { ConsentResponse, SafetyFeedbackRequest, SafetyFeedbackResponse } from "@heart-mirror/contracts";
import { Context, Effect, Layer, Ref } from "effect";
import type { PersistenceFailure } from "./errors.js";

export interface SafetyEventRecord {
  readonly id: string;
  readonly userId: string;
  readonly requestId: string;
  readonly category: string;
  readonly action: string;
  readonly contentDigest: string;
  readonly ruleVersion: string;
  readonly createdAt: string;
}

export interface ComplianceRepositoryService {
  readonly hasConsent: (userId: string, version: string) => Effect.Effect<boolean, PersistenceFailure>;
  readonly recordConsent: (userId: string, version: string) => Effect.Effect<ConsentResponse, PersistenceFailure>;
  readonly recordSafetyEvent: (event: SafetyEventRecord) => Effect.Effect<void, PersistenceFailure>;
  readonly recordFeedback: (
    userId: string,
    feedback: SafetyFeedbackRequest
  ) => Effect.Effect<SafetyFeedbackResponse, PersistenceFailure>;
  readonly consumeDailyReflection: (
    userId: string,
    date: string,
    limit: number
  ) => Effect.Effect<boolean, PersistenceFailure>;
}

export class ComplianceRepository extends Context.Tag("@heart-mirror/ComplianceRepository")<
  ComplianceRepository,
  ComplianceRepositoryService
>() {}

interface ComplianceState {
  readonly consents: ReadonlyMap<string, ConsentResponse>;
  readonly safetyEvents: readonly SafetyEventRecord[];
  readonly feedback: readonly (SafetyFeedbackResponse & { readonly userId: string })[];
  readonly dailyUsage: ReadonlyMap<string, number>;
}

export const InMemoryComplianceRepository = Layer.effect(
  ComplianceRepository,
  Effect.gen(function* () {
    const state = yield* Ref.make<ComplianceState>({
      consents: new Map(),
      safetyEvents: [],
      feedback: [],
      dailyUsage: new Map()
    });

    return {
      hasConsent: (userId, version) =>
        Ref.get(state).pipe(
          Effect.map((current) => current.consents.has(`${userId}:${version}`))
        ),
      recordConsent: (userId, version) => {
        const response = { acceptedAt: new Date().toISOString(), consentVersion: version };
        return Ref.update(state, (current) => {
          const consents = new Map(current.consents);
          consents.set(`${userId}:${version}`, response);
          return { ...current, consents };
        }).pipe(Effect.as(response));
      },
      recordSafetyEvent: (event) =>
        Ref.update(state, (current) => ({
          ...current,
          safetyEvents: [...current.safetyEvents, event]
        })),
      recordFeedback: (userId, feedback) => {
        const response = { id: `feedback_${randomUUID()}`, receivedAt: new Date().toISOString() };
        return Ref.update(state, (current) => ({
          ...current,
          feedback: [...current.feedback, { ...response, userId, category: feedback.category }]
        })).pipe(Effect.as(response));
      },
      consumeDailyReflection: (userId, date, limit) =>
        Ref.modify(state, (current) => {
          const key = `${userId}:${date}`;
          const used = current.dailyUsage.get(key) ?? 0;
          if (used >= limit) return [false, current] as const;
          const dailyUsage = new Map(current.dailyUsage);
          dailyUsage.set(key, used + 1);
          return [true, { ...current, dailyUsage }] as const;
        })
    } satisfies ComplianceRepositoryService;
  })
);

export const makeSafetyEvent = (input: Omit<SafetyEventRecord, "id" | "createdAt">): SafetyEventRecord => ({
  ...input,
  id: `safety_${randomUUID()}`,
  createdAt: new Date().toISOString()
});
