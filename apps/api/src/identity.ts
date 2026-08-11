import { createHmac } from "node:crypto";
import type { IncomingHttpHeaders } from "node:http";
import { Effect } from "effect";
import type { AppConfig } from "./config.js";
import { AuthenticationRequired } from "./errors.js";

export interface Actor {
  readonly id: string;
  readonly platform: "wechat" | "development";
  readonly clientPlatform: string;
  readonly platformUserId?: string | undefined;
}

const firstHeader = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

export const resolveActor = (
  headers: IncomingHttpHeaders,
  config: AppConfig
): Effect.Effect<Actor, AuthenticationRequired> => {
  const openId = firstHeader(headers["x-wx-openid"]);
  const appId = firstHeader(headers["x-wx-appid"]);
  const clientPlatform = firstHeader(headers["x-wx-platform"]) ?? "unknown";

  if (openId && appId) {
    const id = `u_${createHmac("sha256", config.userIdHmacSecret)
      .update(`${appId}:${openId}`)
      .digest("hex")
      .slice(0, 40)}`;
    return Effect.succeed({ id, platform: "wechat", clientPlatform, platformUserId: openId });
  }

  if (config.environment !== "production") {
    const devId = firstHeader(headers["x-dev-user-id"]) ?? "local-anonymous";
    const id = `dev_${createHmac("sha256", config.userIdHmacSecret)
      .update(devId)
      .digest("hex")
      .slice(0, 24)}`;
    return Effect.succeed({ id, platform: "development", clientPlatform: "devtools" });
  }

  return Effect.fail(new AuthenticationRequired({
    message: "请从微信小程序内重新进入。"
  }));
};
