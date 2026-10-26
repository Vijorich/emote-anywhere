import type { AppSettings } from './types';

/** 1.5em base height × 1.2 = 1.8em, a little larger than the source line. */
export const DEFAULT_EMOTE_SCALE = 1.2;

export const DEFAULT_SETTINGS: AppSettings = {
  globalMode: false,
  emoteScale: DEFAULT_EMOTE_SCALE,
  autoChannel: true,
  pickerEnabled: true,
  providers: { sevenTv: true, bttv: true, ffz: true },
};
