import type { CardView, Clarification, Reading, Session, SessionStatus, Spread } from "@heart-mirror/contracts";

export interface SessionRecord {
  readonly id: string;
  readonly userId: string;
  readonly question: string;
  readonly status: SessionStatus;
  readonly clarification?: Clarification | undefined;
  readonly answers: readonly string[];
  readonly spread?: Spread | undefined;
  readonly deckOrder: readonly string[];
  readonly selectedSlotIds: readonly string[];
  readonly cards: readonly CardView[];
  readonly reading?: Reading | undefined;
  readonly version: number;
  readonly expiresAt: string;
  readonly createdAt: string;
  readonly updatedAt: string;
}

export const toPublicSession = (record: SessionRecord): Session => ({
  id: record.id,
  question: record.question,
  status: record.status,
  ...(record.clarification ? { clarification: record.clarification } : {}),
  ...(record.spread ? { spread: record.spread } : {}),
  cards: [...record.cards],
  disclaimer: "内容仅供娱乐与自我觉察，不构成医疗、法律、财务或其他专业建议。"
});
