// Samsung Tizen smart TVs: remote keys over WebSocket (port 8001), app launch over HTTP.
// Written from the publicly documented behaviour. Newer models may require the secure
// port (8002), which this version does not support, and it must still be confirmed on a real TV.
import { asciiBytes, toBase64 } from '../androidtv/bytes.ts';
import { currentDevice } from '../deviceRegistry.ts';
import type { Deps } from '../deps.ts';
import { notifyCredential, notifyHostLost } from '../events.ts';
import { confirmOff, wakeViaLan } from '../power.ts';
import type { ActionResult, Capabilities, DeviceDriver, DeviceInfo, InputOption, RemoteKey } from '../types.ts';
import { openSocket } from '../ws.ts';
import { APPS } from '../../voice/apps.ts';

const failed = (e: unknown): ActionResult => ({ outcome: 'failed', message: e instanceof Error ? e.message : String(e) });

const KEY: Record<RemoteKey, string> = {
  UP: 'KEY_UP', DOWN: 'KEY_DOWN', LEFT: 'KEY_LEFT', RIGHT: 'KEY_RIGHT', OK: 'KEY_ENTER', BACK: 'KEY_RETURN',
  HOME: 'KEY_HOME', MENU: 'KEY_MENU', VOL_UP: 'KEY_VOLUP', VOL_DOWN: 'KEY_VOLDOWN', MUTE: 'KEY_MUTE',
  PLAY: 'KEY_PLAY', PAUSE: 'KEY_PAUSE', STOP: 'KEY_STOP', NEXT: 'KEY_FF', PREVIOUS: 'KEY_REWIND',
  CH_UP: 'KEY_CHUP', CH_DOWN: 'KEY_CHDOWN',
};

const GUESS: InputOption[] = [
  { id: 'TV', label: 'TV (live channels)', support: 'unverified', source: 'guess' },
  { id: 'HDMI1', label: 'HDMI (next HDMI input)', support: 'unverified', source: 'guess' },
  { id: 'AV', label: 'AV', support: 'unverified', source: 'guess' },
  { id: 'PICKER', label: "Open the TV's source menu", support: 'unverified', source: 'guess' },
];

export class SamsungTizenDriver implements DeviceDriver {
  readonly kind = 'tizen' as const;
  readonly requiresPairing = false;
  private device: DeviceInfo;
  private deps: Deps;
  private ws: WebSocket | null = null;

  constructor(device: DeviceInfo, deps: Deps) {
    this.device = device;
    this.deps = deps;
  }

  getCapabilities(): Capabilities {
    return {
      navigation: 'supported', volume_step: 'supported', volume_set: 'unsupported', mute: 'supported',
      playback: 'supported', launch_app: 'unverified', close_app: 'unverified', power_off: 'supported',
      power_on: 'unverified', list_inputs: 'unsupported', switch_input: 'unverified',
    };
  }

  async beginPairing(): Promise<ActionResult> {
    return { outcome: 'confirmed', message: 'Nothing to enter. Tap Connect, then press Allow on the TV.' };
  }

  async pair(_code: string): Promise<ActionResult> {
    return { outcome: 'confirmed', message: 'Nothing to enter. Tap Connect, then press Allow on the TV.' };
  }

  async connect(): Promise<ActionResult> {
    try {
      this.ws?.close();
      const name = toBase64(asciiBytes('Hanivox'));
      const token = currentDevice(this.device.id)?.credential ?? this.device.credential;
      const url = `ws://${this.device.host}:8001/api/v2/channels/samsung.remote.control?name=${encodeURIComponent(name)}${token ? `&token=${token}` : ''}`;
      const ws = await openSocket(this.deps.ws, url, 6000);
      this.ws = ws;
      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const timer = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error('The TV did not confirm. Press Allow on the TV within 30 seconds and try again.'));
        }, 30000);
        ws.onmessage = (ev: { data: unknown }) => {
          let msg: { event?: string; data?: { token?: string } };
          try { msg = JSON.parse(String(ev.data)); } catch { return; }
          if (msg.event === 'ms.channel.connect' && !settled) {
            settled = true;
            clearTimeout(timer);
            const newToken = msg.data?.token;
            if (newToken && newToken !== token) {
              this.device = { ...this.device, credential: newToken };
              notifyCredential(this.device.id, newToken);
            }
            resolve();
          } else if (msg.event === 'ms.channel.unauthorized' && !settled) {
            settled = true;
            clearTimeout(timer);
            reject(new Error('The TV refused the connection. Allow Hanivox under TV Settings → General → External Device Manager → Device Connection Manager.'));
          }
        };
        ws.onclose = () => {
          clearTimeout(timer);
          if (!settled) {
            settled = true;
            reject(new Error('The TV closed the connection.'));
          } else {
            this.ws = null;
            notifyHostLost(this.device.host);
          }
        };
      });
      return { outcome: 'confirmed', message: 'Connected to the Samsung TV.' };
    } catch (e) {
      this.ws = null;
      return failed(e);
    }
  }

  async disconnect(): Promise<void> {
    try { this.ws?.close(); } catch { /* ignore */ }
    this.ws = null;
  }

  private sendRaw(key: string): ActionResult | null {
    if (!this.ws) return { outcome: 'failed', message: 'Not connected to the TV.' };
    this.ws.send(JSON.stringify({
      method: 'ms.remote.control',
      params: { Cmd: 'Click', DataOfCmd: key, Option: 'false', TypeOfRemote: 'SendRemoteKey' },
    }));
    return null;
  }

  async sendKey(key: RemoteKey): Promise<ActionResult> {
    try {
      const err = this.sendRaw(KEY[key]);
      if (err) return err;
      return { outcome: 'sent', message: `${key} sent. The TV does not report back, so this cannot be confirmed.` };
    } catch (e) {
      return failed(e);
    }
  }

  async launchApp(appId: string): Promise<ActionResult> {
    const app = APPS.find((a) => a.id === appId);
    if (!app || !app.tizenId) return { outcome: 'failed', message: 'No Samsung app id is known for that app yet.' };
    try {
      const res = await this.deps.http(`http://${this.device.host}:8001/api/v2/applications/${app.tizenId}`, { method: 'POST' });
      if (!res.ok) return { outcome: 'failed', message: `The TV refused to open ${app.name} (HTTP ${res.status}). It may not be installed.` };
      return { outcome: 'sent', message: `Asked the TV to open ${app.name}. It only opens if the app is installed.` };
    } catch (e) {
      return failed(e);
    }
  }

  async closeApp(appId: string): Promise<ActionResult> {
    const app = APPS.find((a) => a.id === appId);
    if (!app || !app.tizenId) {
      const r = await this.sendKey('HOME');
      return r.outcome === 'failed' ? r : { outcome: 'sent', message: 'I do not know which app is open, so I pressed Home instead.' };
    }
    try {
      const res = await this.deps.http(`http://${this.device.host}:8001/api/v2/applications/${app.tizenId}`, { method: 'DELETE' });
      if (!res.ok) return { outcome: 'failed', message: `The TV did not close ${app.name} (HTTP ${res.status}).` };
      return { outcome: 'sent', message: `Asked the TV to close ${app.name}.` };
    } catch (e) {
      return failed(e);
    }
  }

  async setVolume(_level: number): Promise<ActionResult> {
    return { outcome: 'unsupported', message: 'Samsung TVs cannot set an exact volume from here, only step it up or down.' };
  }

  async powerOff(): Promise<ActionResult> {
    try {
      const err = this.sendRaw('KEY_POWER');
      if (err) return err;
    } catch (e) {
      return failed(e);
    }
    return confirmOff({ probe: () => this.deps.probe(this.device.host, 8001) });
  }

  async powerOn(): Promise<ActionResult> {
    const host = this.device.host;
    const mac = currentDevice(this.device.id)?.mac ?? this.device.mac;
    return wakeViaLan({ mac, probe: () => this.deps.probe(host, 8001), send: (p) => this.deps.sendMagic(host, p) });
  }

  async listInputs(): Promise<InputOption[]> {
    return GUESS;
  }

  async switchInput(inputId: string): Promise<ActionResult> {
    const key = inputId === 'TV' ? 'KEY_TV' : inputId === 'AV' ? 'KEY_AV1' : inputId === 'PICKER' ? 'KEY_SOURCE' : 'KEY_HDMI';
    try {
      const err = this.sendRaw(key);
      if (err) return err;
    } catch (e) {
      return failed(e);
    }
    const note = key === 'KEY_HDMI' ? ' Samsung only cycles to the next HDMI input, so it may not be the one you asked for.' : '';
    return { outcome: 'sent', message: `${key} sent.${note} This cannot be confirmed.` };
  }
}
