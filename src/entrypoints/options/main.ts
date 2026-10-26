import './style.css';
import { browser } from 'wxt/browser';
import { PROJECT_URL } from '../../core/config';
import { rpc } from '../../core/rpc';
import type { AppSettings, AppState, InstalledPlugin } from '../../core/types';
import { brand } from '../../ui/components';
import { h, link } from '../../ui/dom';
import type { OptionsContext } from './context';
import { bindingsView } from './views/bindings';
import { helpView } from './views/help';
import { overviewView } from './views/overview';
import { settingsView } from './views/settings';
import { sourcesView } from './views/sources';

type ViewId = 'overview' | 'sources' | 'bindings' | 'settings' | 'help';

const appElement = document.querySelector<HTMLElement>('#app');
if (!appElement) throw new Error('Missing #app');
const app: HTMLElement = appElement;

let state: AppState | null = null;
let view: ViewId = 'overview';
let notice: { text: string; kind: 'ok' | 'error' } | null = null;
let noticeTimer: number | null = null;
let refreshTimer: number | null = null;
let pendingRefresh = false;

const VIEWS: Array<{ id: ViewId; label: string }> = [
  { id: 'overview', label: 'Overview' },
  { id: 'sources', label: 'Sources' },
  { id: 'bindings', label: 'Bindings' },
  { id: 'settings', label: 'Settings' },
  { id: 'help', label: 'Help' },
];

function parseHash(): void {
  const [name = 'overview'] = location.hash.replace(/^#/, '').split('/');
  view = (VIEWS.some((item) => item.id === name) ? name : 'overview') as ViewId;
}

function show(text: string, kind: 'ok' | 'error' = 'ok'): void {
  notice = { text, kind };
  if (noticeTimer !== null) {
    window.clearTimeout(noticeTimer);
    noticeTimer = null;
  }
  if (state || kind !== 'error') {
    noticeTimer = window.setTimeout(() => {
      noticeTimer = null;
      notice = null;
      updateNotice();
    }, 6000);
  }
  updateNotice();
}

async function refresh(message?: string): Promise<void> {
  try {
    state = await rpc<AppState>('state/get');
    render();
    if (message) show(message);
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

async function updateGlobalSets(sets: string[], message: string): Promise<void> {
  try {
    await rpc('globalBinding/set', { sets });
    await refresh(message);
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
          show('Host permission was not granted.', 'error');
          render();
          return;
        }
        await rpc('plugin/enable', { key: plugin.key });
        await refresh(`${plugin.descriptor.name} enabled`);
      } else {
        await rpc('plugin/disable', { key: plugin.key });
        await refresh(`${plugin.descriptor.name} disabled`);
      }
    } catch (error) {
      show(error instanceof Error ? error.message : String(error), 'error');
      render();
    }
  })();
}

function noticeBanner(): HTMLElement | null {
  if (!notice) return null;
  return h('div', {
    class: notice.kind === 'error' ? 'banner error' : 'banner',
    role: 'status',
    'data-notice': 'true',
    text: notice.text,
  });
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
    { class: 'nav', 'aria-label': 'Settings sections' },
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
  const dialog = h('dialog', { class: 'nav-dialog', 'aria-label': 'Sections' });
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
  );
  dialog.addEventListener('click', (event) => {
    if ((event.target as Element).closest('a')) dialog.close();
  });
  return dialog;
}

function stateFallbackView(title: string): HTMLElement {
  const failed = notice?.kind === 'error';
  return h(
    'main',
    { class: 'view' },
    noticeBanner(),
    h(
      'header',
      { class: 'view-head' },
      h('h1', { text: title }),
      h('p', {
        class: 'lede',
        text: failed ? 'The extension state could not be loaded.' : 'Loading extension state…',
      }),
    ),
    h('div', {
      class: 'empty',
      role: 'status',
      text: failed ? 'Settings are unavailable.' : 'Loading settings…',
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

function render(): void {
  const dialog = mobileDialog();
  const title = VIEWS.find((item) => item.id === view)?.label ?? 'Overview';
  const sidebar = h(
    'aside',
    { class: 'sidebar', 'aria-label': 'Options sidebar' },
    brand(),
    navLinks(),
    h(
      'div',
      { class: 'sidebar-foot' },
      h('span', { text: `v${browser.runtime.getManifest().version}` }),
      link(PROJECT_URL, 'Project page'),
    ),
  );

  const content = !state
    ? stateFallbackView(title)
    : view === 'sources'
      ? sourcesView(state, optionsContext)
      : view === 'bindings'
        ? bindingsView(state, optionsContext)
        : view === 'settings'
          ? settingsView(state, optionsContext)
          : view === 'help'
            ? helpView(state, optionsContext)
            : overviewView(state, optionsContext);

  app.replaceChildren(
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
          h('button', {
            class: 'btn quiet menu-button',
            type: 'button',
            text: 'Menu',
            'aria-haspopup': 'dialog',
            onclick: () => dialog.showModal(),
          }),
          h(
            'div',
            { class: 'crumb' },
            h('span', { text: 'Emote Anywhere' }),
            h('span', { 'aria-hidden': 'true', text: '/' }),
            h('strong', { text: title }),
          ),
          h(
            'div',
            { class: 'topbar-actions' },
            h('span', { class: 'save-state', role: 'status', text: 'Changes save automatically' }),
          ),
        ),
        h('div', { class: 'sheet' }, content),
      ),
    ),
    dialog,
  );

  document.title = `${title} · Emote Anywhere`;
}

window.addEventListener('hashchange', () => {
  parseHash();
  window.scrollTo({ top: 0 });
  render();
  const heading = app.querySelector<HTMLElement>('.view h1');
  heading?.setAttribute('tabindex', '-1');
  heading?.focus();
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
