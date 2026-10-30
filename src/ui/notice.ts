import { h } from './dom';

export interface NoticeAction {
  label: string;
  run: () => void | Promise<void>;
}

export interface Notice {
  text: string;
  kind: 'ok' | 'error';
  action?: NoticeAction;
}

export function noticeBanner(
  notice: Notice,
  dataAttribute: 'data-message' | 'data-notice',
): HTMLElement {
  const action = notice.action;
  let button: HTMLButtonElement | null = null;
  if (action) {
    const actionButton = h('button', {
      class: 'btn tiny notice-action',
      type: 'button',
      text: action.label,
      onclick: () => {
        if (actionButton.disabled) return;
        actionButton.disabled = true;
        void Promise.resolve(action.run()).catch(() => {
          actionButton.disabled = false;
        });
      },
    });
    button = actionButton;
  }

  return h(
    'div',
    {
      class: notice.kind === 'error' ? 'banner error' : 'banner',
      role: notice.kind === 'error' ? 'alert' : 'status',
      [dataAttribute]: 'true',
    },
    notice.text,
    button,
  );
}
