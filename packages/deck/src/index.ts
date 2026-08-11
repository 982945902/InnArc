import rawDeck from "./deck-data.json" with { type: "json" };

export type CardGroup = "major" | "wands" | "cups" | "swords" | "pentacles";

export interface CardDefinition {
  readonly id: string;
  readonly group: CardGroup;
  readonly index: number;
  readonly nameZh: string;
  readonly nameEn: string;
  readonly keywords: readonly string[];
  readonly reflection: string;
  readonly action: string;
  readonly artBrief: string;
  readonly image: string;
}

const cards = rawDeck as readonly CardDefinition[];
const ids = new Set(cards.map((card) => card.id));

if (cards.length !== 78 || ids.size !== 78) {
  throw new Error("牌库必须包含 78 张且 ID 唯一");
}

export const DECK_VERSION = "2026-08-07.rws-mucha.v2";
export const deckData: readonly CardDefinition[] = Object.freeze(cards);

export const getCardById = (id: string): CardDefinition | undefined =>
  deckData.find((card) => card.id === id);
