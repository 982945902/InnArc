import { Text, View, WebView } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect } from "react";
import { useMirrorStore } from "../../lib/store";
import "./index.scss";

type LegalPageType = "privacy" | "terms" | "feedback";

const isLegalPageType = (value: string | undefined): value is LegalPageType =>
  value === "privacy" || value === "terms" || value === "feedback";

export default function LegalPage() {
  const { initialized, config, initialize } = useMirrorStore();
  const requestedType = Taro.getCurrentInstance().router?.params.type;
  const type = isLegalPageType(requestedType) ? requestedType : "privacy";
  const url = config?.links[type];

  useEffect(() => {
    if (!initialized) void initialize();
  }, [initialize, initialized]);

  if (!url?.startsWith("https://")) {
    return (
      <View className="legal-empty">
        <Text>正式政策页面尚未配置，请返回后通过内容反馈联系我们。</Text>
      </View>
    );
  }

  return <WebView src={url} />;
}
