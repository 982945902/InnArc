import { Type, type Static } from "typebox";

export const Disclaimer =
  "内容仅供娱乐与自我觉察，不构成医疗、法律、财务或其他专业建议。";

export const SessionStatusSchema = Type.Union([
  Type.Literal("clarifying"),
  Type.Literal("spread_ready"),
  Type.Literal("drawing"),
  Type.Literal("reading"),
  Type.Literal("completed"),
  Type.Literal("blocked"),
  Type.Literal("degraded")
]);
export type SessionStatus = Static<typeof SessionStatusSchema>;

export const ChoiceSchema = Type.Object({
  id: Type.String(),
  label: Type.String({ minLength: 1, maxLength: 80 })
});
export type Choice = Static<typeof ChoiceSchema>;

export const ClarificationSchema = Type.Object({
  round: Type.Integer({ minimum: 1, maximum: 3 }),
  question: Type.String(),
  choices: Type.Array(ChoiceSchema, { minItems: 2, maxItems: 4 }),
  allowFreeText: Type.Boolean()
});
export type Clarification = Static<typeof ClarificationSchema>;

export const SpreadPositionSchema = Type.Object({
  id: Type.String(),
  index: Type.Integer({ minimum: 0 }),
  name: Type.String(),
  prompt: Type.String()
});
export type SpreadPosition = Static<typeof SpreadPositionSchema>;

export const SpreadSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  reason: Type.String(),
  positions: Type.Array(SpreadPositionSchema, { minItems: 1, maxItems: 5 })
});
export type Spread = Static<typeof SpreadSchema>;

export const CardViewSchema = Type.Object({
  id: Type.String(),
  name: Type.String(),
  nameEn: Type.String(),
  image: Type.String(),
  positionId: Type.String(),
  positionName: Type.String()
});
export type CardView = Static<typeof CardViewSchema>;

export const SessionSchema = Type.Object({
  id: Type.String(),
  question: Type.String(),
  status: SessionStatusSchema,
  clarification: Type.Optional(ClarificationSchema),
  spread: Type.Optional(SpreadSchema),
  cards: Type.Array(CardViewSchema),
  disclaimer: Type.String()
});
export type Session = Static<typeof SessionSchema>;

export const CreateSessionRequestSchema = Type.Object({
  question: Type.String({ minLength: 4, maxLength: 300 })
});
export type CreateSessionRequest = Static<typeof CreateSessionRequestSchema>;

export const ClarificationAnswerRequestSchema = Type.Object({
  answer: Type.String({ minLength: 1, maxLength: 300 })
});
export type ClarificationAnswerRequest = Static<typeof ClarificationAnswerRequestSchema>;

export const ShuffleResponseSchema = Type.Object({
  slots: Type.Array(Type.Object({ id: Type.String() }), { minItems: 78, maxItems: 78 })
});
export type ShuffleResponse = Static<typeof ShuffleResponseSchema>;

export const DrawRequestSchema = Type.Object({
  slotId: Type.String({ pattern: "^slot_[0-9]{2}$" })
});
export type DrawRequest = Static<typeof DrawRequestSchema>;

export const DrawResponseSchema = Type.Object({
  card: CardViewSchema,
  selectedCount: Type.Integer({ minimum: 1, maximum: 5 }),
  requiredCount: Type.Integer({ minimum: 1, maximum: 5 })
});
export type DrawResponse = Static<typeof DrawResponseSchema>;

export const CardReadingSchema = Type.Object({
  cardId: Type.String(),
  positionName: Type.String(),
  title: Type.String(),
  interpretation: Type.String(),
  reflectionQuestion: Type.String()
});
export type CardReading = Static<typeof CardReadingSchema>;

export const ReadingSchema = Type.Object({
  summary: Type.String(),
  cards: Type.Array(CardReadingSchema, { minItems: 1, maxItems: 5 }),
  actions: Type.Array(Type.String(), { minItems: 1, maxItems: 3 }),
  disclaimer: Type.String(),
  generation: Type.Object({
    mode: Type.Union([Type.Literal("ai"), Type.Literal("fallback")]),
    label: Type.String(),
    modelName: Type.String(),
    promptVersion: Type.String(),
    deckVersion: Type.String()
  })
});
export type Reading = Static<typeof ReadingSchema>;
export type ReadingDraft = Pick<Reading, "summary" | "cards" | "actions">;

export const ApiErrorSchema = Type.Object({
  requestId: Type.String(),
  code: Type.String(),
  message: Type.String(),
  retryable: Type.Boolean(),
  category: Type.Optional(Type.String()),
  support: Type.Optional(Type.String())
});
export type ApiError = Static<typeof ApiErrorSchema>;

export const PublicConfigSchema = Type.Object({
  productName: Type.String(),
  minimumAge: Type.Integer({ minimum: 18 }),
  consentVersion: Type.String(),
  privacyPolicyVersion: Type.String(),
  shortDisclaimer: Type.String(),
  longDisclaimer: Type.String(),
  aiLabel: Type.String(),
  model: Type.Object({
    name: Type.String(),
    provider: Type.String(),
    registrationNumber: Type.String()
  }),
  links: Type.Object({
    privacy: Type.String(),
    terms: Type.String(),
    feedback: Type.String()
  }),
  features: Type.Object({
    cloudSync: Type.Boolean(),
    dailyCard: Type.Boolean(),
    sharePoster: Type.Boolean(),
    reducedMotion: Type.Boolean()
  }),
  cardAssetBaseUrl: Type.String()
});
export type PublicConfig = Static<typeof PublicConfigSchema>;

export const ConsentRequestSchema = Type.Object({
  adultConfirmed: Type.Literal(true),
  disclaimerAccepted: Type.Literal(true),
  consentVersion: Type.String()
});
export type ConsentRequest = Static<typeof ConsentRequestSchema>;

export const ConsentResponseSchema = Type.Object({
  acceptedAt: Type.String(),
  consentVersion: Type.String()
});
export type ConsentResponse = Static<typeof ConsentResponseSchema>;

export const SafetyFeedbackRequestSchema = Type.Object({
  sessionId: Type.Optional(Type.String()),
  category: Type.Union([
    Type.Literal("harmful"),
    Type.Literal("inaccurate"),
    Type.Literal("privacy"),
    Type.Literal("other")
  ]),
  message: Type.Optional(Type.String({ maxLength: 500 }))
});
export type SafetyFeedbackRequest = Static<typeof SafetyFeedbackRequestSchema>;

export const SafetyFeedbackResponseSchema = Type.Object({
  id: Type.String(),
  receivedAt: Type.String()
});
export type SafetyFeedbackResponse = Static<typeof SafetyFeedbackResponseSchema>;

export const ReadingTaskStatusSchema = Type.Union([
  Type.Literal("pending"),
  Type.Literal("complete"),
  Type.Literal("blocked"),
  Type.Literal("degraded")
]);
export const ReadingTaskSchema = Type.Object({
  id: Type.String(),
  sessionId: Type.String(),
  status: ReadingTaskStatusSchema,
  reading: Type.Optional(ReadingSchema),
  message: Type.Optional(Type.String()),
  createdAt: Type.String(),
  updatedAt: Type.String()
});
export type ReadingTask = Static<typeof ReadingTaskSchema>;

export const ReadingAcceptedSchema = Type.Object({
  taskId: Type.String(),
  status: Type.Literal("pending"),
  pollAfterMs: Type.Integer({ minimum: 800, maximum: 1200 })
});
export type ReadingAccepted = Static<typeof ReadingAcceptedSchema>;
