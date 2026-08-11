import { Button, Picker, Switch, Text, Textarea, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import type { SafetyFeedbackResponse } from "@heart-mirror/contracts";
import { request } from "../../lib/api";
import { clearAllLocalData } from "../../lib/local-data";
import { useMirrorStore } from "../../lib/store";
import "./index.scss";

const categories = [
  { value: "harmful", label: "内容让我不适" },
  { value: "inaccurate", label: "内容不准确" },
  { value: "privacy", label: "隐私相关问题" },
  { value: "other", label: "其他建议" }
] as const;

export default function AboutPage() {
  const { initialized, config, reducedMotion, initialize, setReducedMotion, startNew } = useMirrorStore();
  const [categoryIndex, setCategoryIndex] = useState(0);
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const selectedCategory = categories[categoryIndex] ?? categories[0]!;

  useEffect(() => {
    if (!initialized) void initialize();
  }, [initialize, initialized]);

  const sendFeedback = async () => {
    setSending(true);
    try {
      await request<SafetyFeedbackResponse>("POST", "/v1/safety/feedback", {
        category: selectedCategory.value,
        ...(message.trim() ? { message: message.trim() } : {})
      });
      setMessage("");
      await Taro.showToast({ title: "已收到，谢谢你", icon: "success" });
    } catch (cause) {
      await Taro.showToast({ title: cause instanceof Error ? cause.message : "发送失败", icon: "none" });
    } finally {
      setSending(false);
    }
  };

  const clearData = async () => {
    const result = await Taro.showModal({ title: "清除本机数据？", content: "同意记录、进行中的流程、历史与偏好都会删除。", confirmColor: "#955951" });
    if (!result.confirm) return;
    clearAllLocalData();
    startNew();
    await Taro.showToast({ title: "已清除", icon: "success" });
  };

  return (
    <View className={`subpage about-page ${reducedMotion ? "reduced-motion" : ""}`}>
      <Text className="sub-eyebrow">ABOUT · SAFETY · PRIVACY</Text>
      <Text className="sub-title">关于心镜</Text>
      <Text className="sub-copy">心镜是一款心理投射、情绪梳理与自我觉察工具。卡片与 AI 提供的是观察角度，而不是事实判断或人生决定。</Text>

      <View className="info-card">
        <Text className="info-title">使用边界</Text>
        <Text className="info-copy">{config?.longDisclaimer ?? "内容仅用于自我觉察，不构成医疗、法律、财务或其他专业建议。"}</Text>
        <Text className="info-copy">如果你或他人正处于即时危险中，请停止使用并立即联系当地紧急服务或可信任的人。</Text>
      </View>

      <View className="info-card">
        <Text className="info-title">AI 信息</Text>
        <View className="info-row"><Text>内容标识</Text><Text>{config?.aiLabel ?? "AI 辅助生成"}</Text></View>
        <View className="info-row"><Text>模型</Text><Text>{config?.model.name ?? "加载中"}</Text></View>
        <View className="info-row"><Text>服务方</Text><Text>{config?.model.provider ?? "加载中"}</Text></View>
        <View className="info-row"><Text>备案信息</Text><Text>{config?.model.registrationNumber || "上线前公示"}</Text></View>
      </View>

      <View className="info-card">
        <Text className="info-title">隐私说明</Text>
        <Text className="info-copy">历史结果与私密笔记默认只保存在当前设备，最多 50 条。问题文本会发送给服务端进行安全检查与内容生成；安全日志只保存脱敏摘要、规则和时间，不保存你的原文。</Text>
        <Text className="info-copy">你可以随时在下方清除本机数据。服务端审计记录按上线隐私政策约定期限保存。</Text>
        <View className="policy-links">
          <Button onTap={() => Taro.navigateTo({ url: "/pages/legal/index?type=privacy" })}>隐私政策</Button>
          <Button onTap={() => Taro.navigateTo({ url: "/pages/legal/index?type=terms" })}>服务协议</Button>
        </View>
      </View>

      <View className="setting-card">
        <View>
          <Text className="info-title">减少动态效果</Text>
          <Text className="setting-copy">缩短翻牌与过渡动效</Text>
        </View>
        <Switch color="#17382f" checked={reducedMotion} onChange={(event) => setReducedMotion(event.detail.value)} />
      </View>

      <View className="info-card feedback-card">
        <Text className="info-title">内容反馈</Text>
        <Picker mode="selector" range={categories.map((item) => item.label)} value={categoryIndex} onChange={(event) => setCategoryIndex(Number(event.detail.value))}>
          <View className="picker-value">{selectedCategory.label} 〉</View>
        </Picker>
        <Textarea maxlength={500} value={message} onInput={(event) => setMessage(event.detail.value)} placeholder="可选：补充说明（请勿填写姓名、电话等隐私信息）" />
        <Button loading={sending} disabled={sending} onTap={sendFeedback}>发送反馈</Button>
      </View>

      <Button className="danger-button" onTap={clearData}>清除全部本机数据</Button>
      <Text className="version-copy">心镜 · 隐私版本 {config?.privacyPolicyVersion ?? "—"} · 同意版本 {config?.consentVersion ?? "—"}</Text>
    </View>
  );
}
