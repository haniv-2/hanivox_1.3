// LG webOS "SSAP" protocol over WebSocket (port 3000). Written from the publicly documented
// protocol; it still has to be confirmed on a real LG TV.
import { openSocket } from '../ws.ts';
import type { WsFactory } from '../ws.ts';

type Timer = ReturnType<typeof setTimeout>;
type Payload = Record<string, any>;

const PERMISSIONS = [
  'LAUNCH', 'LAUNCH_WEBAPP', 'APP_TO_APP', 'CLOSE', 'TEST_OPEN', 'TEST_PROTECTED',
  'CONTROL_AUDIO', 'CONTROL_DISPLAY', 'CONTROL_INPUT_JOYSTICK', 'CONTROL_INPUT_MEDIA_RECORDING',
  'CONTROL_INPUT_MEDIA_PLAYBACK', 'CONTROL_INPUT_TV', 'CONTROL_POWER', 'READ_APP_STATUS',
  'READ_CURRENT_CHANNEL', 'READ_INPUT_DEVICE_LIST', 'READ_NETWORK_STATE', 'READ_RUNNING_APPS',
  'READ_TV_CHANNEL_LIST', 'WRITE_NOTIFICATION_TOAST', 'READ_POWER_STATE', 'READ_COUNTRY_INFO',
];

export class LgConnection {
  private factory: WsFactory;
  private ws: WebSocket | null = null;
  private pointer: WebSocket | null = null;
  private seq = 0;
  private pending = new Map<string, { resolve: (p: Payload) => void; reject: (e: Error) => void; timer: Timer }>();
  private closedCallbacks: Array<() => void> = [];
  private connected = false;

  constructor(factory: WsFactory) {
    this.factory = factory;
  }

  get isConnected(): boolean {
    return this.connected;
  }

  onClosed(cb: () => void): void {
    this.closedCallbacks.push(cb);
  }

  /** Resolves with the pairing key. A first-time connection waits for the person to accept on the TV. */
  async connect(host: string, clientKey: string | undefined, onPrompt: () => void, timeoutMs = 45000): Promise<string> {
    this.close();
    const ws = await openSocket(this.factory, `ws://${host}:3000`, 6000);
    this.ws = ws;
    return new Promise<string>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.close();
        reject(new Error('The TV did not confirm. Accept the request on the TV within 45 seconds and try again.'));
      }, timeoutMs);

      ws.onmessage = (ev: { data: unknown }) => {
        let msg: { type?: string; id?: string; payload?: Payload; error?: string };
        try {
          msg = JSON.parse(String(ev.data));
        } catch {
          return;
        }
        if (msg.id === 'register_0') {
          if (msg.type === 'registered' && !settled) {
            settled = true;
            clearTimeout(timer);
            this.connected = true;
            resolve(String(msg.payload?.['client-key'] ?? clientKey ?? ''));
          } else if (msg.type === 'response') {
            onPrompt();
          } else if (msg.type === 'error' && !settled) {
            settled = true;
            clearTimeout(timer);
            this.close();
            reject(new Error(msg.error || 'The TV refused the connection.'));
          }
          return;
        }
        const p = msg.id ? this.pending.get(msg.id) : undefined;
        if (!p || !msg.id) return;
        this.pending.delete(msg.id);
        clearTimeout(p.timer);
        if (msg.type === 'error') p.reject(new Error(msg.error || 'The TV reported an error.'));
        else if (msg.payload && msg.payload.returnValue === false) p.reject(new Error(String(msg.payload.errorText || 'The TV could not do that.')));
        else p.resolve(msg.payload ?? {});
      };

      ws.onclose = () => {
        clearTimeout(timer);
        const wasConnected = this.connected;
        this.connected = false;
        for (const [, p] of this.pending) {
          clearTimeout(p.timer);
          p.reject(new Error('The TV closed the connection.'));
        }
        this.pending.clear();
        if (!settled) {
          settled = true;
          reject(new Error('The TV closed the connection.'));
        } else if (wasConnected) {
          this.closedCallbacks.forEach((cb) => cb());
        }
      };

      ws.send(JSON.stringify({
        type: 'register',
        id: 'register_0',
        payload: {
          forcePairing: false,
          pairingType: 'PROMPT',
          ...(clientKey ? { 'client-key': clientKey } : {}),
          manifest: { manifestVersion: 1, appVersion: '1.1', permissions: PERMISSIONS },
        },
      }));
    });
  }

  request(uri: string, payload?: Payload, timeoutMs = 8000): Promise<Payload> {
    const ws = this.ws;
    if (!ws || !this.connected) return Promise.reject(new Error('Not connected to the TV.'));
    const id = `req_${++this.seq}`;
    return new Promise<Payload>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('The TV did not answer in time.'));
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ type: 'request', id, uri, ...(payload ? { payload } : {}) }));
    });
  }

  /** Remote-style buttons (arrows, OK, Back, Home, Menu) go through a second "pointer" socket. */
  async sendButton(name: string): Promise<void> {
    if (!this.pointer || this.pointer.readyState !== 1) {
      const r = await this.request('ssap://com.webos.service.networkinput/getPointerInputSocket');
      const path = String(r.socketPath || '');
      if (!path) throw new Error('The TV did not offer a button channel.');
      this.pointer = await openSocket(this.factory, path, 6000);
    }
    this.pointer.send(`type:button\nname:${name}\n\n`);
  }

  close(): void {
    this.connected = false;
    try { this.pointer?.close(); } catch { /* ignore */ }
    this.pointer = null;
    const ws = this.ws;
    this.ws = null;
    try { ws?.close(); } catch { /* ignore */ }
  }
}
