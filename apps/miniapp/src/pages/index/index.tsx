import { Button, Image, ScrollView, Text, Textarea, View } from "@tarojs/components";
import Taro from "@tarojs/taro";
import { useEffect, useState } from "react";
import { cardBackAssetUrl, resolveCardAssetUrl } from "../../lib/card-assets";
import { useMirrorStore } from "../../lib/store";
import "./index.scss";

export default function IndexPage() {
  const [question, setQuestion] = useState("");
  const [freeAnswer, setFreeAnswer] = useState("");
  const [note, setNote] = useState("");
  const [flipped, setFlipped] = useState(false);
  const {
    initialized,
    config,
    consentAccepted,
    reducedMotion,
    session,
    slots,
    reading,
    revealedCard,
    loading,
    error,
    support,
    initialize,
    acceptConsent,
    createSession,
    answer,
    shuffle,
    draw,
    generateReading,
    saveNote,
    startNew,
    dismissReveal,
    clearError
  } = useMirrorStore();

  useEffect(() => {
    if (!initialized) void initialize();
  }, [initialize, initialized]);

  useEffect(() => {
    if (!revealedCard) {
      setFlipped(false);
      return;
    }
    const timer = setTimeout(() => setFlipped(true), 90);
    return () => clearTimeout(timer);
  }, [revealedCard]);

  const requiredCount = session?.spread?.positions.length ?? 0;
  const selectedCount = session?.cards.length ?? 0;
  const submitQuestion = async () => {
    if (question.trim().length < 4) return;
    await createSession(question.trim());
  };

  const submitFreeAnswer = async () => {
    if (!freeAnswer.trim()) return;
    const value = freeAnswer.trim();
    setFreeAnswer("");
    await answer(value);
  };

  const cardImageUrl = (path: string): string | undefined =>
    resolveCardAssetUrl(path, config?.cardAssetBaseUrl);
  const cardBackUrl = cardBackAssetUrl(config?.cardAssetBaseUrl);

  if (!initialized) {
    return (
      <View className="page-shell boot-screen">
        <View className="hero">
          <View className="hero-mark">HM</View>
          <Text className="title">心镜</Text>
          <Text className="subtitle">正在准备安全的觉察空间……</Text>
        </View>
        {error && <Text className="boot-error">{error}</Text>}
        {error && <Button className="primary-button" onTap={initialize}>重新连接</Button>}
      </View>
    );
  }

  return (
    <View className={`page-shell ${reducedMotion ? "reduced-motion" : ""}`}>
      <View className="hero">
        <View className="hero-mark">HM</View>
        <Text className="eyebrow">HEART MIRROR · SELF REFLECTION</Text>
        <Text className="title">心镜</Text>
        <Text className="subtitle">让卡牌成为一面镜子，而不是答案。</Text>
      </View>

      <View className="notice">
        <Text>仅用于心理投射、情绪梳理与自我觉察，不预测具体事件，不构成专业建议。</Text>
      </View>

      {error && (
        <View className="error-banner" onTap={clearError}>
          <View>
            <Text>{error}</Text>
            {support && <Text className="support-copy">{support}</Text>}
          </View>
          <Text className="error-close">×</Text>
        </View>
      )}

      <View className="flow-card question-card">
        <View className="step-heading">
          <Text className="step-number">01</Text>
          <View>
            <Text className="step-title">你想看清什么？</Text>
            <Text className="step-hint">尽量描述当下的感受、关系或选择，不必组织得很完整。</Text>
          </View>
        </View>
        {!session ? (
          <>
            <View className="question-templates">
              {[
                "我此刻最需要看见什么？",
                "这件事中，哪些部分在我的掌控中？",
                "我可以怎样照顾自己的边界？",
                "下一步可以尝试什么小行动？"
              ].map((template) => (
                <Button key={template} className="template-button" onTap={() => setQuestion(template)}>
                  {template}
                </Button>
              ))}
            </View>
            <Textarea
              className="question-input"
              maxlength={120}
              value={question}
              onInput={(event) => setQuestion(event.detail.value)}
              placeholder="例如：我对换工作既期待又不安，真正担心的是什么？"
            />
            <Button
              className="primary-button"
              loading={loading}
              disabled={question.trim().length < 4 || loading}
              onTap={submitQuestion}
            >
              开始梳理
            </Button>
          </>
        ) : (
          <View className="question-summary">
            <Text>{session.question}</Text>
          </View>
        )}
      </View>

      {session?.status === "clarifying" && session.clarification && (
        <View className="flow-card clarification-card">
          <View className="step-heading">
            <Text className="step-number">02</Text>
            <View>
              <Text className="step-title">再靠近一点</Text>
              <Text className="step-hint">第 {session.clarification.round} 轮 · 通常会追问 2–3 轮</Text>
            </View>
          </View>
          <Text className="clarification-question">{session.clarification.question}</Text>
          <View className="choice-list">
            {session.clarification.choices.map((choice) => (
              <Button
                key={choice.id}
                className="choice-button"
                disabled={loading}
                onTap={() => answer(choice.label)}
              >
                {choice.label}
              </Button>
            ))}
          </View>
          {session.clarification.allowFreeText && (
            <View className="free-answer">
              <Textarea
                maxlength={300}
                value={freeAnswer}
                onInput={(event) => setFreeAnswer(event.detail.value)}
                placeholder="也可以用自己的话回答"
              />
              <Button disabled={!freeAnswer.trim() || loading} onTap={submitFreeAnswer}>发送</Button>
            </View>
          )}
        </View>
      )}

      {session?.spread && (
        <View className="flow-card spread-card">
          <View className="step-heading">
            <Text className="step-number">03</Text>
            <View>
              <Text className="step-title">为这个问题准备的觉察结构</Text>
              <Text className="step-hint">根据你的问题直接给出，无需再进入选择页。</Text>
            </View>
          </View>
          <Text className="spread-name">{session.spread.name}</Text>
          <Text className="spread-reason">{session.spread.reason}</Text>
          <View className="position-grid">
            {session.spread.positions.map((position) => {
              const card = session.cards.find((item) => item.positionId === position.id);
              return (
                <View className={`position-slot ${card ? "has-card" : ""}`} key={position.id}>
                  {card ? (
                    <>
                      {cardImageUrl(card.image) && <Image className="slot-card-image" src={cardImageUrl(card.image)!} mode="aspectFit" />}
                      <Text className="card-real-name">{card.name}</Text>
                      <Text className="card-en-name">{card.nameEn}</Text>
                    </>
                  ) : (
                    <Text className="slot-index">{String(position.index + 1).padStart(2, "0")}</Text>
                  )}
                  <Text className="position-name">位置 · {position.name}</Text>
                  <Text className="position-prompt">{position.prompt}</Text>
                </View>
              );
            })}
          </View>

          {session.status === "spread_ready" && (
            <Button className="primary-button" loading={loading} onTap={shuffle}>
              展开 78 张牌
            </Button>
          )}

          {(session.status === "drawing" || session.status === "reading") && (
            <View className="deck-area">
              <View className="deck-meta">
                <Text>横向滑动，从剩余 {slots.length} 张中选择</Text>
                <Text className="counter">{selectedCount} / {requiredCount}</Text>
              </View>
              <ScrollView className="deck-scroll" scrollX enhanced showScrollbar={false}>
                <View className="deck-track">
                  {slots.map((slotId, index) => (
                    <View
                      key={slotId}
                      className="mini-card-back"
                      style={{ transform: `rotate(${(index % 9) - 4}deg)` }}
                      onTap={() => session.status === "drawing" && draw(slotId)}
                    >
                      {cardBackUrl
                        ? <Image className="mini-card-back-image" src={cardBackUrl} mode="aspectFill" />
                        : <View className="back-oval"><Text>✦</Text></View>}
                    </View>
                  ))}
                </View>
              </ScrollView>
              <Text className="deck-caption">选中后会立即翻牌并落入上方对应牌位。</Text>
            </View>
          )}

          {session.status === "reading" && (
            <Button className="primary-button reading-button" loading={loading} onTap={generateReading}>
              {loading ? "正在整理单牌与整体解读…" : "一次生成完整解读"}
            </Button>
          )}
        </View>
      )}

      {reading && (
        <View className="flow-card reading-result">
          <View className="step-heading">
            <Text className="step-number">04</Text>
            <View>
              <Text className="step-title">镜中所见</Text>
              <Text className="step-hint">{reading.generation.label} · 逐张理解，再回到整体。</Text>
            </View>
          </View>
          {reading.cards.map((item) => {
            const card = session?.cards.find((candidate) => candidate.id === item.cardId);
            return (
              <View className="reading-card" key={item.cardId}>
                <View className="reading-card-heading">
                  {card && cardImageUrl(card.image) && (
                    <Image className="reading-card-image" src={cardImageUrl(card.image)!} mode="aspectFit" />
                  )}
                  <View className="reading-card-heading-copy">
                    <Text className="reading-position">{item.positionName}</Text>
                    <Text className="reading-title">{item.title}</Text>
                  </View>
                </View>
                <Text className="reading-copy">{item.interpretation}</Text>
                <Text className="reflection-question">“{item.reflectionQuestion}”</Text>
              </View>
            );
          })}
          <View className="global-reading">
            <Text className="global-label">整体解读</Text>
            <Text className="reading-copy">{reading.summary}</Text>
          </View>
          <View className="action-list">
            <Text className="global-label">可以带走的小行动</Text>
            {reading.actions.map((action, index) => (
              <Text className="action-item" key={action}>{index + 1}. {action}</Text>
            ))}
          </View>
          <Text className="result-disclaimer">{reading.disclaimer}</Text>
          <View className="generation-mark">
            <Text>{reading.generation.label}</Text>
            <Text>{reading.generation.modelName} · {reading.generation.deckVersion}</Text>
          </View>
          <View className="note-box">
            <Text className="global-label">写下此刻（仅保存在本机）</Text>
            <Textarea
              maxlength={500}
              value={note}
              onInput={(event) => setNote(event.detail.value)}
              placeholder="这次觉察后，我想记住……"
            />
            <Button onTap={() => { saveNote(note); void Taro.showToast({ title: "已保存在本机", icon: "success" }); }}>保存私密笔记</Button>
          </View>
          <Button className="secondary-button" onTap={startNew}>开始一次新的觉察</Button>
        </View>
      )}

      <View className="footer-nav">
        <Button onTap={() => Taro.navigateTo({ url: "/pages/deck/index" })}>卡片图鉴</Button>
        <Button onTap={() => Taro.navigateTo({ url: "/pages/history/index" })}>本机记录</Button>
        <Button onTap={() => Taro.navigateTo({ url: "/pages/about/index" })}>关于与反馈</Button>
      </View>
      <Text className="footer-copy">心镜不替你决定，只陪你看见。</Text>

      {revealedCard && (
        <View className="reveal-overlay" onTap={dismissReveal}>
          <View className={`flip-card ${flipped ? "is-flipped" : ""}`}>
            <View className="flip-face flip-back">
              {cardBackUrl
                ? <Image className="flip-back-image" src={cardBackUrl} mode="aspectFill" />
                : <View className="large-back-oval">✦</View>}
            </View>
            <View className="flip-face flip-front">
              <Text className="reveal-position">{revealedCard.positionName}</Text>
              <View className="reveal-art">
                {cardImageUrl(revealedCard.image)
                  ? <Image className="reveal-image" src={cardImageUrl(revealedCard.image)!} mode="aspectFit" />
                  : <Text className="reveal-symbol">✦</Text>}
                {cardImageUrl(revealedCard.image) && <Text className="reveal-card-label">{revealedCard.name}</Text>}
              </View>
              <Text className="reveal-name">{revealedCard.name}</Text>
              <Text className="reveal-en">{revealedCard.nameEn}</Text>
            </View>
          </View>
          <Text className="tap-hint">轻触继续选牌</Text>
        </View>
      )}

      {initialized && !consentAccepted && config && (
        <View className="consent-overlay">
          <View className="consent-dialog">
            <Text className="consent-title">开始前，请确认</Text>
            <Text className="consent-copy">{config.longDisclaimer}</Text>
            <Text className="consent-age">我已年满 {config.minimumAge} 周岁，并理解上述说明。</Text>
            <View className="consent-links">
              <View onTap={() => Taro.navigateTo({ url: "/pages/legal/index?type=privacy" })}><Text>隐私政策</Text></View>
              <View onTap={() => Taro.navigateTo({ url: "/pages/legal/index?type=terms" })}><Text>服务协议</Text></View>
            </View>
            <Button className="primary-button" loading={loading} onTap={acceptConsent}>
              我已阅读并同意
            </Button>
            <Button className="consent-exit" onTap={() => Taro.exitMiniProgram()}>暂不使用</Button>
          </View>
        </View>
      )}
    </View>
  );
}
