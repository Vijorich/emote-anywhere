// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AppSettings, Emote, PluginDescriptor } from '../src/core/types';
import { combineSelectors } from '../src/engine/dom';
import { ChatEngine } from '../src/engine/engine';
import { insertIntoComposer } from '../src/picker/insert';

const tokenizeCalls = vi.hoisted(() => ({ count: 0 }));

vi.mock('../src/engine/tokenize', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/engine/tokenize')>();
  return {
    ...actual,
    tokenizeText: (...args: Parameters<typeof actual.tokenizeText>) => {
      tokenizeCalls.count += 1;
      return actual.tokenizeText(...args);
    },
  };
});

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

afterEach(() => {
  vi.restoreAllMocks();
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

  it('combines valid selectors into one match call', () => {
    expect(combineSelectors(['.a', '>>bad', '.b'])).toBe('.a,.b');
    expect(combineSelectors(['>>bad'])).toBeNull();
  });

  it('keeps working when one exclusion selector is invalid', () => {
    document.body.innerHTML = `
      <div class="msg"><span class="body">peepoSad</span><code>peepoSad</code></div>
    `;
    const instance = engine(descriptor({ exclude: ['>>bad', 'code'] }));
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

  it('skips messages whose descendant matches a skip selector', () => {
    document.body.innerHTML = `
      <div class="msg"><div class="deleted"><span class="body">peepoSad</span></div></div>
    `;
    const instance = engine(descriptor({ skip: ['.deleted'] }));
    expect(document.querySelectorAll('.ea-e')).toHaveLength(0);
    instance.stop();
  });

  it('does not reprocess the DOM it rendered itself', async () => {
    document.body.innerHTML = `<div class="msg"><span class="body">hi peepoSad</span></div>`;
    const query = vi.spyOn(Element.prototype, 'querySelector');
    const instance = engine();
    await wait();

    const renderedChecks = query.mock.calls.filter(([selector]) => selector === '.ea-e');
    expect(renderedChecks).toHaveLength(0);
    instance.stop();
  });

  it('restores emotes when stopped', () => {
    document.body.innerHTML = `<div class="msg"><span class="body">hi peepoSad</span></div>`;
    const instance = engine();
    expect(document.querySelectorAll('.ea-e')).toHaveLength(1);

    instance.stop();

    expect(document.querySelectorAll('.ea-e')).toHaveLength(0);
    expect(document.querySelector('.body')?.textContent).toBe('hi peepoSad');
  });

  it('shows the emote code until its image loads', () => {
    document.body.innerHTML = `<div class="msg"><span class="body">peepoSad</span></div>`;
    const instance = engine();
    const span = document.querySelector<HTMLElement>('.ea-e');
    const image = span?.querySelector('img');
    expect(span?.textContent).toBe('peepoSad');
    expect(image?.style.display).toBe('none');

    image?.dispatchEvent(new Event('load'));

    expect(span?.textContent).toBe('');
    expect(image?.style.display).toBe('block');
    instance.stop();
  });

  it('keeps a bottom-scrolled chat at the bottom after rendering', () => {
    document.body.innerHTML = `
      <div class="scroll"><div class="msg"><span class="body">peepoSad</span></div></div>
    `;
    const scroll = document.querySelector<HTMLElement>('.scroll')!;
    Object.defineProperty(scroll, 'clientHeight', { value: 500, configurable: true });
    Object.defineProperty(scroll, 'scrollHeight', {
      configurable: true,
      get: () => (scroll.querySelector('.ea-e') ? 1040 : 1000),
    });
    scroll.scrollTop = 500;

    const instance = engine();

    expect(scroll.scrollTop).toBe(540);
    instance.stop();
  });

  it('renders appended emotes in the mutation microtask', async () => {
    document.body.innerHTML = `<div class="msg"><span class="body">hi</span></div>`;
    const instance = engine();
    const body = document.querySelector('.body');

    body?.append(document.createTextNode(' peepoSad'));
    await Promise.resolve();

    expect(document.querySelectorAll('.ea-e')).toHaveLength(1);
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

  it('uses the first message selector with results, including the root itself', () => {
    document.body.innerHTML = `
      <div id="chat" class="modern"><span class="body">peepoSad</span></div>
      <div class="legacy"><span class="body">catJAM</span></div>
    `;
    const instance = engine(
      descriptor({ roots: ['#chat'], messages: ['.modern', '.legacy'] }),
    );
    expect(document.querySelectorAll('#chat .ea-e')).toHaveLength(1);
    expect(document.querySelector('.legacy .ea-e')).toBeNull();
    expect(document.querySelector('.legacy .body')?.textContent).toBe('catJAM');
    instance.stop();
  });

  it('falls back to later message selectors when earlier ones have no results', () => {
    document.body.innerHTML = `<div class="legacy"><span class="body">peepoSad</span></div>`;
    const instance = engine(descriptor({ messages: ['.missing', '.legacy'] }));
    expect(document.querySelectorAll('.legacy .ea-e')).toHaveLength(1);
    instance.stop();
  });

  it('filters nested message candidates without pairwise ancestor checks', () => {
    let parent = document.body;
    for (let index = 0; index < 40; index++) {
      const message = document.createElement('div');
      message.className = 'msg';
      message.append('peepoSad');
      parent.append(message);
      parent = message;
    }
    const contains = vi.spyOn(Element.prototype, 'contains');
    const instance = engine(descriptor({ text: [] }));
    expect(document.querySelectorAll('.ea-e')).toHaveLength(40);
    expect(contains).not.toHaveBeenCalled();
    instance.stop();
  });

  it('uses the discovery message for mutations with conflicting nested selectors', async () => {
    document.body.innerHTML = `
      <div class="wrapper">
        <div class="message" id="outer-message">
          <span class="body">peepoSad</span>
          <div class="message">
            <div class="wrapper"><span class="body" id="edited">ready</span></div>
          </div>
        </div>
      </div>
    `;
    const instance = engine(descriptor({ messages: ['.message', '.wrapper'] }));
    const original = document.querySelector('#outer-message > .body .ea-e img');
    expect(original).not.toBeNull();

    const edited = document.querySelector('#edited');
    if (edited) edited.textContent = 'catJAM';
    await wait();

    const replacement = document.querySelector('#outer-message > .body .ea-e img');
    expect(replacement).not.toBe(original);
    expect(original?.isConnected).toBe(false);
    expect(document.querySelector('#edited .ea-e')?.getAttribute('data-ea-code')).toBe('catJAM');
    instance.stop();
  });

  it('does not recreate emote images for excluded-only edits', async () => {
    document.body.innerHTML = `
      <div class="msg">
        <div class="author">author</div>
        <span class="body">hi peepoSad</span>
        <span class="timestamp">12:00</span>
        <div class="reactions">catJAM</div>
        <div class="attachments">attachment peepoSad</div>
      </div>
    `;
    const instance = engine(
      descriptor({
        text: [],
        exclude: ['.author', '.timestamp', '.reactions', '.attachments'],
      }),
    );
    const image = document.querySelector('.ea-e img');
    expect(image).not.toBeNull();
    for (const selector of ['.author', '.timestamp', '.reactions', '.attachments']) {
      const element = document.querySelector(selector);
      if (element) element.textContent = `edited ${selector}`;
    }
    await wait();
    expect(document.querySelectorAll('.ea-e')).toHaveLength(1);
    expect(document.querySelector('.ea-e img')).toBe(image);
    expect(image?.isConnected).toBe(true);
    instance.stop();
  });

  it('does not tokenize an unchanged message without emotes', async () => {
    document.body.innerHTML = `
      <div class="msg"><span class="body">plain text</span><span class="meta">old</span></div>
    `;
    const instance = engine(descriptor({ exclude: ['.meta'] }));
    tokenizeCalls.count = 0;

    const meta = document.querySelector('.meta');
    if (meta) meta.textContent = 'new';
    await wait();

    expect(tokenizeCalls.count).toBe(0);
    instance.stop();
  });

  it('does not recreate emote images for edits outside configured text roots', async () => {
    document.body.innerHTML = `
      <div class="msg"><span class="body">peepoSad</span><span class="metadata">old</span></div>
    `;
    const instance = engine();
    const image = document.querySelector('.ea-e img');
    const metadata = document.querySelector('.metadata');
    if (metadata) metadata.textContent = 'new';
    await wait();
    expect(document.querySelector('.ea-e img')).toBe(image);
    instance.stop();
  });

  it('recreates emote images for real body edits', async () => {
    document.body.innerHTML = `<div class="msg"><span class="body">peepoSad</span></div>`;
    const instance = engine();
    const original = document.querySelector('.ea-e img');
    const body = document.querySelector('.body');
    if (body) body.textContent = 'catJAM only';
    await wait();
    const replacement = document.querySelector('.ea-e img');
    expect(replacement).not.toBeNull();
    expect(replacement).not.toBe(original);
    expect(original?.isConnected).toBe(false);
    expect(replacement?.getAttribute('alt')).toBe('catJAM');
    instance.stop();
  });

  it('does not re-resolve connected chat roots for mutations inside them', async () => {
    document.body.innerHTML = `
      <div id="chat">
        <div class="msg"><span class="body">one</span></div>
        <div class="msg"><span class="body">two</span></div>
      </div>
    `;
    const instance = engine(descriptor({ roots: ['#chat'] }));
    const query = vi.spyOn(document, 'querySelectorAll');
    const bodies = document.querySelectorAll('.body');
    bodies[0]?.append(' edited');
    bodies[1]?.append(' edited');
    await wait();
    expect(query.mock.calls.filter(([selector]) => selector === '#chat')).toHaveLength(0);
    instance.stop();
  });

  it('picks up a chat root that mounts after start', async () => {
    document.body.innerHTML = `<div id="app"></div>`;
    const instance = engine(descriptor({ roots: ['#chat'] }));
    expect(document.querySelectorAll('.ea-e')).toHaveLength(0);

    document.body.innerHTML = `
      <div id="chat"><div class="msg"><span class="body">peepoSad</span></div></div>
    `;
    await wait();

    expect(document.querySelectorAll('#chat .ea-e')).toHaveLength(1);
    instance.stop();
  });

  it('observes a second chat root added later', async () => {
    document.body.innerHTML = `
      <div id="chat"><div class="msg"><span class="body">peepoSad</span></div></div>
    `;
    const instance = engine(descriptor({ roots: ['#chat'] }));
    expect(document.querySelectorAll('#chat .ea-e')).toHaveLength(1);

    const second = document.createElement('div');
    second.id = 'chat';
    second.innerHTML = `<div class="msg"><span class="body">catJAM</span></div>`;
    document.body.append(second);
    await wait();

    expect(second.querySelectorAll('.ea-e')).toHaveLength(1);
    second.querySelector('.body')?.append(' peepoSad');
    await wait();
    expect(second.querySelectorAll('.ea-e')).toHaveLength(2);
    instance.stop();
  });

  it('reattaches when the chat root is replaced', async () => {
    document.body.innerHTML = `
      <div id="chat"><div class="msg"><span class="body">peepoSad</span></div></div>
    `;
    const instance = engine(descriptor({ roots: ['#chat'] }));
    expect(document.querySelectorAll('#chat .ea-e')).toHaveLength(1);

    const next = document.createElement('div');
    next.id = 'chat';
    next.innerHTML = `<div class="msg"><span class="body">catJAM</span></div>`;
    document.querySelector('#chat')?.replaceWith(next);
    await wait();

    expect(next.querySelectorAll('.ea-e')).toHaveLength(1);
    expect(next.querySelector('.ea-e')?.getAttribute('data-ea-code')).toBe('catJAM');
    instance.stop();
  });

  it('does not inspect mutations outside the chat root', async () => {
    document.body.innerHTML = `
      <div id="chat"><div class="msg"><span class="body">hi</span></div></div>
      <div id="outside"></div>
    `;
    const instance = engine(descriptor({ roots: ['#chat'] }));
    const closest = vi.spyOn(Element.prototype, 'closest');
    const outside = document.querySelector('#outside');
    if (outside) outside.innerHTML = `<div class="msg"><span class="body">peepoSad</span></div>`;
    await wait();

    expect(closest).not.toHaveBeenCalled();
    instance.stop();
  });

  it('ignores outside-root mutations without scheduling an empty flush', async () => {
    document.body.innerHTML = `<div id="chat"></div><div id="outside"></div>`;
    const instance = engine(descriptor({ roots: ['#chat'] }));
    const timeout = vi.spyOn(window, 'setTimeout');
    const outside = document.querySelector('#outside');
    if (outside) {
      outside.innerHTML = `<div class="msg"><span class="body">peepoSad</span></div>`;
    }
    await wait();
    expect(document.querySelector('#outside .ea-e')).toBeNull();
    expect(timeout.mock.calls.some(([, delay]) => delay === 40)).toBe(false);
    instance.stop();
  });

  it('falls back to body when configured roots are absent', () => {
    document.body.innerHTML = `<div class="msg"><span class="body">peepoSad</span></div>`;
    const instance = engine(descriptor({ roots: ['#missing'] }));
    expect(document.querySelectorAll('.ea-e')).toHaveLength(1);
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
