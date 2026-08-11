import type { Clarification, ReadingDraft, Spread } from "@heart-mirror/contracts";
import type { ClarificationInput, ReadingInput, ReflectionAgent, SpreadInput } from "./types.js";

const clarifications: readonly Omit<Clarification, "round">[] = [
  {
    question: "这件事目前最让你卡住的部分是什么？",
    choices: [
      { id: "unclear", label: "看不清方向" },
      { id: "emotion", label: "情绪反复" },
      { id: "action", label: "不知道怎么行动" }
    ],
    allowFreeText: true
  },
  {
    question: "你更希望这次梳理带来哪种帮助？",
    choices: [
      { id: "understand", label: "理解自己" },
      { id: "boundary", label: "看清边界" },
      { id: "step", label: "找到下一步" }
    ],
    allowFreeText: true
  },
  {
    question: "如果只聚焦最近一周，你最想先改变什么？",
    choices: [
      { id: "response", label: "我的反应方式" },
      { id: "communication", label: "沟通方式" },
      { id: "rhythm", label: "生活节奏" }
    ],
    allowFreeText: true
  }
];

export class FakeReflectionAgent implements ReflectionAgent {
  async clarify(input: ClarificationInput): Promise<Clarification> {
    const template = clarifications[input.round - 1] ?? clarifications[2]!;
    return { ...template, round: input.round };
  }

  async recommendSpread(_input: SpreadInput): Promise<Spread> {
    return {
      id: "clarity-action-integration",
      name: "看见 · 行动 · 整合",
      reason: "把当下状态、可控行动与整体提醒放在同一幅图景中。",
      positions: [
        { id: "situation", index: 0, name: "当下", prompt: "此刻最值得被看见的状态" },
        { id: "action", index: 1, name: "行动", prompt: "当前可尝试的低风险行动" },
        { id: "integration", index: 2, name: "整合", prompt: "需要同时照顾的整体视角" }
      ]
    };
  }

  async read(input: ReadingInput): Promise<ReadingDraft> {
    const cards = input.cards.map((card) => ({
      cardId: card.id,
      positionName: card.positionName,
      title: `${card.positionName} · ${card.name}`,
      interpretation: `这张卡把注意力带到“${card.keywords.join("、")}”。你可以观察这些感受或资源是否已经在当下生活中出现。`,
      reflectionQuestion: card.reflection
    }));

    return {
      summary: "把这些牌放在一起，更像是一张当前心理状态的地图：先承认已经存在的感受，再从可控的小步骤里恢复主动感。它不替你预测结果，而是帮助你看见选择。",
      cards,
      actions: input.cards.slice(0, 3).map((card) => card.action)
    };
  }
}
