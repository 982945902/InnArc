import { Agent, type AgentTool } from "@earendil-works/pi-agent-core";
import { Type, type Api, type Model, type Models, type TSchema } from "@earendil-works/pi-ai";
import { builtinModels } from "@earendil-works/pi-ai/providers/all";
import type { Clarification, ReadingDraft, Spread } from "@heart-mirror/contracts";
import { clarificationPrompt, readingPrompt, spreadPrompt, SYSTEM_PROMPT } from "./prompts.js";
import type { ClarificationInput, ReadingInput, ReflectionAgent, SpreadInput } from "./types.js";

const ChoiceOutput = Type.Object({ id: Type.String(), label: Type.String() });
const ClarificationOutput = Type.Object({
  round: Type.Integer({ minimum: 1, maximum: 3 }),
  question: Type.String(),
  choices: Type.Array(ChoiceOutput, { minItems: 2, maxItems: 4 }),
  allowFreeText: Type.Boolean()
});
const SpreadOutput = Type.Object({
  id: Type.String(),
  name: Type.String(),
  reason: Type.String(),
  positions: Type.Array(Type.Object({
    id: Type.String(),
    index: Type.Integer({ minimum: 0 }),
    name: Type.String(),
    prompt: Type.String()
  }), { minItems: 1, maxItems: 5 })
});
const ReadingOutput = Type.Object({
  summary: Type.String(),
  cards: Type.Array(Type.Object({
    cardId: Type.String(),
    positionName: Type.String(),
    title: Type.String(),
    interpretation: Type.String(),
    reflectionQuestion: Type.String()
  }), { minItems: 1, maxItems: 5 }),
  actions: Type.Array(Type.String(), { minItems: 1, maxItems: 3 })
});

export interface PiAgentConfig {
  readonly providerId: string;
  readonly modelId: string;
  readonly apiKey?: string;
  readonly baseUrl?: string;
}

export class PiReflectionAgent implements ReflectionAgent {
  readonly #config: PiAgentConfig;
  readonly #models: Models;
  readonly #model: Model<Api>;

  constructor(config: PiAgentConfig) {
    this.#config = config;
    this.#models = builtinModels();

    const provider = this.#models.getProvider(config.providerId);
    if (!provider) {
      throw new Error(`Pi 未找到模型供应商：${config.providerId}`);
    }

    const model = this.#models.getModel(config.providerId, config.modelId);
    if (!model) {
      const examples = this.#models.getModels(config.providerId)
        .slice(0, 5)
        .map((candidate) => candidate.id)
        .join("、");
      const hint = examples ? `；可用模型示例：${examples}` : "";
      throw new Error(`Pi 未找到模型：${config.providerId}/${config.modelId}${hint}`);
    }

    this.#model = config.baseUrl ? { ...model, baseUrl: config.baseUrl } : model;
  }

  clarify(input: ClarificationInput, signal?: AbortSignal): Promise<Clarification> {
    return this.#run<Clarification>("emit_clarification", ClarificationOutput, clarificationPrompt(input), signal)
      .then((result) => {
        if (result.round !== input.round) throw new Error("Pi 返回了错误的追问轮次");
        return result;
      });
  }

  async recommendSpread(input: SpreadInput, signal?: AbortSignal): Promise<Spread> {
    const result = await this.#run<Spread>("emit_spread", SpreadOutput, spreadPrompt(input), signal);
    if (![1, 3, 5].includes(result.positions.length)) {
      throw new Error("Pi 返回的觉察结构必须是 1、3 或 5 张");
    }
    return result;
  }

  async read(input: ReadingInput, signal?: AbortSignal): Promise<ReadingDraft> {
    const result = await this.#run<ReadingDraft>("emit_reading", ReadingOutput, readingPrompt(input), signal);
    const expectedIds = input.cards.map((card) => card.id);
    const actualIds = result.cards.map((card) => card.cardId);
    if (expectedIds.length !== actualIds.length || expectedIds.some((id, index) => id !== actualIds[index])) {
      throw new Error("Pi 解读中的卡牌与服务端抽牌事实不一致");
    }
    return result;
  }

  async #run<T>(toolName: string, schema: TSchema, prompt: string, signal?: AbortSignal): Promise<T> {
    let emitted: T | undefined;
    const tool: AgentTool = {
      name: toolName,
      label: "提交结构化结果",
      description: "提交本轮的最终结构化结果；调用后立即结束。",
      parameters: schema,
      executionMode: "sequential",
      execute: async (_toolCallId, params) => {
        emitted = params as T;
        return {
          content: [{ type: "text", text: "结构化结果已接收" }],
          details: { accepted: true },
          terminate: true
        };
      }
    };

    const apiKey = this.#config.apiKey;
    const agent = new Agent({
      initialState: {
        systemPrompt: SYSTEM_PROMPT,
        model: this.#model,
        thinkingLevel: "off",
        tools: [tool],
        messages: []
      },
      streamFn: this.#models.streamSimple.bind(this.#models),
      toolExecution: "sequential",
      ...(apiKey
        ? {
            getApiKey: async (providerId: string) =>
              providerId === this.#config.providerId ? apiKey : undefined
          }
        : {}),
      beforeToolCall: async ({ toolCall }) =>
        toolCall.name === toolName
          ? undefined
          : { block: true, reason: "该工具未列入本轮白名单" }
    });

    const abort = (): void => agent.abort();
    signal?.addEventListener("abort", abort, { once: true });
    try {
      await agent.prompt(prompt);
    } finally {
      signal?.removeEventListener("abort", abort);
    }

    if (emitted === undefined) throw new Error(`Pi Agent 未调用 ${toolName}`);
    return emitted;
  }
}
