import type { AppSettings } from './types';

/** 1.5em base height × 1.2 = 1.8em, a little larger than the source line. */
export const DEFAULT_EMOTE_SCALE = 1.2;

/** "emote everywhere default set" on 7TV. */
export const DEFAULT_GLOBAL_SET_IDS = ['01M5VFKKAQEH8WEF0N0PNRK2YP'];

export const DEFAULT_SETTINGS: AppSettings = {
  globalMode: false,
  emoteScale: DEFAULT_EMOTE_SCALE,
  autoChannel: true,
  pickerEnabled: true,
  providers: { sevenTv: true, bttv: true, ffz: true },
};
