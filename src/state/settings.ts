import { useSyncExternalStore } from 'react';
import { createStore } from './storage';

export interface Settings {
  /** 스포일러 항상 표시 */
  showSpoilers: boolean;
  /** 캐스팅 표에 캐릭터 이미지 표시 */
  showCharacterImages: boolean;
  /** 캐스팅 표에 단역 포함 */
  showMinorRoles: boolean;
  theme: 'system' | 'light' | 'dark';
}

const defaults: Settings = { showSpoilers: false, showCharacterImages: false, showMinorRoles: false, theme: 'system' };

export const settingsStore = createStore<Settings>(
  'va-archive:settings',
  (raw) => {
    try {
      return { ...defaults, ...(raw ? JSON.parse(raw) : {}) };
    } catch {
      return defaults;
    }
  },
  (v) => JSON.stringify(v),
);

export function useSettings(): Settings {
  return useSyncExternalStore(settingsStore.subscribe, settingsStore.get);
}

export function updateSettings(patch: Partial<Settings>): void {
  settingsStore.set({ ...settingsStore.get(), ...patch });
}
