import type { PublicConfig } from "@heart-mirror/contracts";
import { Context, Layer } from "effect";

export type RepositoryDriver = "memory" | "cloudbase";
export type SafetyDriver = "local" | "wechat";
export type ModelAuthMode = "api-key" | "provider";

export interface AppConfig {
  readonly environment: "development" | "test" | "production";
  readonly host: string;
  readonly port: number;
  readonly repositoryDriver: RepositoryDriver;
  readonly safetyDriver: SafetyDriver;
  readonly cloudBaseEnvId: string;
  readonly userIdHmacSecret: string;
  readonly wechatAppId: string;
  readonly wechatAppSecret: string;
  readonly aiDriver: "fake" | "pi";
  readonly modelProviderId: string;
  readonly modelAuthMode: ModelAuthMode;
  readonly modelApiKey: string;
  readonly modelId: string;
  readonly modelBaseUrl: string;
  readonly modelName: string;
  readonly modelProvider: string;
  readonly modelRegistrationNumber: string;
  readonly promptVersion: string;
  readonly consentVersion: string;
  readonly privacyPolicyVersion: string;
  readonly readingTimeoutMs: number;
  readonly sessionTtlHours: number;
  readonly dailyReflectionLimit: number;
  readonly cardAssetBaseUrl: string;
  readonly privacyUrl: string;
  readonly termsUrl: string;
  readonly feedbackUrl: string;
}

export class AppConfigService extends Context.Tag("@heart-mirror/AppConfig")<
  AppConfigService,
  AppConfig
>() {}

export const makeConfigLayer = (config: AppConfig) => Layer.succeed(AppConfigService, config);

const asEnvironment = (value: string | undefined): AppConfig["environment"] =>
  value === "production" || value === "test" ? value : "development";

const asPositiveInt = (value: string | undefined, fallback: number): number => {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
};

export const loadConfig = (env: NodeJS.ProcessEnv = process.env): AppConfig => {
  const environment = asEnvironment(env.NODE_ENV);
  const repositoryDriver = env.REPOSITORY_DRIVER === "cloudbase" ? "cloudbase" : "memory";
  const safetyDriver = env.SAFETY_DRIVER === "wechat" ? "wechat" : "local";
  const aiDriver = env.AI_DRIVER === "pi" ? "pi" : "fake";
  const modelProviderId = env.PI_PROVIDER?.trim() || "deepseek";
  const modelAuthMode = env.PI_AUTH_MODE === "provider" ? "provider" : "api-key";

  return {
    environment,
    host: env.HOST ?? "0.0.0.0",
    port: asPositiveInt(env.PORT, 8787),
    repositoryDriver,
    safetyDriver,
    cloudBaseEnvId: env.CLOUDBASE_ENV_ID ?? "",
    userIdHmacSecret: env.USER_ID_HMAC_SECRET ?? "local-development-only",
    wechatAppId: env.WECHAT_APP_ID ?? "",
    wechatAppSecret: env.WECHAT_APP_SECRET ?? "",
    aiDriver,
    modelProviderId,
    modelAuthMode,
    modelApiKey: env.PI_API_KEY ?? "",
    modelId: env.PI_MODEL_ID?.trim() || "deepseek-v4-flash",
    modelBaseUrl: env.PI_BASE_URL?.trim() || "",
    modelName: env.PUBLIC_MODEL_NAME?.trim()
      || (aiDriver === "fake" ? "本地固定模板" : (env.PI_MODEL_ID?.trim() || "deepseek-v4-flash")),
    modelProvider: env.PUBLIC_MODEL_PROVIDER?.trim() || (aiDriver === "fake" ? "心镜开发环境" : modelProviderId),
    modelRegistrationNumber: env.PUBLIC_MODEL_REGISTRATION_NUMBER ?? "",
    promptVersion: env.PROMPT_VERSION ?? "reflection-v1",
    consentVersion: env.CONSENT_VERSION ?? "2026-08-07.v1",
    privacyPolicyVersion: env.PRIVACY_POLICY_VERSION ?? "2026-08-07.v1",
    readingTimeoutMs: asPositiveInt(env.READING_TIMEOUT_MS, 25_000),
    sessionTtlHours: asPositiveInt(env.SESSION_TTL_HOURS, 24),
    dailyReflectionLimit: asPositiveInt(env.DAILY_REFLECTION_LIMIT, 1),
    cardAssetBaseUrl: env.CARD_ASSET_BASE_URL ?? (environment !== "production" ? "http://127.0.0.1:8787/assets" : ""),
    privacyUrl: env.PUBLIC_PRIVACY_URL ?? "",
    termsUrl: env.PUBLIC_TERMS_URL ?? "",
    feedbackUrl: env.PUBLIC_FEEDBACK_URL ?? ""
  };
};

export const assertProductionConfig = (config: AppConfig): void => {
  if (config.environment !== "production") return;
  const missing: string[] = [];
  if (config.repositoryDriver !== "cloudbase") missing.push("REPOSITORY_DRIVER=cloudbase");
  if (config.safetyDriver !== "wechat") missing.push("SAFETY_DRIVER=wechat");
  if (!config.cloudBaseEnvId) missing.push("CLOUDBASE_ENV_ID");
  if (config.userIdHmacSecret.length < 32) missing.push("USER_ID_HMAC_SECRET(>=32 chars)");
  if (!config.wechatAppId) missing.push("WECHAT_APP_ID");
  if (!config.wechatAppSecret) missing.push("WECHAT_APP_SECRET");
  if (config.aiDriver !== "pi") missing.push("AI_DRIVER=pi");
  if (!config.modelProviderId) missing.push("PI_PROVIDER");
  if (!config.modelId) missing.push("PI_MODEL_ID");
  if (config.modelAuthMode === "api-key" && !config.modelApiKey) missing.push("PI_API_KEY");
  if (config.modelBaseUrl && !config.modelBaseUrl.startsWith("https://")) missing.push("PI_BASE_URL(https)");
  if (!config.modelRegistrationNumber) missing.push("PUBLIC_MODEL_REGISTRATION_NUMBER");
  if (!config.cardAssetBaseUrl.startsWith("https://")) missing.push("CARD_ASSET_BASE_URL(https)");
  if (!config.privacyUrl.startsWith("https://")) missing.push("PUBLIC_PRIVACY_URL(https)");
  if (!config.termsUrl.startsWith("https://")) missing.push("PUBLIC_TERMS_URL(https)");
  if (!config.feedbackUrl.startsWith("https://")) missing.push("PUBLIC_FEEDBACK_URL(https)");
  if (missing.length > 0) {
    throw new Error(`生产配置不完整：${missing.join("、")}`);
  }
};

export const toPublicConfig = (config: AppConfig): PublicConfig => ({
  productName: "心镜",
  minimumAge: 18,
  consentVersion: config.consentVersion,
  privacyPolicyVersion: config.privacyPolicyVersion,
  shortDisclaimer: "AI 生成的自我觉察内容，仅供反思参考，不预测未来，不替代专业建议。",
  longDisclaimer: "心镜是一款用于心理投射、情绪记录与自我觉察的辅助工具。卡片选择与 AI 生成内容不构成事实判断、未来预测、医疗或心理诊断，也不应替代专业建议。请根据真实情况自主判断；如你正处于紧急危险或有伤害自己或他人的想法，请立即联系当地紧急服务、可信任的人或专业援助机构。",
  aiLabel: "AI 生成",
  model: {
    name: config.modelName,
    provider: config.modelProvider,
    registrationNumber: config.modelRegistrationNumber
  },
  links: {
    privacy: config.privacyUrl,
    terms: config.termsUrl,
    feedback: config.feedbackUrl
  },
  features: {
    cloudSync: config.repositoryDriver === "cloudbase",
    dailyCard: false,
    sharePoster: false,
    reducedMotion: true
  },
  cardAssetBaseUrl: config.cardAssetBaseUrl
});
