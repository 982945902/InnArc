import { create } from "zustand";
import type {
  CardView,
  ConsentResponse,
  DrawResponse,
  PublicConfig,
  Reading,
  ReadingAccepted,
  ReadingTask,
  Session,
  ShuffleResponse
} from "@heart-mirror/contracts";
import { ApiClientError, request } from "./api";
import {
  clearCurrentFlow,
  getCurrentFlow,
  getLocalConsent,
  getSettings,
  saveCurrentFlow,
  saveHistory,
  saveLocalConsent,
  saveSettings,
  updateHistoryNote
} from "./local-data";

interface MirrorState {
  initialized: boolean;
  config: PublicConfig | undefined;
  consentAccepted: boolean;
  reducedMotion: boolean;
  session: Session | undefined;
  slots: readonly string[];
  reading: Reading | undefined;
  revealedCard: CardView | undefined;
  loading: boolean;
  error: string | undefined;
  errorCode: string | undefined;
  support: string | undefined;
  initialize: () => Promise<void>;
  acceptConsent: () => Promise<void>;
  createSession: (question: string) => Promise<void>;
  answer: (answer: string) => Promise<void>;
  shuffle: () => Promise<void>;
  draw: (slotId: string) => Promise<void>;
  generateReading: () => Promise<void>;
  saveNote: (note: string) => void;
  startNew: () => void;
  setReducedMotion: (enabled: boolean) => void;
  dismissReveal: () => void;
  clearError: () => void;
}

type PartialSetter = (state: Partial<MirrorState>) => void;

let requestInFlight = false;

const delay = (milliseconds: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

const pollReading = async (accepted: ReadingAccepted): Promise<Reading> => {
  const maximumAttempts = 90;
  for (let attempt = 0; attempt < maximumAttempts; attempt += 1) {
    await delay(accepted.pollAfterMs);
    const task = await request<ReadingTask>("GET", `/v1/reading-tasks/${accepted.taskId}`);
    if (task.status === "complete") {
      if (task.reading) return task.reading;
      throw new ApiClientError({
        code: "READING_RESULT_MISSING",
        message: "完整解读结果不完整，请重新尝试。",
        retryable: true
      });
    }
    if (task.status === "blocked" || task.status === "degraded") {
      throw new ApiClientError({
        code: task.status === "blocked" ? "READING_BLOCKED" : "READING_DEGRADED",
        message: task.message ?? "完整解读暂时没有生成成功，请稍后重试。",
        retryable: task.status === "degraded"
      });
    }
  }
  throw new ApiClientError({
    code: "READING_TIMEOUT",
    message: "完整解读仍在整理中。你可以稍后回到本页继续获取。",
    retryable: true
  });
};

const failureState = (cause: unknown): Partial<MirrorState> =>
  cause instanceof ApiClientError
    ? {
        error: cause.message,
        errorCode: cause.code,
        support: cause.support
      }
    : {
        error: cause instanceof Error ? cause.message : "暂时无法完成，请稍后重试。",
        errorCode: "UNKNOWN",
        support: undefined
      };

const withFailure = async (set: PartialSetter, action: () => Promise<void>) => {
  if (requestInFlight) return;
  requestInFlight = true;
  set({ loading: true, error: undefined, errorCode: undefined, support: undefined });
  try {
    await action();
  } catch (cause) {
    set(failureState(cause));
  } finally {
    requestInFlight = false;
    set({ loading: false });
  }
};

const persist = (session: Session | undefined, slots: readonly string[], reading: Reading | undefined): void => {
  if (!session) {
    clearCurrentFlow();
    return;
  }
  saveCurrentFlow({ session, slots, ...(reading ? { reading } : {}) });
};

export const useMirrorStore = create<MirrorState>((set, get) => ({
  initialized: false,
  config: undefined,
  consentAccepted: false,
  reducedMotion: getSettings().reducedMotion,
  session: undefined,
  slots: [],
  reading: undefined,
  revealedCard: undefined,
  loading: false,
  error: undefined,
  errorCode: undefined,
  support: undefined,
  initialize: () => withFailure(set, async () => {
    const config = await request<PublicConfig>("GET", "/v1/config/public");
    const localConsent = getLocalConsent();
    const consentAccepted = localConsent?.version === config.consentVersion;
    if (consentAccepted) {
      await request<ConsentResponse>("POST", "/v1/consents", {
        adultConfirmed: true,
        disclaimerAccepted: true,
        consentVersion: config.consentVersion
      });
    }
    const snapshot = getCurrentFlow();
    set({
      initialized: true,
      config,
      consentAccepted,
      session: snapshot?.session,
      slots: snapshot?.slots ?? [],
      reading: snapshot?.reading
    });
  }),
  acceptConsent: () => withFailure(set, async () => {
    const config = get().config;
    if (!config) return;
    const response = await request<ConsentResponse>("POST", "/v1/consents", {
      adultConfirmed: true,
      disclaimerAccepted: true,
      consentVersion: config.consentVersion
    });
    saveLocalConsent({ version: response.consentVersion, acceptedAt: response.acceptedAt });
    set({ consentAccepted: true });
  }),
  createSession: (question) => withFailure(set, async () => {
    const session = await request<Session>("POST", "/v1/sessions", { question });
    persist(session, [], undefined);
    set({ session, slots: [], reading: undefined, revealedCard: undefined });
  }),
  answer: (answer) => withFailure(set, async () => {
    const current = get();
    if (!current.session) return;
    const session = await request<Session>(
      "POST",
      `/v1/sessions/${current.session.id}/clarifications`,
      { answer }
    );
    persist(session, current.slots, current.reading);
    set({ session });
  }),
  shuffle: () => withFailure(set, async () => {
    const current = get();
    if (!current.session) return;
    const result = await request<ShuffleResponse>("POST", `/v1/sessions/${current.session.id}/shuffle`);
    const session: Session = { ...current.session, status: "drawing", cards: [] };
    const slots = result.slots.map((slot) => slot.id);
    persist(session, slots, undefined);
    set({ slots, reading: undefined, revealedCard: undefined, session });
  }),
  draw: (slotId) => withFailure(set, async () => {
    const current = get();
    if (!current.session) return;
    const result = await request<DrawResponse>(
      "POST",
      `/v1/sessions/${current.session.id}/draws`,
      { slotId }
    );
    const slots = current.slots.filter((id) => id !== slotId);
    const session: Session = {
      ...current.session,
      status: result.selectedCount === result.requiredCount ? "reading" : "drawing",
      cards: [...current.session.cards, result.card]
    };
    persist(session, slots, current.reading);
    set({ revealedCard: result.card, slots, session });
  }),
  generateReading: () => withFailure(set, async () => {
    const current = get();
    if (!current.session) return;
    const accepted = await request<ReadingAccepted>("POST", `/v1/sessions/${current.session.id}/reading`);
    const reading = await pollReading(accepted);
    const session: Session = { ...current.session, status: "completed" };
    persist(session, current.slots, reading);
    saveHistory({
      id: current.session.id,
      sessionId: current.session.id,
      createdAt: new Date().toISOString(),
      question: current.session.question,
      session,
      reading,
      note: ""
    });
    set({ reading, session, revealedCard: undefined });
  }),
  saveNote: (note) => {
    const sessionId = get().session?.id;
    if (sessionId) updateHistoryNote(sessionId, note);
  },
  startNew: () => {
    clearCurrentFlow();
    set({
      session: undefined,
      slots: [],
      reading: undefined,
      revealedCard: undefined,
      error: undefined,
      errorCode: undefined,
      support: undefined
    });
  },
  setReducedMotion: (enabled) => {
    saveSettings({ reducedMotion: enabled });
    set({ reducedMotion: enabled });
  },
  dismissReveal: () => set({ revealedCard: undefined }),
  clearError: () => set({ error: undefined, errorCode: undefined, support: undefined })
}));
