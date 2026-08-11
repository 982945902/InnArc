import { Button, Image, ScrollView, Text, View } from "@tarojs/components";
import { deckData, type CardGroup } from "@heart-mirror/deck";
import { useMemo, useState } from "react";
import { resolveCardAssetUrl } from "../../lib/card-assets";
import { useMirrorStore } from "../../lib/store";
import "./index.scss";

const filters: readonly { readonly id: "all" | CardGroup; readonly label: string }[] = [
  { id: "all", label: "全部 78" },
  { id: "major", label: "大阿尔卡那 22" },
  { id: "wands", label: "权杖 14" },
  { id: "cups", label: "圣杯 14" },
  { id: "swords", label: "宝剑 14" },
  { id: "pentacles", label: "星币 14" }
];

export default function DeckPage() {
  const [filter, setFilter] = useState<"all" | CardGroup>("all");
  const cardAssetBaseUrl = useMirrorStore((state) => state.config?.cardAssetBaseUrl);
  const cards = useMemo(
    () => filter === "all" ? deckData : deckData.filter((card) => card.group === filter),
    [filter]
  );

  return (
    <View className="subpage deck-page">
      <Text className="sub-eyebrow">HEART MIRROR · 78 CARDS</Text>
      <Text className="sub-title">卡片图鉴</Text>
      <Text className="sub-copy">每张卡都提供一个观察角度，不代表结论，也不预测未来。</Text>
      <ScrollView className="filter-scroll" scrollX showScrollbar={false}>
        <View className="filter-row">
          {filters.map((item) => (
            <Button
              key={item.id}
              className={`filter-button ${filter === item.id ? "active" : ""}`}
              onTap={() => setFilter(item.id)}
            >
              {item.label}
            </Button>
          ))}
        </View>
      </ScrollView>
      <View className="card-grid">
        {cards.map((card) => (
          <View className="atlas-card" key={card.id}>
            <View className="atlas-art">
              {resolveCardAssetUrl(card.image, cardAssetBaseUrl)
                ? <Image
                    className="atlas-image"
                    src={resolveCardAssetUrl(card.image, cardAssetBaseUrl)!}
                    mode="aspectFit"
                    lazyLoad
                  />
                : <Text className="atlas-symbol">✦</Text>}
              {resolveCardAssetUrl(card.image, cardAssetBaseUrl) && <Text className="atlas-card-label">{card.nameZh}</Text>}
            </View>
            <Text className="atlas-name">{card.nameZh}</Text>
            <Text className="atlas-en">{card.nameEn}</Text>
            <View className="keyword-row">
              {card.keywords.map((keyword) => <Text key={keyword}>{keyword}</Text>)}
            </View>
            <Text className="atlas-prompt">{card.reflection}</Text>
            <Text className="atlas-action">可尝试：{card.action}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}
