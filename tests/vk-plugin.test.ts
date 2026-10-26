// @vitest-environment jsdom
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it } from 'vitest';
import { resolveChannel } from '../src/core/channel';
import type { Emote } from '../src/core/types';
import { parseRegistryIndex } from '../src/core/validate';
import { ChatEngine } from '../src/engine/engine';

const registry = parseRegistryIndex(
  JSON.parse(readFileSync(resolve(process.cwd(), 'registry/index.json'), 'utf8')),
);
const vk = registry.plugins.find((plugin) => plugin.id === 'vk');
if (!vk) throw new Error('VK plugin missing');

const emote: Emote = {
  code: 'peepoSad',
  url: 'https://cdn.7tv.app/emote/test/2x.webp',
  flags: 0,
  provider: '7tv',
};

beforeEach(() => {
  document.body.innerHTML = `
    <div id="reforged-root">
      <div class="ConvoHistory__messageWrapper">
        <div class="ConvoMessage">
          <div class="ConvoMessageHeader"><a class="ConvoMessageHeader__authorLink">author</a></div>
          <div class="SomeTextBubble">hello peepoSad</div>
          <div class="ConvoMessageInfo">12:00</div>
          <div class="Attachments">attachment peepoSad</div>
          <div class="ConvoReactions">peepoSad</div>
        </div>
      </div>
    </div>
  `;
});

describe('VK plugin descriptor', () => {
  it('replaces emotes only in message text', () => {
    const engine = new ChatEngine({
      descriptor: vk,
      emotes: [emote],
      settings: { globalMode: false, emoteScale: 1 },
    });
    engine.start();
    const spans = document.querySelectorAll('.ea-e');
    expect(spans).toHaveLength(1);
    expect(spans[0]?.closest('.SomeTextBubble')).not.toBeNull();
    expect(document.querySelector('.ConvoMessageHeader .ea-e')).toBeNull();
    expect(document.querySelector('.ConvoMessageInfo .ea-e')).toBeNull();
    expect(document.querySelector('.Attachments .ea-e')).toBeNull();
    engine.stop();
  });

  it('skips deleted and system rows by inner modifier class', () => {
    document.body.innerHTML = `
      <div id="reforged-root">
        <div class="ConvoHistory__messageWrapper">
          <div class="ConvoMessage ConvoMessage--deleted">
            <div class="SomeTextBubble">hello peepoSad</div>
          </div>
        </div>
      </div>
    `;
    const engine = new ChatEngine({
      descriptor: vk,
      emotes: [emote],
      settings: { globalMode: false, emoteScale: 1 },
    });
    engine.start();
    expect(document.querySelectorAll('.ea-e')).toHaveLength(0);
    engine.stop();
  });

  it('derives the channel key from the convo URL', () => {
    const key = resolveChannel(
      vk.chat.channel,
      document,
      'https://vk.ru/im/convo/371502952?entrypoint=list_all',
    );
    expect(key).toBe('371502952');
  });

  it('derives the channel key from ?sel=', () => {
    const key = resolveChannel(vk.chat.channel, document, 'https://vk.com/im?sel=2000000123');
    expect(key).toBe('2000000123');
  });
});
