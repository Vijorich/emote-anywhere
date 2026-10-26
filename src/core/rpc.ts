import { browser } from 'wxt/browser';
import type { RpcRequest, RpcResponse } from './types';

export async function rpc<T>(request: RpcRequest): Promise<T>;
export async function rpc<T>(
  type: RpcRequest['type'],
  payload?: Record<string, unknown>,
): Promise<T>;
export async function rpc<T>(
  requestOrType: RpcRequest | RpcRequest['type'],
  payload?: Record<string, unknown>,
): Promise<T> {
  const request =
    typeof requestOrType === 'string'
      ? ({ type: requestOrType, ...(payload ?? {}) } as RpcRequest)
      : requestOrType;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error('Background request timed out')), 30_000);
  });
  let response: RpcResponse<T> | undefined;
  try {
    response = (await Promise.race([
      browser.runtime.sendMessage(request) as Promise<RpcResponse<T> | undefined>,
      timeout,
    ])) as RpcResponse<T> | undefined;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
  if (!response) {
    throw new Error('Background did not respond. Reload the extension and try again.');
  }
  if (!response.ok) throw new Error(response.error);
  return response.data;
}

export type RpcHandler = (request: RpcRequest, sender: unknown) => Promise<unknown>;

export function registerRpcHandler(handler: RpcHandler): void {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    const request = message as RpcRequest | undefined;
    if (!request || typeof request !== 'object' || typeof request.type !== 'string') {
      return undefined;
    }
    handler(request, sender).then(
      (data) => sendResponse({ ok: true, data } satisfies RpcResponse<unknown>),
      (error: unknown) =>
        sendResponse({
          ok: false,
          error: error instanceof Error ? error.message : String(error),
        } satisfies RpcResponse<unknown>),
    );
    return true;
  });
}
