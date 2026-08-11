import type {
  ConsentRequest,
  ConsentResponse,
  SafetyFeedbackRequest,
  SafetyFeedbackResponse
} from "@heart-mirror/contracts";
import { Effect } from "effect";
import { AppConfigService } from "./config.js";
import { ComplianceRepository, makeSafetyEvent } from "./compliance-repository.js";
import { InvalidSessionState, type DomainError } from "./errors.js";
import type { Actor } from "./identity.js";
import { sanitizeUserText } from "./safety-service.js";

export const recordConsent = (
  actor: Actor,
  request: ConsentRequest
): Effect.Effect<ConsentResponse, DomainError, ComplianceRepository | AppConfigService> =>
  Effect.gen(function* () {
    const config = yield* AppConfigService;
    const repository = yield* ComplianceRepository;
    if (request.consentVersion !== config.consentVersion) {
      return yield* new InvalidSessionState({
        message: "声明内容已经更新，请重新阅读后确认。"
      });
    }
    return yield* repository.recordConsent(actor.id, request.consentVersion);
  });

export const submitSafetyFeedback = (
  actor: Actor,
  requestId: string,
  request: SafetyFeedbackRequest
): Effect.Effect<SafetyFeedbackResponse, DomainError, ComplianceRepository> =>
  Effect.gen(function* () {
    const repository = yield* ComplianceRepository;
    const sanitizedMessage = request.message ? sanitizeUserText(request.message).slice(0, 500) : undefined;
    yield* repository.recordSafetyEvent(makeSafetyEvent({
      userId: actor.id,
      requestId,
      category: `feedback:${request.category}`,
      action: "received",
      contentDigest: sanitizedMessage ? `length:${sanitizedMessage.length}` : "empty",
      ruleVersion: "feedback-2026-08-07.v1"
    }));
    return yield* repository.recordFeedback(actor.id, {
      category: request.category,
      ...(request.sessionId ? { sessionId: request.sessionId } : {}),
      ...(sanitizedMessage ? { message: sanitizedMessage } : {})
    });
  });
