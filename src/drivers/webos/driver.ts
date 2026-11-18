import { currentDevice } from '../deviceRegistry.ts';
import type { Deps } from '../deps.ts';
import { notifyCredential, notifyHostLost } from '../events.ts';
import { confirmOff, wakeViaLan } from '../power.ts';
import type { ActionResult, Capabilities, DeviceDriver, DeviceInfo, InputOption, RemoteKey } from '../types.ts';
import { APPS } from '../../voice/apps.ts';
import { LgConnection } from './connection.ts';

const failed = (e: unknown): ActionResult => ({ outcome: 'failed', message: e instanceof Error ? e.message : String(e) });
const done = (message: string): ActionResult => ({ outcome: 'confirmed', message });

const BUTTON: Partial<Record<RemoteKey, string>> = {
  UP: 'UP', DOWN: 'DOWN', LEFT: 'LEFT', RIGHT: 'RIGHT', OK: 'ENTER', BACK: 'BACK', HOME: 'HOME', MENU: 'MENU',
};

function ourInputId(lgId: string): string {
  const hdmi = lgId.match(/^HDMI_?(\d)$/i);
  if (hdmi) return `HDMI${hdmi[1]}`;
  if (/^AV_?\d?$/i.test(lgId)) return 'AV';
  return lgId.replace(/_/g, '');
}

export class LgWebOsDriver implements DeviceDriver {
  readonly kind = 'webos' as const;
  readonly requiresPairing = false;
  private device: DeviceInfo;
  private deps: Deps;
  private conn: LgConnection | null = null;
  private lgInputs = new Map<string, string>();

  constructor(device: DeviceInfo, deps: Deps) {
    this.device = device;
    this.deps = deps;
  }

  getCapabilities(): Capabilities {
    return {
      navigation: 'supported', volume_step: 'supported', volume_set: 'supported', mute: 'supported',
      playback: 'supported', launch_app: 'supported', close_app: 'supported', power_off: 'supported',
      power_on: 'unverified', list_inputs: 'supported', switch_input: 'supported',
    };
  }

  async beginPairing(): Promise<ActionResult> {
    return done('Nothing to enter. Tap Connect, then accept the request on the TV.');
  }

  async pair(_code: string): Promise<ActionResult> {
    return done('Nothing to enter. Tap Connect, then accept the request on the TV.');
  }

  async connect(): Promise<ActionResult> {
    try {
      this.conn?.close();
      const conn = new LgConnection(this.deps.ws);
      conn.onClosed(() => notifyHostLost(this.device.host));
      this.conn = conn;
      const saved = currentDevice(this.device.id)?.credential ?? this.device.credential;
      const key = await conn.connect(this.device.host, saved, () => {});
      if (key && key !== saved) {
        this.device = { ...this.device, credential: key };
        notifyCredential(this.device.id, key);
      }
      return done('Connected to the LG TV.');
    } catch (e) {
      this.conn = null;
      return failed(e);
    }
  }

  async disconnect(): Promise<void> {
    this.conn?.close();
    this.conn = null;
  }

  private async isMuted(c: LgConnection): Promise<boolean> {
    const r = await c.request('ssap://audio/getVolume');
    return Boolean(r.muted ?? r.volumeStatus?.muteStatus);
  }

  async sendKey(key: RemoteKey): Promise<ActionResult> {
    const c = this.conn;
    if (!c) return { outcome: 'failed', message: 'Not connected to the TV.' };
    try {
      const button = BUTTON[key];
      if (button) {
        await c.sendButton(button);
        return { outcome: 'sent', message: `${key} sent.` };
      }
      switch (key) {
        case 'VOL_UP': await c.request('ssap://audio/volumeUp'); return done('Volume up.');
        case 'VOL_DOWN': await c.request('ssap://audio/volumeDown'); return done('Volume down.');
        case 'MUTE': {
          const muted = await this.isMuted(c);
          await c.request('ssap://audio/setMute', { mute: !muted });
          return done(muted ? 'Unmuted.' : 'Muted.');
        }
        case 'PLAY': await c.request('ssap://media.controls/play'); return done('Play.');
        case 'PAUSE': await c.request('ssap://media.controls/pause'); return done('Pause.');
        case 'STOP': await c.request('ssap://media.controls/stop'); return done('Stop.');
        case 'PREVIOUS': await c.request('ssap://media.controls/rewind'); return done('Rewind.');
        case 'NEXT': await c.request('ssap://media.controls/fastForward'); return done('Fast forward.');
        case 'CH_UP': await c.request('ssap://tv/channelUp'); return done('Channel up.');
        case 'CH_DOWN': await c.request('ssap://tv/channelDown'); return done('Channel down.');
        default: return { outcome: 'unsupported', message: `${key} is not available on this TV.` };
      }
    } catch (e) {
      return failed(e);
    }
  }

  async launchApp(appId: string): Promise<ActionResult> {
    const app = APPS.find((a) => a.id === appId);
    if (!app || !app.webosId) return { outcome: 'failed', message: 'No LG app id is known for that app yet.' };
    if (!this.conn) return { outcome: 'failed', message: 'Not connected to the TV.' };
    try {
      await this.conn.request('ssap://system.launcher/launch', { id: app.webosId });
      return done(`${app.name} was opened by the TV.`);
    } catch (e) {
      return failed(e);
    }
  }

  async closeApp(appId: string): Promise<ActionResult> {
    const c = this.conn;
    if (!c) return { outcome: 'failed', message: 'Not connected to the TV.' };
    try {
      let id = APPS.find((a) => a.id === appId)?.webosId;
      if (!id) {
        const fg = await c.request('ssap://com.webos.applicationManager/getForegroundAppInfo');
        id = String(fg.appId || '');
      }
      if (!id) return { outcome: 'failed', message: 'No app is open to close.' };
      await c.request('ssap://system.launcher/close', { id });
      return done('The app was closed.');
    } catch (e) {
      return failed(e);
    }
  }

  async setVolume(level: number): Promise<ActionResult> {
    if (!this.conn) return { outcome: 'failed', message: 'Not connected to the TV.' };
    try {
      await this.conn.request('ssap://audio/setVolume', { volume: level });
      return done(`Volume set to ${level}.`);
    } catch (e) {
      return failed(e);
    }
  }

  async powerOff(): Promise<ActionResult> {
    if (!this.conn) return { outcome: 'failed', message: 'Not connected to the TV.' };
    try {
      await this.conn.request('ssap://system/turnOff');
    } catch (e) {
      return failed(e);
    }
    return confirmOff({ probe: () => this.deps.probe(this.device.host, 3000) });
  }

  async powerOn(): Promise<ActionResult> {
    const host = this.device.host;
    const mac = currentDevice(this.device.id)?.mac ?? this.device.mac;
    return wakeViaLan({ mac, probe: () => this.deps.probe(host, 3000), send: (p) => this.deps.sendMagic(host, p) });
  }

  async listInputs(): Promise<InputOption[]> {
    const options: InputOption[] = [{ id: 'TV', label: 'TV (live channels)', support: 'supported', source: 'reported' }];
    if (!this.conn) return options;
    try {
      const r = await this.conn.request('ssap://tv/getExternalInputList');
      const devices = Array.isArray(r.devices) ? (r.devices as Array<{ id?: string; label?: string }>) : [];
      this.lgInputs.clear();
      for (const d of devices) {
        if (!d.id) continue;
        const id = ourInputId(d.id);
        if (this.lgInputs.has(id)) continue;
        this.lgInputs.set(id, d.id);
        options.push({ id, label: d.label || id, support: 'supported', source: 'reported' });
      }
    } catch {
      // keep just the TV option
    }
    return options;
  }

  async switchInput(inputId: string): Promise<ActionResult> {
    if (!this.conn) return { outcome: 'failed', message: 'Not connected to the TV.' };
    try {
      if (inputId === 'TV') {
        await this.conn.request('ssap://system.launcher/launch', { id: 'com.webos.app.livetv' });
        return done('Switched to live TV.');
      }
      if (inputId === 'PICKER') {
        await this.conn.request('ssap://system.launcher/launch', { id: 'com.webos.app.inputpicker' });
        return done('Opened the input picker.');
      }
      if (this.lgInputs.size === 0) await this.listInputs();
      const hdmi = inputId.match(/^HDMI(\d)$/);
      const lgId = this.lgInputs.get(inputId) ?? (hdmi ? `HDMI_${hdmi[1]}` : inputId === 'AV' ? 'AV_1' : inputId);
      await this.conn.request('ssap://tv/switchInput', { inputId: lgId });
      return done(`Switched to ${inputId}.`);
    } catch (e) {
      return failed(e);
    }
  }
}
