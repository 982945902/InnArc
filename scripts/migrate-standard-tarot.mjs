import { readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const deckPath = resolve(root, "packages/deck/src/deck-data.json");
const deck = JSON.parse(readFileSync(deckPath, "utf8"));

const majors = [
  ["愚者", "The Fool", "年轻旅人站在悬崖边，肩背行囊，白犬相伴，白玫瑰与远山保留经典象征。"],
  ["魔术师", "The Magician", "魔术师在花园祭台前举起权杖，桌上清楚陈列权杖、圣杯、宝剑与星币，玫瑰和百合环绕。"],
  ["女祭司", "The High Priestess", "女祭司端坐于黑白双柱之间，身后是石榴帷幕，脚边新月，手持卷轴。"],
  ["皇后", "The Empress", "皇后坐在丰饶花园与麦田之间，星冠、石榴衣袍和爱心盾牌保留经典象征。"],
  ["皇帝", "The Emperor", "皇帝端坐于山岩前的石座，座椅饰有公羊纹样，手持权杖与圆球，红袍庄重。"],
  ["教皇", "The Hierophant", "教皇在双柱之间向两位学习者传授知识，交叉钥匙与三层冠保留经典构图。"],
  ["恋人", "The Lovers", "两位人物在花园中坦诚相对，中央由太阳与温和守护形象连接，背后有两棵象征选择的树。"],
  ["战车", "The Chariot", "战车驾驭者站在星幕车中，由一黑一白两只斯芬克斯引导，城池在后，道路向前。"],
  ["力量", "Strength", "身着白衣的人温柔合拢狮子的嘴，头顶无限花环，展现柔韧而非制服。"],
  ["隐士", "The Hermit", "隐士披灰袍立于雪山之巅，提六芒星灯并持长杖，向下照亮道路。"],
  ["命运之轮", "Wheel of Fortune", "巨大的金色命运之轮位于云间，四角书卷守护者与轮缘生物构成经典象征。"],
  ["正义", "Justice", "正义端坐于红色帷幕前，一手持直剑、一手持天平，双柱构图稳定对称。"],
  ["倒吊人", "The Hanged Man", "人物以一只脚安全悬挂在活木横架上，另一腿弯曲成形，神情平静，头部有柔和金光。"],
  ["死神", "Death", "披黑甲的骷髅骑白马缓步穿过旧阶段的终点，远方双塔之间太阳升起，白玫瑰旗帜象征转化。"],
  ["节制", "Temperance", "有翼人物一脚立地一脚入水，在两只圣杯之间平稳倒水，远方道路通向日光。"],
  ["恶魔", "The Devil", "带角的经典恶魔形象立于石座，两位人物颈间松链清楚可解，火把与倒五角星保留传统象征。"],
  ["高塔", "The Tower", "闪电击中高塔之冠，两个人物从塔侧坠向柔软云层，火花四散，表达突变而避免伤害细节。"],
  ["星星", "The Star", "人物跪在池边，以两只水罐浇灌水面与土地，天空一颗大星与七颗小星清晰可见。"],
  ["月亮", "The Moon", "月亮俯照双塔之间的蜿蜒小路，狗与狼分立两侧，螯虾从池水中出现。"],
  ["太阳", "The Sun", "快乐孩童骑白马穿过向日葵花墙，手持红旗，巨大太阳在上方放射光芒。"],
  ["审判", "Judgement", "天使在云中吹响号角，人们从象征旧阶段的方形容器中起身回应，远山与海面开阔。"],
  ["世界", "The World", "舞者位于椭圆月桂花环中央，手持双杖，四角呈现人、鹰、狮与牛的经典象征。"]
];

const suitMeta = {
  ember: { group: "wands", zh: "权杖", en: "Wands" },
  tide: { group: "cups", zh: "圣杯", en: "Cups" },
  breeze: { group: "swords", zh: "宝剑", en: "Swords" },
  earth: { group: "pentacles", zh: "星币", en: "Pentacles" }
};

const rankNames = [
  ["王牌", "Ace"], ["二", "Two"], ["三", "Three"], ["四", "Four"],
  ["五", "Five"], ["六", "Six"], ["七", "Seven"], ["八", "Eight"],
  ["九", "Nine"], ["十", "Ten"], ["侍从", "Page"], ["骑士", "Knight"],
  ["皇后", "Queen"], ["国王", "King"]
];

const swordBriefs = [
  "一只手从云中托起直立宝剑，剑尖穿过王冠与月桂花环，群山在远方。",
  "蒙眼人物背向海面坐着，双手交叉持两把宝剑，新月悬于天空。",
  "红色心形象征被三把宝剑穿过，雨云低垂，不出现血液或人体伤害。",
  "人物安静平卧于纪念长椅，三把宝剑固定在墙面，一把位于长椅侧面，彩窗投下柔光。",
  "一人手持三把宝剑回望，两把宝剑留在地面，两人沿海岸离开，天空多云。",
  "船夫载一名披斗篷者与孩子渡河，六把宝剑竖直固定在船头，远岸平静。",
  "人物从营地带走五把宝剑并回望，另外两把留在原处，动作谨慎。",
  "蒙眼人物被松散布带环绕，八把宝剑插在泥地形成开放围栏，远处城堡可见。",
  "夜里人物从床上坐起掩面，墙面依次悬挂九把宝剑，床被饰有星座与花纹。",
  "人物俯卧在黎明海岸，十把宝剑构成高度图案化的结束象征，远方太阳升起，无血液。",
  "宝剑侍从双手持剑站在风吹高地，云层快速移动，姿态警觉好奇。",
  "宝剑骑士骑白马迎风前行，高举宝剑，乌云被强风吹散，避免战斗场面。",
  "宝剑皇后端坐于云层高地，右手持直剑、左手向前伸出，蝴蝶与风纹装饰王座。",
  "宝剑国王端坐于开阔天空下，直剑向上，树木被风吹动，神情理性坚定。"
];

const migrated = deck.map((card) => {
  if (card.id.startsWith("major-")) {
    const [nameZh, nameEn, artBrief] = majors[card.index];
    return { ...card, group: "major", nameZh, nameEn, artBrief, image: `cards/webp/${card.id}.webp` };
  }
  const meta = suitMeta[card.group];
  if (!meta) throw new Error(`未知旧牌组：${card.group}`);
  const id = `${meta.group}-${String(card.index).padStart(2, "0")}`;
  const [rankZh, rankEn] = rankNames[card.index - 1];
  return {
    ...card,
    id,
    group: meta.group,
    nameZh: `${meta.zh}${rankZh}`,
    nameEn: `${rankEn} of ${meta.en}`,
    artBrief: meta.group === "swords" ? swordBriefs[card.index - 1] : card.artBrief,
    image: `cards/webp/${id}.webp`
  };
});

writeFileSync(deckPath, `${JSON.stringify(migrated, null, 2)}\n`);
console.log(`Migrated ${migrated.length} cards to the standard tarot taxonomy.`);
