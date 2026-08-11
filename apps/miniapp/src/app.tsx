import type { PropsWithChildren } from "react";
import Taro, { useLaunch } from "@tarojs/taro";
import "./app.scss";

export default function App({ children }: PropsWithChildren) {
  useLaunch(() => {
    if (process.env.TARO_APP_USE_CLOUDBASE === "true") {
      Taro.cloud.init({
        env: process.env.TARO_APP_CLOUDBASE_ENV ?? "",
        traceUser: true
      });
    }
  });
  return children;
}
