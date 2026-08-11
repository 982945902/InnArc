import { Button, Text, View } from "@tarojs/components";
import Taro, { useDidShow } from "@tarojs/taro";
import { useState } from "react";
import {
  clearHistory,
  deleteHistory,
  listHistory,
  type HistoryEntry
} from "../../lib/local-data";
import "./index.scss";

const formatDate = (value: string): string => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
};

export default function HistoryPage() {
  const [items, setItems] = useState<readonly HistoryEntry[]>([]);
  const [expanded, setExpanded] = useState<string | undefined>();
  const refresh = () => setItems(listHistory());
  useDidShow(refresh);

  const remove = async (id: string) => {
    const result = await Taro.showModal({ title: "删除这条记录？", content: "删除后无法恢复。", confirmColor: "#955951" });
    if (!result.confirm) return;
    deleteHistory(id);
    refresh();
  };

  const clear = async () => {
    const result = await Taro.showModal({ title: "清空全部记录？", content: "本机保存的全部觉察记录将被删除，且无法恢复。", confirmColor: "#955951" });
    if (!result.confirm) return;
    clearHistory();
    refresh();
  };

  return (
    <View className="subpage history-page">
      <Text className="sub-eyebrow">PRIVATE · ON THIS DEVICE</Text>
      <Text className="sub-title">本机记录</Text>
      <Text className="sub-copy">最多保留 50 条，仅存于当前设备。卸载小程序、清除缓存或主动删除后无法恢复。</Text>
      {items.length === 0 ? (
        <View className="empty-state">这里还没有记录。完成一次觉察后，结果和你的私密笔记会保存在这里。</View>
      ) : (
        <>
          <View className="history-list">
            {items.map((entry) => (
              <View className="history-card" key={entry.id}>
                <Text className="history-date">{formatDate(entry.createdAt)}</Text>
                <Text className="history-question">{entry.question}</Text>
                <View className="history-cards">
                  {entry.session.cards.map((card) => <Text key={card.id}>{card.name}</Text>)}
                </View>
                <Text className="history-summary">{entry.reading.summary}</Text>
                {expanded === entry.id && (
                  <View className="history-detail">
                    {entry.reading.cards.map((card) => (
                      <View key={card.cardId}>
                        <Text className="detail-title">{card.positionName} · {card.title}</Text>
                        <Text className="detail-copy">{card.interpretation}</Text>
                      </View>
                    ))}
                    {entry.note && <Text className="history-note">我的笔记：{entry.note}</Text>}
                    <Text className="history-generation">{entry.reading.generation.label} · {entry.reading.generation.modelName}</Text>
                  </View>
                )}
                <View className="history-actions">
                  <Button onTap={() => setExpanded(expanded === entry.id ? undefined : entry.id)}>
                    {expanded === entry.id ? "收起" : "查看完整内容"}
                  </Button>
                  <Button className="delete" onTap={() => remove(entry.id)}>删除</Button>
                </View>
              </View>
            ))}
          </View>
          <Button className="danger-button clear-button" onTap={clear}>清空全部本机记录</Button>
        </>
      )}
    </View>
  );
}
