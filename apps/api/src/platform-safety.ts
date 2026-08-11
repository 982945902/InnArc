import { Context, Effect, Layer, Ref } from "effect";
import type { AppConfig } from "./config.js";
import { PersistenceFailure } from "./errors.js";

export type PlatformSafetyDecision = "pass" | "review" | "reject";

export interface PlatformSafetyServiceShape {
  readonly checkText: (text: string, platformUserId?: string) => Effect.Effect<PlatformSafetyDecision, PersistenceFailure>;
}

export class PlatformSafetyService extends Context.Tag("@heart-mirror/PlatformSafetyService")<
  PlatformSafetyService,
  PlatformSafetyServiceShape
>() {}

export const LocalPlatformSafetyLayer = Layer.succeed(PlatformSafetyService, {
  checkText: () => Effect.succeed("pass" as const)
});

interface CachedToken {
  readonly value: string;
  readonly expiresAt: number;
}

interface WechatTokenResponse {
  readonly access_token?: string;
  readonly expires_in?: number;
  readonly errcode?: number;
  readonly errmsg?: string;
}

interface WechatSafetyResponse {
  readonly errcode?: number;
  readonly errmsg?: string;
  readonly result?: { readonly suggest?: "pass" | "review" | "risky" };
}

export const makeWechatPlatformSafetyLayer = (config: AppConfig) =>
  Layer.effect(
    PlatformSafetyService,
    Effect.gen(function* () {
      const tokenRef = yield* Ref.make<CachedToken | undefined>(undefined);

      const getAccessToken = Effect.gen(function* () {
        const cached = yield* Ref.get(tokenRef);
        if (cached && cached.expiresAt > Date.now() + 60_000) return cached.value;

        const token = yield* Effect.tryPromise({
          try: async () => {
            const url = new URL("https://api.weixin.qq.com/cgi-bin/token");
            url.searchParams.set("grant_type", "client_credential");
            url.searchParams.set("appid", config.wechatAppId);
            url.searchParams.set("secret", config.wechatAppSecret);
            const response = await fetch(url, { signal: AbortSignal.timeout(5_000) });
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json() as Promise<WechatTokenResponse>;
          },
          catch: (cause) => new PersistenceFailure({
            operation: "wechat_access_token",
            message: cause instanceof Error ? cause.message : String(cause)
          })
        });

        if (!token.access_token || token.errcode) {
          return yield* new PersistenceFailure({
            operation: "wechat_access_token",
            message: `微信访问令牌获取失败：${token.errcode ?? "unknown"}`
          });
        }
        const cachedToken = {
          value: token.access_token,
          expiresAt: Date.now() + Math.max(300, token.expires_in ?? 7_200) * 1_000
        };
        yield* Ref.set(tokenRef, cachedToken);
        return cachedToken.value;
      });

      return {
        checkText: (text, platformUserId) =>
          Effect.gen(function* () {
            if (!platformUserId) {
              return yield* new PersistenceFailure({
                operation: "wechat_msg_sec_check",
                message: "生产内容审核缺少可信微信用户标识"
              });
            }
            const token = yield* getAccessToken;
            const result = yield* Effect.tryPromise({
              try: async () => {
                const response = await fetch(
                  `https://api.weixin.qq.com/wxa/msg_sec_check?access_token=${encodeURIComponent(token)}`,
                  {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ content: text, version: 2, scene: 2, openid: platformUserId }),
                    signal: AbortSignal.timeout(6_000)
                  }
                );
                if (!response.ok) throw new Error(`HTTP ${response.status}`);
                return response.json() as Promise<WechatSafetyResponse>;
              },
              catch: (cause) => new PersistenceFailure({
                operation: "wechat_msg_sec_check",
                message: cause instanceof Error ? cause.message : String(cause)
              })
            });
            if (result.errcode) {
              return yield* new PersistenceFailure({
                operation: "wechat_msg_sec_check",
                message: `微信内容审核失败：${result.errcode}`
              });
            }
            const suggest = result.result?.suggest;
            return suggest === "pass" ? "pass" : suggest === "review" ? "review" : "reject";
          })
      } satisfies PlatformSafetyServiceShape;
    })
  );
