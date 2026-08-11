import Taro from "@tarojs/taro";
import type { Reading, Session } from "@heart-mirror/contracts";

const CONSENT_KEY = "heart-mirror:consent:v1";
const HISTORY_KEY = "heart-mirror:history:v1";
const CURRENT_FLOW_KEY = "heart-mirror:current-flow:v1";
const SETTINGS_KEY = "heart-mirror:settings:v1";

export interface LocalConsent {
  readonly version: string;
  readonly acceptedAt: string;
}

export interface HistoryEntry {
  readonly id: string;
  readonly sessionId: string;
  readonly createdAt: string;
  readonly question: string;
  readonly session: Session;
  readonly reading: Reading;
  readonly note: string;
}

export interface CurrentFlowSnapshot {
  readonly session: Session;
  readonly slots: readonly string[];
  readonly reading?: Reading | undefined;
}

export interface LocalSettings {
  readonly reducedMotion: boolean;
}

const read = <T>(key: string): T | undefined => {
  try {
    const value = Taro.getStorageSync<T>(key);
    return value || undefined;
  } catch {
    return undefined;
  }
};

export const getLocalConsent = (): LocalConsent | undefined => read<LocalConsent>(CONSENT_KEY);
export const saveLocalConsent = (consent: LocalConsent): void => Taro.setStorageSync(CONSENT_KEY, consent);

export const listHistory = (): readonly HistoryEntry[] => read<HistoryEntry[]>(HISTORY_KEY) ?? [];

export const saveHistory = (entry: HistoryEntry): void => {
  const existing = listHistory().filter((item) => item.id !== entry.id);
  Taro.setStorageSync(HISTORY_KEY, [entry, ...existing].slice(0, 50));
};

export const updateHistoryNote = (id: string, note: string): void => {
  const updated = listHistory().map((entry) => entry.id === id ? { ...entry, note: note.slice(0, 500) } : entry);
  Taro.setStorageSync(HISTORY_KEY, updated);
};

export const deleteHistory = (id: string): void => {
  Taro.setStorageSync(HISTORY_KEY, listHistory().filter((entry) => entry.id !== id));
};

export const clearHistory = (): void => Taro.removeStorageSync(HISTORY_KEY);

export const getCurrentFlow = (): CurrentFlowSnapshot | undefined => read<CurrentFlowSnapshot>(CURRENT_FLOW_KEY);
export const saveCurrentFlow = (snapshot: CurrentFlowSnapshot): void => Taro.setStorageSync(CURRENT_FLOW_KEY, snapshot);
export const clearCurrentFlow = (): void => Taro.removeStorageSync(CURRENT_FLOW_KEY);

export const getSettings = (): LocalSettings => read<LocalSettings>(SETTINGS_KEY) ?? { reducedMotion: false };
export const saveSettings = (settings: LocalSettings): void => Taro.setStorageSync(SETTINGS_KEY, settings);

export const clearAllLocalData = (): void => {
  Taro.removeStorageSync(CONSENT_KEY);
  Taro.removeStorageSync(HISTORY_KEY);
  Taro.removeStorageSync(CURRENT_FLOW_KEY);
  Taro.removeStorageSync(SETTINGS_KEY);
};
