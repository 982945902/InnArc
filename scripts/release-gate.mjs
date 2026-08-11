import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const releaseMode = process.argv.includes("--release");
const failures = [];
const warnings = [];

const fail = (message) => failures.push(message);
const warn = (message) => warnings.push(message);
const readJson = (path) => JSON.parse(readFileSync(join(root, path), "utf8"));

const deck = readJson("packages/deck/src/deck-data.json");
const ids = new Set(deck.map((card) => card.id));
const images = new Set(deck.map((card) => card.image));
if (deck.length !== 78) fail(`卡库应为 78 张，当前为 ${deck.length} 张`);
if (ids.size !== 78) fail("卡库存在重复 ID");
if (images.size !== 78) fail("卡库存在重复图片路径");

const expectedGroups = { major: 22, wands: 14, cups: 14, swords: 14, pentacles: 14 };
for (const [group, expected] of Object.entries(expectedGroups)) {
  const actual = deck.filter((card) => card.group === group).length;
  if (actual !== expected) fail(`${group} 应为 ${expected} 张，当前为 ${actual} 张`);
}

const majorNames = [
  ["愚者", "The Fool"], ["魔术师", "The Magician"], ["女祭司", "The High Priestess"],
  ["皇后", "The Empress"], ["皇帝", "The Emperor"], ["教皇", "The Hierophant"],
  ["恋人", "The Lovers"], ["战车", "The Chariot"], ["力量", "Strength"],
  ["隐士", "The Hermit"], ["命运之轮", "Wheel of Fortune"], ["正义", "Justice"],
  ["倒吊人", "The Hanged Man"], ["死神", "Death"], ["节制", "Temperance"],
  ["恶魔", "The Devil"], ["高塔", "The Tower"], ["星星", "The Star"],
  ["月亮", "The Moon"], ["太阳", "The Sun"], ["审判", "Judgement"], ["世界", "The World"]
];
const minorSuits = [
  ["wands", "权杖", "Wands"],
  ["cups", "圣杯", "Cups"],
  ["swords", "宝剑", "Swords"],
  ["pentacles", "星币", "Pentacles"]
];
const minorRanks = [
  ["王牌", "Ace"], ["二", "Two"], ["三", "Three"], ["四", "Four"], ["五", "Five"],
  ["六", "Six"], ["七", "Seven"], ["八", "Eight"], ["九", "Nine"], ["十", "Ten"],
  ["侍从", "Page"], ["骑士", "Knight"], ["皇后", "Queen"], ["国王", "King"]
];
const expectedTraditional = [
  ...majorNames.map(([nameZh, nameEn], index) => ({
    id: `major-${String(index).padStart(2, "0")}`,
    group: "major",
    index,
    nameZh,
    nameEn
  })),
  ...minorSuits.flatMap(([group, suitZh, suitEn]) =>
    minorRanks.map(([rankZh, rankEn], rankIndex) => ({
      id: `${group}-${String(rankIndex + 1).padStart(2, "0")}`,
      group,
      index: rankIndex + 1,
      nameZh: `${suitZh}${rankZh}`,
      nameEn: `${rankEn} of ${suitEn}`
    }))
  )
];
for (const [index, expected] of expectedTraditional.entries()) {
  const actual = deck[index];
  if (!actual || ["id", "group", "index", "nameZh", "nameEn"].some((key) => actual[key] !== expected[key])) {
    fail(`第 ${index + 1} 张不符合标准 78 张塔罗命名或顺序：应为 ${expected.id} ${expected.nameZh}`);
  }
  if (actual?.image !== `cards/webp/${expected.id}.webp`) {
    fail(`${expected.id} 的图片路径与落卡 ID 不一致`);
  }
}

for (const card of deck) {
  for (const field of ["id", "nameZh", "nameEn", "reflection", "action", "artBrief", "image"]) {
    if (typeof card[field] !== "string" || !card[field].trim()) fail(`${card.id ?? "unknown"} 缺少 ${field}`);
  }
  if (!Array.isArray(card.keywords) || card.keywords.length !== 3) fail(`${card.id} 应包含 3 个关键词`);
}

const sourceRoots = ["apps/miniapp/src", "packages/deck/src"];
const sourceFiles = [];
const walk = (folder) => {
  for (const entry of readdirSync(join(root, folder), { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) walk(path);
    else if (/\.(ts|tsx|json)$/.test(entry.name)) sourceFiles.push(path);
  }
};
sourceRoots.forEach(walk);
const forbidden = /占卜|算命|运势|牌阵|吉凶|开运|转运|正位|逆位/;
for (const file of sourceFiles) {
  const content = readFileSync(join(root, file), "utf8");
  if (forbidden.test(content)) fail(`用户侧源码含禁用词：${relative(root, join(root, file))}`);
}

const projectConfig = readJson("apps/miniapp/project.config.json");
if (projectConfig.setting?.urlCheck !== true) fail("小程序 release 必须开启合法域名检查");
if (projectConfig.lazyCodeLoading !== "requiredComponents") warn("建议开启组件按需注入");

const apiPackage = readJson("apps/api/package.json");
if (!apiPackage.dependencies?.["@cloudbase/node-sdk"]) fail("后端必须使用 CloudBase Node SDK");
if (apiPackage.dependencies?.["@cloudbase/js-sdk"]) fail("服务端不应使用 CloudBase 浏览器 JS SDK");
if (!apiPackage.dependencies?.effect) fail("后端缺少 Effect 运行时");
if (!readJson("packages/agent/package.json").dependencies?.["@earendil-works/pi-agent-core"]) fail("AI Agent 缺少 Pi Agent Core");

if (!existsSync(join(root, "pnpm-lock.yaml"))) {
  (releaseMode ? fail : warn)("缺少 pnpm-lock.yaml，依赖尚未锁定");
}

const assetManifestPath = join(root, "assets/card-manifest.json");
if (!existsSync(assetManifestPath)) {
  (releaseMode ? fail : warn)("缺少 78 张生产卡面清单 assets/card-manifest.json");
} else {
  const manifest = JSON.parse(readFileSync(assetManifestPath, "utf8"));
  if (!Array.isArray(manifest.cards) || manifest.cards.length !== 78) fail("生产卡面清单必须包含 78 张");
  const manifestIds = new Set((manifest.cards ?? []).map((card) => card.id));
  if (deck.some((card) => !manifestIds.has(card.id))) fail("生产卡面清单与牌库 ID 不一致");
  for (const card of manifest.cards ?? []) {
    const deckCard = deck.find((item) => item.id === card.id);
    if (card.publicPath !== deckCard?.image) fail(`${card.id} 的清单路径与牌库不一致`);
    for (const variant of ["source", "production", "thumbnail"]) {
      const asset = card[variant];
      if (!asset?.path || !existsSync(join(root, asset.path))) {
        fail(`${card.id} 缺少 ${variant} 文件`);
        continue;
      }
      const digest = createHash("sha256").update(readFileSync(join(root, asset.path))).digest("hex");
      if (digest !== asset.sha256) fail(`${card.id} 的 ${variant} 摘要不一致，请重建资源清单`);
    }
  }
}

if (releaseMode) {
  if (!projectConfig.appid || projectConfig.appid === "touristappid") fail("必须写入正式小程序 AppID");
  const required = [
    "CLOUDBASE_ENV_ID",
    "USER_ID_HMAC_SECRET",
    "WECHAT_APP_ID",
    "WECHAT_APP_SECRET",
    "DEEPSEEK_API_KEY",
    "PUBLIC_MODEL_REGISTRATION_NUMBER",
    "CARD_ASSET_BASE_URL",
    "PUBLIC_PRIVACY_URL",
    "PUBLIC_TERMS_URL",
    "PUBLIC_FEEDBACK_URL"
  ];
  for (const key of required) if (!process.env[key]) fail(`release 环境缺少 ${key}`);
  if (process.env.NODE_ENV !== "production") fail("release gate 要求 NODE_ENV=production");
  if (process.env.REPOSITORY_DRIVER !== "cloudbase") fail("release 要求 REPOSITORY_DRIVER=cloudbase");
  if (process.env.SAFETY_DRIVER !== "wechat") fail("release 要求 SAFETY_DRIVER=wechat");
  if (process.env.AI_DRIVER !== "pi") fail("release 要求 AI_DRIVER=pi");
  if (process.env.USER_ID_HMAC_SECRET && process.env.USER_ID_HMAC_SECRET.length < 32) {
    fail("USER_ID_HMAC_SECRET 至少 32 字符");
  }
  for (const key of ["CARD_ASSET_BASE_URL", "PUBLIC_PRIVACY_URL", "PUBLIC_TERMS_URL", "PUBLIC_FEEDBACK_URL"]) {
    if (process.env[key] && !process.env[key].startsWith("https://")) fail(`${key} 必须使用 HTTPS`);
  }
}

for (const message of warnings) console.warn(`WARN  ${message}`);
for (const message of failures) console.error(`FAIL  ${message}`);
if (failures.length > 0) {
  console.error(`\nRelease gate 未通过：${failures.length} 项失败，${warnings.length} 项警告。`);
  process.exit(1);
}
console.log(`Release gate 通过：0 项失败，${warnings.length} 项警告。`);
