import { describe, expect, it } from "vitest";
import { PiReflectionAgent } from "../src/pi-agent.js";

describe("PiReflectionAgent model catalog", () => {
  it.each([
    ["deepseek", "deepseek-v4-flash"],
    ["anthropic", "claude-sonnet-4-5"],
    ["openai", "gpt-4o-mini"],
    ["zai", "glm-4.7"],
    ["moonshotai-cn", "kimi-k2.5"]
  ])("resolves %s/%s from Pi built-ins", (providerId, modelId) => {
    expect(() => new PiReflectionAgent({ providerId, modelId })).not.toThrow();
  });

  it("fails fast when the provider is unknown", () => {
    expect(() => new PiReflectionAgent({
      providerId: "not-a-provider",
      modelId: "not-a-model"
    })).toThrow(/Pi 未找到模型供应商/);
  });

  it("fails fast when the model is absent from the selected provider", () => {
    expect(() => new PiReflectionAgent({
      providerId: "deepseek",
      modelId: "not-a-model"
    })).toThrow(/Pi 未找到模型/);
  });
});
