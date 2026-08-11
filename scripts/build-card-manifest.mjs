import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const deck = JSON.parse(readFileSync(join(root, "packages/deck/src/deck-data.json"), "utf8"));

const dimensions = (buffer, extension) => {
  if (extension === "png") {
    if (buffer.toString("ascii", 1, 4) !== "PNG") throw new Error("无效 PNG 文件");
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") {
    throw new Error("无效 WebP 文件");
  }
  const chunk = buffer.toString("ascii", 12, 16);
  if (chunk === "VP8 ") {
    return {
      width: buffer.readUInt16LE(26) & 0x3fff,
      height: buffer.readUInt16LE(28) & 0x3fff
    };
  }
  if (chunk === "VP8L") {
    const bits = buffer.readUInt32LE(21);
    return {
      width: (bits & 0x3fff) + 1,
      height: ((bits >> 14) & 0x3fff) + 1
    };
  }
  if (chunk === "VP8X") {
    return {
      width: 1 + buffer.readUIntLE(24, 3),
      height: 1 + buffer.readUIntLE(27, 3)
    };
  }
  throw new Error(`不支持的 WebP chunk：${chunk}`);
};

const describe = (path, expected) => {
  const absolute = join(root, path);
  if (!existsSync(absolute)) throw new Error(`缺少卡面：${path}`);
  const buffer = readFileSync(absolute);
  const extension = path.split(".").pop();
  const size = dimensions(buffer, extension);
  if (size.width !== expected.width || size.height !== expected.height) {
    throw new Error(`${path} 尺寸应为 ${expected.width}×${expected.height}，当前为 ${size.width}×${size.height}`);
  }
  return {
    path: relative(root, absolute),
    ...size,
    bytes: statSync(absolute).size,
    sha256: createHash("sha256").update(buffer).digest("hex")
  };
};

const describeSet = (id) => ({
  source: describe(`assets/cards/source/${id}.png`, { width: 1024, height: 1536 }),
  production: describe(`assets/cards/webp/${id}.webp`, { width: 800, height: 1200 }),
  thumbnail: describe(`assets/cards/thumbs/${id}.webp`, { width: 240, height: 360 })
});

const manifest = {
  schemaVersion: 1,
  deckVersion: "2026-08-07.rws-mucha.v2",
  license: "Original artwork generated for Heart Mirror; project-owned asset set.",
  productionPublicRoot: "cards/webp",
  cards: deck.map((card) => ({
    id: card.id,
    group: card.group,
    index: card.index,
    nameZh: card.nameZh,
    nameEn: card.nameEn,
    publicPath: card.image,
    ...describeSet(card.id)
  })),
  cardBack: {
    id: "card-back",
    publicPath: "cards/webp/card-back.webp",
    ...describeSet("card-back")
  }
};

const output = join(root, "assets/card-manifest.json");
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`已写入 ${relative(root, output)}：${manifest.cards.length} 张卡面 + 1 张牌背`);
