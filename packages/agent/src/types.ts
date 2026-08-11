import type { Clarification, ReadingDraft, Spread } from "@heart-mirror/contracts";

export interface ClarificationInput {
  readonly originalQuestion: string;
  readonly round: 1 | 2 | 3;
  readonly previousAnswers: readonly string[];
}

export interface SpreadInput {
  readonly originalQuestion: string;
  readonly answers: readonly string[];
}

export interface ReadingCardFact {
  readonly id: string;
  readonly name: string;
  readonly nameEn: string;
  readonly positionName: string;
  readonly positionPrompt: string;
  readonly keywords: readonly string[];
  readonly reflection: string;
  readonly action: string;
}

export interface ReadingInput {
  readonly question: string;
  readonly answers: readonly string[];
  readonly spread: Spread;
  readonly cards: readonly ReadingCardFact[];
}

export interface ReflectionAgent {
  clarify(input: ClarificationInput, signal?: AbortSignal): Promise<Clarification>;
  recommendSpread(input: SpreadInput, signal?: AbortSignal): Promise<Spread>;
  read(input: ReadingInput, signal?: AbortSignal): Promise<ReadingDraft>;
}
