import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import { Layer, ManagedRuntime } from "effect";
import { FakeAgentLayer, makeConfiguredPiAgentLayer } from "./agent-service.js";
import { makeCloudBaseLayers } from "./cloudbase-repositories.js";
import { assertProductionConfig, loadConfig, makeConfigLayer } from "./config.js";
import { InMemoryComplianceRepository } from "./compliance-repository.js";
import { InMemoryReadingTaskRepository } from "./reading-task-repository.js";
import { LocalPlatformSafetyLayer, makeWechatPlatformSafetyLayer } from "./platform-safety.js";
import { InMemorySessionRepository } from "./repository.js";
import { makeSafetyLayer } from "./safety-service.js";

loadDotenv({
  path: fileURLToPath(new URL("../../../.env", import.meta.url)),
  quiet: true
});

export const appConfig = loadConfig();
assertProductionConfig(appConfig);

const agentLayer = appConfig.aiDriver === "pi"
  ? makeConfiguredPiAgentLayer({
      modelId: appConfig.modelId,
      timeoutMs: appConfig.readingTimeoutMs,
      ...(appConfig.modelApiKey ? { apiKey: appConfig.modelApiKey } : {})
    })
  : FakeAgentLayer;

const cloudBaseLayers = appConfig.repositoryDriver === "cloudbase"
  ? makeCloudBaseLayers(appConfig)
  : undefined;
const sessionLayer = cloudBaseLayers?.sessionLayer ?? InMemorySessionRepository;
const complianceLayer = cloudBaseLayers?.complianceLayer ?? InMemoryComplianceRepository;
const readingTaskLayer = cloudBaseLayers?.readingTaskLayer ?? InMemoryReadingTaskRepository;
const platformSafetyLayer = appConfig.safetyDriver === "wechat"
  ? makeWechatPlatformSafetyLayer(appConfig)
  : LocalPlatformSafetyLayer;
const safetyDependencies = Layer.merge(complianceLayer, platformSafetyLayer);
const safetyLayer = makeSafetyLayer(appConfig).pipe(Layer.provide(safetyDependencies));

export const AppLayer = Layer.mergeAll(
  makeConfigLayer(appConfig),
  sessionLayer,
  complianceLayer,
  readingTaskLayer,
  platformSafetyLayer,
  safetyLayer,
  agentLayer
);
export const appRuntime = ManagedRuntime.make(AppLayer);
