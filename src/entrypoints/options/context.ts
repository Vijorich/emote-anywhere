import type { AppSettings, AppState, InstalledPlugin } from '../../core/types';

export interface OptionsContext {
  getState(): AppState | null;
  show(text: string, kind?: 'ok' | 'error'): void;
  refresh(message?: string): Promise<void>;
  noticeBanner(): HTMLElement | null;
  requestOrigin(url: string): Promise<boolean>;
  updateGlobalSets(sets: string[], message: string): Promise<void>;
  updateSettings(patch: Partial<AppSettings>): void;
  togglePlugin(plugin: InstalledPlugin, enabled: boolean): void;
}
