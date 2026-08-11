import { describe, expect, it } from "vitest";
import { assertProductionConfig, loadConfig } from "../src/config.js";

const productionEnv = {
  NODE_ENV: "production",
  REPOSITORY_DRIVER: "cloudbase",
  SAFETY_DRIVER: "wechat",
  CLOUDBASE_ENV_ID: "cloudbase-env",
  USER_ID_HMAC_SECRET: "a-secure-secret-that-is-longer-than-32-characters",
  WECHAT_APP_ID: "wx-app-id",
  WECHAT_APP_SECRET: "wx-app-secret",
  AI_DRIVER: "pi",
  PUBLIC_MODEL_NAME: "Claude Sonnet",
  PUBLIC_MODEL_PROVIDER: "Anthropic",
  PUBLIC_MODEL_REGISTRATION_NUMBER: "registration-number",
  CARD_ASSET_BASE_URL: "https://cdn.example.com/assets",
  PUBLIC_PRIVACY_URL: "https://example.com/privacy",
  PUBLIC_TERMS_URL: "https://example.com/terms",
  PUBLIC_FEEDBACK_URL: "https://example.com/feedback"
} satisfies NodeJS.ProcessEnv;

describe("multi-provider model config", () => {
  it("loads provider, model, generic key and gateway independently from DeepSeek", () => {
    const config = loadConfig({
      PI_PROVIDER: "anthropic",
      PI_MODEL_ID: "claude-sonnet-4-5",
      PI_AUTH_MODE: "api-key",
      PI_API_KEY: "test-key",
      PI_BASE_URL: "https://gateway.example.com/v1"
    });

    expect(config.modelProviderId).toBe("anthropic");
    expect(config.modelId).toBe("claude-sonnet-4-5");
    expect(config.modelAuthMode).toBe("api-key");
    expect(config.modelApiKey).toBe("test-key");
    expect(config.modelBaseUrl).toBe("https://gateway.example.com/v1");
  });

  it("does not publish DeepSeek labels when another provider is selected", () => {
    const config = loadConfig({
      AI_DRIVER: "pi",
      PI_PROVIDER: "zai",
      PI_MODEL_ID: "glm-4.7",
      PI_AUTH_MODE: "provider"
    });

    expect(config.modelName).toBe("glm-4.7");
    expect(config.modelProvider).toBe("zai");
  });

  it("allows provider-native authentication in production", () => {
    const config = loadConfig({
      ...productionEnv,
      PI_PROVIDER: "amazon-bedrock",
      PI_MODEL_ID: "global.anthropic.claude-sonnet-4-5-20250929-v1:0",
      PI_AUTH_MODE: "provider"
    });

    expect(() => assertProductionConfig(config)).not.toThrow();
  });

  it("requires the generic key only in api-key mode", () => {
    const config = loadConfig({
      ...productionEnv,
      PI_PROVIDER: "openai",
      PI_MODEL_ID: "gpt-4o-mini",
      PI_AUTH_MODE: "api-key"
    });

    expect(() => assertProductionConfig(config)).toThrow(/PI_API_KEY/);
  });

  it("rejects an insecure production gateway URL", () => {
    const config = loadConfig({
      ...productionEnv,
      PI_PROVIDER: "deepseek",
      PI_MODEL_ID: "deepseek-v4-flash",
      PI_AUTH_MODE: "provider",
      PI_BASE_URL: "http://gateway.example.com/v1"
    });

    expect(() => assertProductionConfig(config)).toThrow(/PI_BASE_URL\(https\)/);
  });
});
