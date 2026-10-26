// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest';
import type { AppSettings, Emote, PluginDescriptor } from '../src/core/types';
import { ChatEngine } from '../src/engine/engine';
import { insertIntoComposer } from '../src/picker/insert';

const settings: Pick<AppSettings, 'globalMode' | 'emoteScale'> = {
  globalMode: false,
  emoteScale: 1,
};

function descriptor(extra: Partial<PluginDescriptor['chat']> = {}): PluginDescriptor {
  return {
    schemaVersion: 1,
    id: 'test',
    name: 'Test chat',
    version: '1.0.0',
    matches: ['https://example.com/*'],
    chat: {
      messages: ['.msg'],
      text: ['.body'],
      channel: { from: 'constant', value: 'chan' },
      ...extra,
    },
  };
}

function emote(code: string, flags = 0): Emote {
  return { code, url: `https://cdn.example/${code}.png`, flags, provider: '7tv' };
}

const emotes = [
  emote('peepoSad'),
  emote('catJAM'),
  emote('base'),
  emote('overlay', 256),
  emote('activeOverlay', 1),
];

function wait(ms = 90): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function engine(chat = descriptor(), globalMode = false): ChatEngine {
  const instance = new ChatEngine({
    descriptor: chat,
    emotes,
    settings: { ...settings, globalMode },
  });
  instance.start();
  return instance;
}

beforeEach(() => {
  document.body.innerHTML = '';
});

describe('ChatEngine', () => {
  it('replaces only inside chat messages', () => {
    document.body.innerHTML = `
      <div class="chat">
        <div class="msg"><span class="body">hi peepoSad</span></div>
      </div>
      <p id="outside">peepoSad</p>
    `;
    const instance = engine();
    expect(document.querySelectorAll('.msg .ea-e')).toHaveLength(1);
    expect(document.querySelector('#outside .ea-e')).toBeNull();
    instance.stop();
  });

  it('skips excluded elements', () => {
    document.body.innerHTML = `
      <div class="msg"><span class="body">peepoSad <code>peepoSad</code></span></div>
    `;
    const instance = engine(descriptor({ exclude: ['a', 'code'] }));
    expect(document.querySelectorAll('.msg .ea-e')).toHaveLength(1);
    instance.stop();
  });

  it('skips messages matching skip selectors', () => {
    document.body.innerHTML = `
      <div class="msg deleted"><span class="body">peepoSad</span></div>
    `;
    const instance = engine(descriptor({ skip: ['.deleted'] }));
    expect(document.querySelectorAll('.ea-e')).toHaveLength(0);
    instance.stop();
  });

  it('handles appended messages without duplicating emotes', async () => {
    document.body.innerHTML = `<div class="msg"><span class="body">hi peepoSad</span></div>`;
    const instance = engine();
    expect(document.querySelectorAll('.ea-e')).toHaveLength(1);

    const body = document.querySelector('.body');
    body?.append(document.createTextNode(' catJAM'));
    await wait();
    expect(document.querySelectorAll('.ea-e')).toHaveLength(2);

    body?.append(document.createTextNode(' plain'));
    await wait();
    expect(document.querySelectorAll('.ea-e')).toHaveLength(2);
    instance.stop();
  });

  it('re-renders a recycled message node', async () => {
    document.body.innerHTML = `<div class="msg"><span class="body">peepoSad</span></div>`;
    const instance = engine();
    expect(document.querySelectorAll('.ea-e')).toHaveLength(1);

    const body = document.querySelector('.body');
    if (body) body.textContent = 'catJAM only';
    await wait();
    const spans = document.querySelectorAll('.ea-e');
    expect(spans).toHaveLength(1);
    expect(spans[0]?.getAttribute('data-ea-code')).toBe('catJAM');
    instance.stop();
  });

  it('renders at the configured scale', () => {
    document.body.innerHTML = `<div class="msg"><span class="body">peepoSad</span></div>`;
    const instance = new ChatEngine({
      descriptor: descriptor(),
      emotes,
      settings: { globalMode: false, emoteScale: 1.2 },
    });
    instance.start();
    expect(document.querySelector<HTMLElement>('.ea-e')?.style.height).toBe('1.8em');
    instance.stop();
  });

  it('groups zero-width emotes onto the previous emote', () => {
    document.body.innerHTML = `<div class="msg"><span class="body">base overlay</span></div>`;
    const instance = engine();
    const span = document.querySelector('.ea-e');
    expect(span).not.toBeNull();
    expect(span?.querySelectorAll('img')).toHaveLength(2);
    expect(span?.getAttribute('data-ea-text')).toBe('base overlay');
    instance.stop();
  });

  it('re-renders when a framework replaces spans with identical text', async () => {
    document.body.innerHTML = `<div class="msg"><span class="body">hi peepoSad</span></div>`;
    const instance = engine();
    expect(document.querySelectorAll('.ea-e')).toHaveLength(1);

    const body = document.querySelector('.body');
    body?.replaceChildren(document.createTextNode('hi peepoSad'));
    await wait();
    expect(document.querySelectorAll('.ea-e')).toHaveLength(1);
    instance.stop();
  });

  it('restores stale spans when the emote set changes', () => {
    document.body.innerHTML = `<div class="msg"><span class="body">peepoSad</span></div>`;
    const first = engine();
    expect(document.querySelectorAll('.ea-e')).toHaveLength(1);
    first.stop();

    const second = new ChatEngine({
      descriptor: descriptor(),
      emotes: [emote('catJAM')],
      settings,
    });
    second.start();
    expect(document.querySelectorAll('.ea-e')).toHaveLength(0);
    expect(document.querySelector('.body')?.textContent).toContain('peepoSad');
    second.stop();
  });

  it('treats active-emote flag 1 as zero-width too', () => {
    document.body.innerHTML = `<div class="msg"><span class="body">base activeOverlay</span></div>`;
    const instance = engine();
    const span = document.querySelector('.ea-e');
    expect(span?.querySelectorAll('img')).toHaveLength(2);
    instance.stop();
  });

  it('replaces everything outside excluded fields in global mode', () => {
    document.body.innerHTML = `
      <div class="msg">peepoSad</div>
      <p id="outside">catJAM</p>
      <code>peepoSad</code>
      <textarea>catJAM</textarea>
    `;
    const instance = engine(descriptor(), true);
    expect(document.querySelector('#outside .ea-e')).not.toBeNull();
    expect(document.querySelector('code .ea-e')).toBeNull();
    expect(document.querySelector('textarea')?.value).toBe('catJAM');
    instance.stop();
  });
});

describe('insertIntoComposer', () => {
  it('inserts into a textarea at the caret and fires input', () => {
    const textarea = document.createElement('textarea');
    textarea.value = 'hello';
    document.body.append(textarea);
    textarea.focus();
    textarea.setSelectionRange(5, 5);
    let fired = false;
    textarea.addEventListener('input', () => {
      fired = true;
    });
    expect(insertIntoComposer(textarea, ' peepo')).toBe(true);
    expect(textarea.value).toBe('hello peepo');
    expect(fired).toBe(true);
  });
});
