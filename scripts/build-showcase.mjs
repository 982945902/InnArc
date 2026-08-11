import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const showcase = resolve(root, "apps/showcase");
const deckSource = resolve(root, "packages/deck/src/deck-data.json");
// The public prototype renders cards at 240px or smaller. Use the prepared
// thumbnails so all 78 originals load quickly; production keeps the HD set.
const cardSource = resolve(root, "assets/cards/thumbs");
const cardTarget = resolve(showcase, "cards");

const deck = JSON.parse(readFileSync(deckSource, "utf8"));
if (!Array.isArray(deck) || deck.length !== 78) {
  throw new Error(`Showcase requires exactly 78 cards, received ${deck.length}.`);
}

mkdirSync(showcase, { recursive: true });
rmSync(cardTarget, { recursive: true, force: true });
cpSync(cardSource, cardTarget, { recursive: true });
writeFileSync(resolve(showcase, "deck-data.json"), `${JSON.stringify(deck)}\n`);

console.log(`Showcase ready: ${deck.length} cards copied to ${showcase}`);
