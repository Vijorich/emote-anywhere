import type { AppSettings, AppState, InstalledPlugin } from '../../core/types';
import type { NoticeAction } from '../../ui/notice';

export interface OptionsContext {
  getState(): AppState | null;
  show(text: string, kind?: 'ok' | 'error', action?: NoticeAction): void;
  refresh(message?: string, action?: NoticeAction): Promise<void>;
  noticeBanner(): HTMLElement | null;
  requestOrigin(url: string): Promise<boolean>;
  updateGlobalSets(sets: string[], message: string, action?: NoticeAction): Promise<void>;
  updateSettings(patch: Partial<AppSettings>): void;
  togglePlugin(plugin: InstalledPlugin, enabled: boolean): void;
}
