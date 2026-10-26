import { EmotePicker } from '../../src/picker/picker';
import type { Emote, PluginDescriptor } from '../../src/core/types';

const ids = [
  ['Clueless', '01F6T8NM9R0007M5BTFWSP1YSJ'],
  ['GIGACHAD', '01F6MZGCNG000255K4X1K7NTHR'],
  ['catKISS', '01F5VW2TKR0003RCV2Z6JBHCST'],
  ['COPIUM', '01F6ME7ADR0000WDA7ERT9H30R'],
  ['donowall', '01F6BN89H80006VBW12DRB1DJ0'],
  ['DIESOFCRINGE', '01FCX95ZG80009QXBMY7YYTVBJ'],
  ['SNIFFA', '01F7M225F8000AWSXNQ65M4PKG'],
  ['KEKW', '01F61B1440000991F7SWQNMVX7'],
] as const;

const emotes: Emote[] = ids.map(([code, id]) => ({
  code,
  url: `https://cdn.7tv.app/emote/${id}/2x.webp`,
  flags: 0,
  provider: '7tv',
}));

const descriptor: PluginDescriptor = {
  schemaVersion: 1,
  id: 'preview',
  name: 'Preview chat',
  version: '1.0.0',
  matches: ['http://localhost/*'],
  chat: {
    messages: ['.message'],
    channel: { from: 'constant', value: 'preview' },
  },
  composer: { selectors: ['#composer'], kind: 'contenteditable' },
};

const picker = new EmotePicker(descriptor, emotes, { pickerEnabled: true });
picker.start();

window.setTimeout(() => {
  const fab = document
    .querySelector<HTMLElement>('.ea-picker-host')
    ?.shadowRoot?.querySelector<HTMLButtonElement>('.fab');
  fab?.click();
}, 300);
