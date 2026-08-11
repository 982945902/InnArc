const experience = document.querySelector("#experience");
const consentModal = document.querySelector("#consentModal");
const ageCheck = document.querySelector("#ageCheck");
const consentButton = document.querySelector("#consentButton");
const revealModal = document.querySelector("#revealModal");
const atlasModal = document.querySelector("#atlasModal");

const state = {
  deck: [],
  question: "",
  round: 0,
  answers: [],
  spread: null,
  shuffled: [],
  selected: [],
  stage: "question",
  currentReveal: null
};

const templates = [
  "我此刻最需要看见什么？",
  "我对换工作既期待又不安，真正担心的是什么？",
  "这段关系里，我可以怎样照顾自己的边界？",
  "这件事中，哪些部分仍在我的掌控中？"
];

const clarificationSets = {
  relation: [
    { question: "在这段关系里，你最想先梳理哪一部分？", choices: ["我的真实感受", "彼此的互动模式", "我需要的边界", "下一步如何沟通"] },
    { question: "现在最接近你的状态是哪一种？", choices: ["想靠近，也有顾虑", "反复猜测对方", "付出很多，有些累", "还说不清，只觉得卡住"] }
  ],
  choice: [
    { question: "面对这个选择，最卡住你的是什么？", choices: ["害怕选错", "信息还不够", "期待与现实冲突", "不知道自己真正想要什么"] },
    { question: "这次梳理后，你最希望得到哪种帮助？", choices: ["看清优先级", "辨认可控部分", "理解内在担心", "找到一个小行动"] }
  ],
  general: [
    { question: "此刻最需要被看见的是哪一层？", choices: ["正在发生的情绪", "反复出现的想法", "与他人的互动", "迟迟没有开始的行动"] },
    { question: "如果这次梳理能带来一个小变化，你希望是什么？", choices: ["心里更安定一点", "理解自己多一点", "边界更清楚一点", "知道下一步做什么"] }
  ],
  extra: { question: "不用急着说清楚。哪种身体感受更接近现在？", choices: ["紧绷", "沉重", "空空的", "有一点期待"] }
};

const spreads = {
  one: {
    name: "一张 · 当下焦点",
    reason: "你的问题聚焦在此刻，一个位置足以帮注意力落到最重要的感受上。",
    positions: [{ id: "focus", name: "此刻焦点", prompt: "现在最值得被看见的是什么？" }]
  },
  three: {
    name: "三张 · 情境与行动",
    reason: "问题同时包含感受与选择，用三个位置区分现状、内在需要和可行动的一步。",
    positions: [
      { id: "situation", name: "眼前情境", prompt: "我正在经历什么？" },
      { id: "need", name: "内在需要", prompt: "什么尚未被照顾？" },
      { id: "action", name: "可行一步", prompt: "我能尝试什么？" }
    ]
  },
  five: {
    name: "五张 · 关系全景",
    reason: "关系问题往往不只关乎一个人，五个位置帮助你区分自我、对方、互动、边界与下一步。",
    positions: [
      { id: "self", name: "我的状态", prompt: "我带着什么进入关系？" },
      { id: "other", name: "对方呈现", prompt: "我看见了对方什么？" },
      { id: "pattern", name: "互动模式", prompt: "彼此如何互相影响？" },
      { id: "boundary", name: "需要的边界", prompt: "什么需要更清楚？" },
      { id: "next", name: "下一步", prompt: "怎样行动更照顾自己？" }
    ]
  }
};

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>'"]/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;"
  })[character]);
}

function categoryForQuestion(question) {
  if (/关系|感情|对方|伴侣|朋友|同事|相处|沟通|边界/.test(question)) return "relation";
  if (/工作|选择|决定|要不要|换|职业|下一步|怎么办|去留|行动/.test(question)) return "choice";
  return "general";
}

function pickSpread() {
  const category = categoryForQuestion(state.question);
  if (category === "relation") return spreads.five;
  if (/此刻|当下|今天|现在|最需要看见/.test(state.question) && !/工作|选择|怎么办|下一步/.test(state.question)) return spreads.one;
  return spreads.three;
}

function shuffleDeck(deck) {
  const copy = [...deck];
  const random = new Uint32Array(copy.length);
  crypto.getRandomValues(random);
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const target = random[index] % (index + 1);
    [copy[index], copy[target]] = [copy[target], copy[index]];
  }
  return copy;
}

function progress() {
  const active = state.stage === "question" ? 0 : state.stage === "clarifying" ? 1 : state.stage === "reading" ? 3 : 2;
  return `<div class="journey-progress">${["说出问题", "温和追问", "选择卡牌", "完整解读"].map((label, index) => `<span class="${index < active ? "done" : index === active ? "active" : ""}">${index + 1}. ${label}</span>`).join("")}</div>`;
}

function renderQuestion() {
  experience.innerHTML = `${progress()}<section class="step-card">
    <div class="step-title-row"><span class="step-index">01</span><div><h3>你想看清什么？</h3><p>可以写感受、关系或选择。问题不必完整，我们会先追问。</p></div></div>
    <div class="template-row">${templates.map((item) => `<button type="button" class="template-button" data-template="${escapeHtml(item)}">${escapeHtml(item)}</button>`).join("")}</div>
    <textarea id="questionInput" class="question-input" maxlength="120" placeholder="例如：我对换工作既期待又不安，真正担心的是什么？">${escapeHtml(state.question)}</textarea>
    <div class="input-meta"><span>请勿输入真实姓名、电话等敏感信息</span><span id="questionCount">${state.question.length} / 120</span></div>
    <button class="primary-button question-submit" id="startButton" type="button" ${state.question.trim().length < 4 ? "disabled" : ""}>开始梳理</button>
  </section>`;

  const input = document.querySelector("#questionInput");
  const startButton = document.querySelector("#startButton");
  document.querySelectorAll("[data-template]").forEach((button) => button.addEventListener("click", () => {
    state.question = button.dataset.template;
    input.value = state.question;
    document.querySelector("#questionCount").textContent = `${state.question.length} / 120`;
    startButton.disabled = false;
  }));
  input.addEventListener("input", () => {
    state.question = input.value;
    document.querySelector("#questionCount").textContent = `${state.question.length} / 120`;
    startButton.disabled = state.question.trim().length < 4;
  });
  startButton.addEventListener("click", () => {
    if (state.question.trim().length < 4) return;
    state.question = state.question.trim();
    state.stage = "clarifying";
    state.round = 0;
    state.answers = [];
    render();
  });
}

function currentClarification() {
  const base = clarificationSets[categoryForQuestion(state.question)];
  if (state.round < 2) return base[state.round];
  return clarificationSets.extra;
}

function renderClarifying() {
  const item = currentClarification();
  experience.innerHTML = `${progress()}
    <div class="question-summary"><b>你想梳理：</b>${escapeHtml(state.question)}</div>
    <section class="step-card">
      <div class="step-title-row"><span class="step-index">02</span><div><h3>再靠近一点</h3><p>第 ${state.round + 1} 轮 · 通常追问 2–3 轮，帮助系统直接匹配合适结构。</p></div></div>
      <span class="clarify-count">CLARIFICATION ${String(state.round + 1).padStart(2, "0")}</span>
      <div class="clarify-question">${escapeHtml(item.question)}</div>
      <div class="choice-grid">${item.choices.map((choice) => `<button class="choice-button" type="button" data-answer="${escapeHtml(choice)}">${escapeHtml(choice)}</button>`).join("")}</div>
      <div class="free-answer-row"><textarea class="free-input" id="freeAnswer" maxlength="100" placeholder="也可以用自己的话回答"></textarea><button type="button" class="primary-button" id="freeAnswerButton" disabled>发送</button></div>
    </section>`;
  document.querySelectorAll("[data-answer]").forEach((button) => button.addEventListener("click", () => submitAnswer(button.dataset.answer)));
  const freeInput = document.querySelector("#freeAnswer");
  const freeButton = document.querySelector("#freeAnswerButton");
  freeInput.addEventListener("input", () => { freeButton.disabled = !freeInput.value.trim(); });
  freeButton.addEventListener("click", () => submitAnswer(freeInput.value.trim()));
}

function submitAnswer(answer) {
  if (!answer) return;
  state.answers.push(answer);
  const needsThirdRound = state.round === 1 && state.answers.some((item) => /说不清|不知道|卡住/.test(item));
  if (state.round < 1 || needsThirdRound) {
    state.round += 1;
  } else {
    state.spread = pickSpread();
    state.stage = "spread";
  }
  render();
}

function positionCardsMarkup() {
  const count = state.spread.positions.length;
  return `<div class="position-grid" style="--slot-count:${count}">${state.spread.positions.map((position, index) => {
    const selected = state.selected[index];
    return `<article class="position-slot ${selected ? "has-card" : ""}">
      ${selected ? `<img class="slot-image" src="./cards/${selected.card.id}.webp" alt="${escapeHtml(selected.card.nameZh)}" /><span class="slot-card-name">${escapeHtml(selected.card.nameZh)}</span><span class="slot-card-en">${escapeHtml(selected.card.nameEn)}</span>` : `<span class="slot-number">${String(index + 1).padStart(2, "0")}</span>`}
      <span class="slot-position">位置 · ${escapeHtml(position.name)}</span><span class="slot-prompt">${escapeHtml(position.prompt)}</span>
    </article>`;
  }).join("")}</div>`;
}

function spreadHeaderMarkup() {
  return `<div class="question-summary"><b>你想梳理：</b>${escapeHtml(state.question)}</div>
    <div class="spread-intro"><span class="eyebrow">RECOMMENDED STRUCTURE · ${state.spread.positions.length} CARDS</span><h3>${escapeHtml(state.spread.name)}</h3><p>${escapeHtml(state.spread.reason)}</p></div>`;
}

function renderSpread() {
  experience.innerHTML = `${progress()}<section class="step-card">${spreadHeaderMarkup()}${positionCardsMarkup()}
    <button class="primary-button spread-action" id="openDeckButton" type="button">在当前页面展开 78 张</button>
  </section>`;
  document.querySelector("#openDeckButton").addEventListener("click", () => {
    state.shuffled = shuffleDeck(state.deck);
    state.stage = "drawing";
    render();
    setTimeout(() => document.querySelector(".deck-area")?.scrollIntoView({ behavior: "smooth", block: "center" }), 60);
  });
}

function renderDrawing() {
  const selectedIds = new Set(state.selected.map((item) => item.card.id));
  const remaining = state.shuffled.filter((card) => !selectedIds.has(card.id));
  experience.innerHTML = `${progress()}<section class="step-card">${spreadHeaderMarkup()}${positionCardsMarkup()}
    <div class="deck-area"><div class="deck-meta"><span>横向滑动，从完整牌组中凭直觉选择</span><span class="deck-counter">${state.selected.length} / ${state.spread.positions.length}</span></div>
      <div class="deck-scroll"><div class="deck-track">${remaining.map((card, index) => `<button class="deck-card" type="button" data-card-id="${card.id}" aria-label="选择第 ${index + 1} 张卡牌" style="--angle:${(index % 9) - 4}deg"><img src="./cards/card-back.webp" alt="" /></button>`).join("")}</div></div>
      <p class="deck-caption">选中后会翻开真实牌面，并落入上方下一个位置；牌名始终与落位卡牌一致。</p>
    </div>
  </section>`;
  document.querySelectorAll("[data-card-id]").forEach((button) => button.addEventListener("click", () => drawCard(button.dataset.cardId)));
}

function drawCard(cardId) {
  if (state.currentReveal || state.selected.length >= state.spread.positions.length) return;
  const card = state.deck.find((item) => item.id === cardId);
  const position = state.spread.positions[state.selected.length];
  if (!card || !position) return;
  const selection = { card, position };
  state.selected.push(selection);
  state.currentReveal = selection;
  document.querySelector("#revealPosition").textContent = `位置 ${state.selected.length} · ${position.name}`;
  document.querySelector("#revealImage").src = `./cards/${card.id}.webp`;
  document.querySelector("#revealImage").alt = `${card.nameZh}卡面`;
  document.querySelector("#revealName").textContent = card.nameZh;
  document.querySelector("#revealEnglish").textContent = card.nameEn;
  document.querySelector("#revealKeywords").innerHTML = card.keywords.map((keyword) => `<span>${escapeHtml(keyword)}</span>`).join("");
  const complete = state.selected.length === state.spread.positions.length;
  document.querySelector("#revealContinue").textContent = complete ? "查看一次完整解读" : "继续选牌";
  revealModal.classList.remove("is-hidden");
  document.querySelector("#flipCard").classList.remove("is-flipped");
  requestAnimationFrame(() => requestAnimationFrame(() => document.querySelector("#flipCard").classList.add("is-flipped")));
  renderDrawing();
}

function finishReveal() {
  if (!state.currentReveal) return;
  const complete = state.selected.length === state.spread.positions.length;
  state.currentReveal = null;
  revealModal.classList.add("is-hidden");
  document.querySelector("#flipCard").classList.remove("is-flipped");
  if (complete) state.stage = "reading";
  render();
  if (complete) setTimeout(() => document.querySelector(".reading-banner")?.scrollIntoView({ behavior: "smooth", block: "start" }), 80);
}

function renderReading() {
  const cards = state.selected.map(({ card, position }, index) => `<article class="reading-card">
    <img src="./cards/${card.id}.webp" alt="${escapeHtml(card.nameZh)}" />
    <div><span class="reading-position">${String(index + 1).padStart(2, "0")} · ${escapeHtml(position.name)}</span><h4>${escapeHtml(card.nameZh)} · ${escapeHtml(card.keywords.join(" / "))}</h4>
      <p>在“${escapeHtml(position.name)}”这个位置，${escapeHtml(card.nameZh)}把注意力带到${escapeHtml(card.keywords.join("、"))}。这不是一个确定答案，更像是在邀请你留意：${escapeHtml(card.reflection)}</p>
      <span class="reflection">给自己的问题：${escapeHtml(card.reflection)}</span>
    </div>
  </article>`).join("");
  const names = state.selected.map((item) => item.card.nameZh).join("、");
  const keywords = [...new Set(state.selected.flatMap((item) => item.card.keywords))].slice(0, 6).join("、");
  const actions = state.selected.slice(0, 3).map((item, index) => `<li><b>${String(index + 1).padStart(2, "0")}</b><span>${escapeHtml(item.card.action)}</span></li>`).join("");
  experience.innerHTML = `${progress()}<section class="step-card">${spreadHeaderMarkup()}${positionCardsMarkup()}
    <div class="reading-banner"><span>COMPLETE REFLECTION · DEMO</span><h3>镜中所见</h3><p>以下内容一次呈现每张卡牌和整体关联。展示版在本地组合固定牌义，不调用正式 AI 服务。</p></div>
    <div class="reading-list">${cards}</div>
    <section class="global-reading"><span class="eyebrow">THE WHOLE PICTURE</span><h3>整体关联</h3><p>${escapeHtml(names)}共同指向“${escapeHtml(keywords)}”。可以把它理解为：你面对的问题里，外部情境固然重要，但真正能够开始改变的，往往是辨认自己的需要、划清可控范围，并把注意力落到一个足够小的行动上。卡牌不替你做决定，它们只帮助你看见决定时正在带着什么。</p>
      <ul class="action-list">${actions}</ul>
    </section>
    <div class="result-actions"><button class="primary-button" id="restartButton" type="button">重新体验</button><button class="ghost-button" id="resultAtlasButton" type="button">浏览全部 78 张</button></div>
  </section>`;
  document.querySelector("#restartButton").addEventListener("click", resetExperience);
  document.querySelector("#resultAtlasButton").addEventListener("click", () => openAtlas("all"));
}

function resetExperience() {
  Object.assign(state, { question: "", round: 0, answers: [], spread: null, shuffled: [], selected: [], stage: "question", currentReveal: null });
  render();
  document.querySelector(".experience-shell")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function render() {
  if (state.stage === "question") renderQuestion();
  else if (state.stage === "clarifying") renderClarifying();
  else if (state.stage === "spread") renderSpread();
  else if (state.stage === "drawing") renderDrawing();
  else renderReading();
}

const atlasLabels = { all: "全部 78 张", major: "大阿卡纳 22 张", wands: "权杖", cups: "圣杯", swords: "宝剑", pentacles: "星币" };
function renderAtlas(filter = "all") {
  document.querySelector("#atlasFilters").innerHTML = Object.entries(atlasLabels).map(([key, label]) => `<button class="filter-button ${key === filter ? "active" : ""}" data-filter="${key}" type="button">${label}</button>`).join("");
  const visible = filter === "all" ? state.deck : state.deck.filter((card) => card.group === filter);
  document.querySelector("#atlasGrid").innerHTML = visible.map((card) => `<article class="atlas-card"><img loading="lazy" src="./cards/${card.id}.webp" alt="${escapeHtml(card.nameZh)}" /><b>${escapeHtml(card.nameZh)}</b><small>${escapeHtml(card.nameEn)}</small></article>`).join("");
  document.querySelectorAll("[data-filter]").forEach((button) => button.addEventListener("click", () => renderAtlas(button.dataset.filter)));
}
function openAtlas(filter = "all") { renderAtlas(filter); atlasModal.classList.remove("is-hidden"); document.body.style.overflow = "hidden"; }
function closeAtlas() { atlasModal.classList.add("is-hidden"); document.body.style.overflow = ""; }

ageCheck.addEventListener("change", () => { consentButton.disabled = !ageCheck.checked; });
consentButton.addEventListener("click", () => { if (ageCheck.checked) { consentModal.classList.add("is-hidden"); document.body.style.overflow = ""; } });
document.querySelector("#revealContinue").addEventListener("click", finishReveal);
document.querySelector("#revealClose").addEventListener("click", finishReveal);
document.querySelector("#atlasButton").addEventListener("click", () => openAtlas("all"));
document.querySelector("#atlasClose").addEventListener("click", closeAtlas);
atlasModal.addEventListener("click", (event) => { if (event.target === atlasModal) closeAtlas(); });
document.addEventListener("keydown", (event) => { if (event.key === "Escape" && !atlasModal.classList.contains("is-hidden")) closeAtlas(); });

fetch("./deck-data.json")
  .then((response) => { if (!response.ok) throw new Error("卡牌数据加载失败"); return response.json(); })
  .then((deck) => {
    if (!Array.isArray(deck) || deck.length !== 78) throw new Error("卡牌数量不完整");
    state.deck = deck;
    render();
  })
  .catch((error) => { experience.innerHTML = `<div class="loading-state">${escapeHtml(error.message)}，请刷新重试。</div>`; });
