import './style.css';
import { browser } from 'wxt/browser';
import { rpc } from '../../core/rpc';
import type { AppSettings, AppState, InstalledPlugin } from '../../core/types';
import { brand } from '../../ui/components';
import { h } from '../../ui/dom';
import { trackFocusModality } from '../../ui/focus-modality';
import { noticeBanner as buildNotice, type Notice, type NoticeAction } from '../../ui/notice';
import type { OptionsContext } from './context';
import { bindingsView } from './views/bindings';
import { helpView } from './views/help';
import { settingsView } from './views/settings';
import { sourcesView } from './views/sources';

type ViewId = 'sources' | 'bindings' | 'settings' | 'help';

const appElement = document.querySelector<HTMLElement>('#app');
if (!appElement) throw new Error('Missing #app');
const app: HTMLElement = appElement;
trackFocusModality();
const version = browser.runtime.getManifest().version;

let state: AppState | null = null;
let view: ViewId = 'sources';
let notice: Notice | null = null;
let noticeTimer: number | null = null;
let refreshTimer: number | null = null;
let pendingRefresh = false;

const VIEWS: Array<{ id: ViewId; label: string }> = [
  { id: 'sources', label: 'Sources' },
  { id: 'bindings', label: 'Sets' },
  { id: 'settings', label: 'Settings' },
  { id: 'help', label: 'Help' },
];

function parseHash(): void {
  const [name = 'sources'] = location.hash.replace(/^#/, '').split('/');
  view = (VIEWS.some((item) => item.id === name) ? name : 'sources') as ViewId;
}

function show(text: string, kind: 'ok' | 'error' = 'ok', action?: NoticeAction): void {
  notice = { text, kind, action };
  if (noticeTimer !== null) {
    window.clearTimeout(noticeTimer);
    noticeTimer = null;
  }
  if (state || kind !== 'error') {
    noticeTimer = window.setTimeout(
      () => {
        noticeTimer = null;
        notice = null;
        updateNotice();
      },
      action ? 8000 : 6000,
    );
  }
  updateNotice();
}

async function refresh(message?: string, action?: NoticeAction): Promise<void> {
  try {
    state = await rpc<AppState>('state/get');
    render();
    if (message) show(message, 'ok', action);
  } catch (error) {
    show(error instanceof Error ? error.message : String(error), 'error');
    if (!state) render();
  }
}

function scheduleRefresh(): void {
  if (refreshTimer !== null) window.clearTimeout(refreshTimer);
  refreshTimer = window.setTimeout(() => {
    refreshTimer = null;
    void refresh();
  }, 300);
}

async function requestOrigin(url: string): Promise<boolean> {
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return false;
    return await browser.permissions.request({
      origins: [`${parsed.protocol}//${parsed.hostname}/*`],
    });
  } catch {
    return false;
  }
}

async function updateGlobalSets(
  sets: string[],
  message: string,
  action?: NoticeAction,
): Promise<void> {
  try {
    await rpc('globalBinding/set', { sets });
    await refresh(message, action);
  } catch (error) {
    show(error instanceof Error ? error.message : String(error), 'error');
  }
}

function updateSettings(patch: Partial<AppSettings>): void {
  void rpc('settings/update', { patch })
    .then(() => refresh())
    .catch((error: unknown) => {
      show(String(error), 'error');
      render();
    });
}

function togglePlugin(plugin: InstalledPlugin, enabled: boolean): void {
  void (async () => {
    try {
      if (enabled) {
        const granted = await browser.permissions.request({ origins: plugin.descriptor.matches });
        if (!granted) {
          show(
            'Site access was not granted. Turn the plugin on again and allow access to its sites.',
            'error',
          );
          render();
          return;
        }
        await rpc('plugin/enable', { key: plugin.key });
        await refresh();
      } else {
        await rpc('plugin/disable', { key: plugin.key });
        await refresh();
      }
    } catch (error) {
      show(error instanceof Error ? error.message : String(error), 'error');
      render();
    }
  })();
}

function noticeBanner(): HTMLElement | null {
  return notice ? buildNotice(notice, 'data-notice') : null;
}

function updateNotice(): void {
  const current = app.querySelector('[data-notice]');
  const next = noticeBanner();
  if (current) {
    if (next) current.replaceWith(next);
    else current.remove();
  } else if (next) {
    app.querySelector('.view')?.prepend(next);
  }
}

function navLinks(idPrefix = 'nav'): HTMLElement {
  return h(
    'nav',
    { class: 'nav', 'aria-label': 'Sections' },
    ...VIEWS.map((item) =>
      h(
        'a',
        {
          id: `${idPrefix}-${item.id}`,
          class: 'nav-link',
          href: `#${item.id}`,
          'aria-current': view === item.id ? 'page' : null,
          text: item.label,
        },
      ),
    ),
  );
}

function mobileDialog(): HTMLDialogElement {
  const dialog = h('dialog', {
    class: 'nav-dialog',
    id: 'nav-dialog',
    'aria-label': 'Sections',
  });
  dialog.append(
    h(
      'div',
      { class: 'row' },
      h('h2', { class: 'dialog-title', text: 'Sections' }),
      h('button', {
        class: 'btn quiet tiny',
        type: 'button',
        text: 'Close',
        onclick: () => dialog.close(),
      }),
    ),
    navLinks('mobile-nav'),
    h('p', { class: 'dialog-version', text: `v${version}` }),
  );
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog || (event.target as Element).closest('a')) {
      dialog.close();
    }
  });
  return dialog;
}

function stateFallbackView(title: string): HTMLElement {
  const failed = notice?.kind === 'error';
  return h(
    'main',
    { class: 'view' },
    noticeBanner(),
    h('header', { class: 'view-head' }, h('h1', { text: title })),
    h('div', {
      class: 'empty',
      role: 'status',
      text: failed ? 'Could not load settings.' : 'Loading…',
    }),
    failed
      ? h(
          'div',
          { class: 'form-actions' },
          h('button', {
            class: 'btn primary',
            type: 'button',
            text: 'Retry',
            onclick: () => {
              if (noticeTimer !== null) window.clearTimeout(noticeTimer);
              noticeTimer = null;
              notice = null;
              render();
              void refresh();
            },
          }),
        )
      : null,
  );
}

const optionsContext: OptionsContext = {
  getState: () => state,
  show,
  refresh,
  noticeBanner,
  requestOrigin,
  updateGlobalSets,
  updateSettings,
  togglePlugin,
};

function focusHeading(): void {
  const heading = app.querySelector<HTMLElement>('.view h1');
  heading?.setAttribute('tabindex', '-1');
  heading?.focus();
}

function render(): void {
  const focusKey = (document.activeElement as HTMLElement | null)?.dataset.focusKey ?? null;
  const dialog = mobileDialog();
  const title = VIEWS.find((item) => item.id === view)?.label ?? 'Sources';
  const menuButton = h('button', {
    class: 'btn quiet menu-button',
    type: 'button',
    text: 'Menu',
    'aria-haspopup': 'dialog',
    'aria-controls': 'nav-dialog',
    'aria-expanded': 'false',
    onclick: () => {
      menuButton.setAttribute('aria-expanded', 'true');
      dialog.addEventListener(
        'close',
        () => menuButton.setAttribute('aria-expanded', 'false'),
        { once: true },
      );
      dialog.showModal();
    },
  });
  const sidebar = h(
    'aside',
    { class: 'sidebar', 'aria-label': 'Options sidebar' },
    brand(),
    navLinks(),
    h('div', { class: 'sidebar-foot' }, h('span', { class: 'version', text: `v${version}` })),
  );

  const content = !state
    ? stateFallbackView(title)
    : view === 'bindings'
      ? bindingsView(state, optionsContext)
      : view === 'settings'
        ? settingsView(state, optionsContext)
        : view === 'help'
          ? helpView()
          : sourcesView(state, optionsContext);

  app.replaceChildren(
    h('button', {
      class: 'btn primary skip-link',
      type: 'button',
      text: 'Skip to content',
      onclick: () => focusHeading(),
    }),
    h(
      'div',
      { class: 'app' },
      sidebar,
      h(
        'div',
        { class: 'main' },
        h(
          'header',
          { class: 'topbar' },
          brand(),
          menuButton,
        ),
        h('div', { class: 'sheet' }, content),
      ),
    ),
    dialog,
  );

  document.title = `${title} · Emote Anywhere`;

  if (focusKey) {
    const target = Array.from(
      app.querySelectorAll<HTMLElement>('[data-focus-key]'),
    ).find((element) => element.dataset.focusKey === focusKey);
    target?.focus();
  }
}

window.addEventListener('hashchange', () => {
  parseHash();
  window.scrollTo({ top: 0 });
  render();
  focusHeading();
});

browser.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local' || !changes['state']) return;
  const active = document.activeElement;
  if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) {
    pendingRefresh = true;
    return;
  }
  pendingRefresh = false;
  scheduleRefresh();
});

document.addEventListener(
  'focusout',
  () => {
    if (!pendingRefresh) return;
    window.setTimeout(() => {
      const active = document.activeElement;
      if (active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA')) return;
      pendingRefresh = false;
      scheduleRefresh();
    }, 0);
  },
  true,
);

parseHash();
render();
void refresh();
