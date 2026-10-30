import type { AppSettings, AppState, InstalledPlugin } from '../../core/types';

export interface OptionsContext {
  getState(): AppState | null;
  refresh(): Promise<void>;
  requestOrigin(url: string): Promise<boolean>;
  updateGlobalSets(sets: string[]): Promise<void>;
  updateSettings(patch: Partial<AppSettings>): void;
  togglePlugin(plugin: InstalledPlugin, enabled: boolean): void;
}
