import { FakeReflectionAgent, PiReflectionAgent, type ReflectionAgent } from "@heart-mirror/agent";
import { Context, Duration, Effect, Layer, Schedule } from "effect";
import { AgentFailure } from "./errors.js";

export interface AgentServiceShape {
  readonly agent: ReflectionAgent;
  readonly run: <A>(operation: string, task: (signal: AbortSignal) => Promise<A>) => Effect.Effect<A, AgentFailure>;
}

export class AgentService extends Context.Tag("@heart-mirror/AgentService")<
  AgentService,
  AgentServiceShape
>() {}

const layerFromAgent = (agent: ReflectionAgent, timeoutMs = 8_000) =>
  Layer.succeed(AgentService, {
    agent,
    run: (operation, task) =>
      Effect.tryPromise({
        try: (signal) => task(signal),
        catch: (cause) =>
          new AgentFailure({
            operation,
            message: cause instanceof Error ? cause.message : String(cause)
          })
      }).pipe(
        Effect.timeout(Duration.millis(timeoutMs)),
        Effect.retry(Schedule.recurs(1)),
        Effect.mapError((cause) =>
          cause instanceof AgentFailure
            ? cause
            : new AgentFailure({ operation, message: "模型响应超时" })
        )
      )
  });

export const FakeAgentLayer = layerFromAgent(new FakeReflectionAgent());

export const makePiAgentLayer = (config: {
  readonly providerId: string;
  readonly modelId: string;
  readonly apiKey?: string;
  readonly baseUrl?: string;
}) =>
  layerFromAgent(new PiReflectionAgent(config));

export const makeConfiguredPiAgentLayer = (config: {
  readonly providerId: string;
  readonly modelId: string;
  readonly apiKey?: string;
  readonly baseUrl?: string;
  readonly timeoutMs: number;
}) => layerFromAgent(new PiReflectionAgent(config), config.timeoutMs);
