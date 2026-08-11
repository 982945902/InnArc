import { describe, expect, it } from "vitest";
import { deckData } from "./index.js";

describe("deckData", () => {
  it("contains the standard 78-card taxonomy with matching asset IDs", () => {
    expect(deckData).toHaveLength(78);
    expect(new Set(deckData.map((card) => card.id)).size).toBe(78);
    expect(Object.fromEntries(
      ["major", "wands", "cups", "swords", "pentacles"].map((group) => [
        group,
        deckData.filter((card) => card.group === group).length
      ])
    )).toEqual({ major: 22, wands: 14, cups: 14, swords: 14, pentacles: 14 });
    expect(deckData.map((card) => card.image)).toEqual(
      deckData.map((card) => `cards/webp/${card.id}.webp`)
    );
    expect(deckData.find((card) => card.id === "major-12")?.nameZh).toBe("倒吊人");
    expect(deckData.find((card) => card.id === "major-21")?.nameZh).toBe("世界");
    expect(deckData.find((card) => card.id === "cups-11")?.nameEn).toBe("Page of Cups");
    expect(deckData.find((card) => card.id === "pentacles-14")?.nameZh).toBe("星币国王");
  });
});
