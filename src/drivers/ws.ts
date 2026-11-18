export type WsFactory = (url: string) => WebSocket;

/** Opens a WebSocket and resolves once it is connected. */
export function openSocket(factory: WsFactory, url: string, timeoutMs: number): Promise<WebSocket> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket;
    try {
      ws = factory(url);
    } catch (e) {
      reject(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    const timer = setTimeout(() => {
      try { ws.close(); } catch { /* ignore */ }
      reject(new Error('The TV did not answer. Check that it is on and on the same Wi-Fi.'));
    }, timeoutMs);
    ws.onopen = () => {
      clearTimeout(timer);
      resolve(ws);
    };
    ws.onerror = () => {
      clearTimeout(timer);
      reject(new Error('Could not reach the TV. Check that it is on and on the same Wi-Fi.'));
    };
  });
}
