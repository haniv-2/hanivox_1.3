import { APPS } from '../../voice/apps';
import { currentDevice } from '../deviceRegistry';
import { notifyHostLost } from '../events';
import { GUESS_INPUTS } from '../inputs';
import type {
  ActionResult, Capabilities, DeviceDriver, DeviceInfo, InputOption, RemoteKey,
} from '../types';
import { probePort, sendMagic } from '../net';
import { confirmOff, wakeViaLan } from '../power';
import { nativeTransport } from './nativeTransport';
import { KEYCODE, REMOTE_PORT } from './protocol';
import { PairingSession, RemoteSession } from './session';

const failed = (e: unknown): ActionResult => ({
  outcome: 'failed',
  message: e instanceof Error ? e.message : String(e),
});

const KEY_FOR: Record<RemoteKey, number> = {
  UP: KEYCODE.UP, DOWN: KEYCODE.DOWN, LEFT: KEYCODE.LEFT, RIGHT: KEYCODE.RIGHT, OK: KEYCODE.OK,
  BACK: KEYCODE.BACK, HOME: KEYCODE.HOME, MENU: KEYCODE.MENU,
  VOL_UP: KEYCODE.VOL_UP, VOL_DOWN: KEYCODE.VOL_DOWN, MUTE: KEYCODE.MUTE,
  PLAY: KEYCODE.PLAY, PAUSE: KEYCODE.PAUSE, STOP: KEYCODE.STOP,
  NEXT: KEYCODE.NEXT, PREVIOUS: KEYCODE.PREVIOUS, CH_UP: KEYCODE.CH_UP, CH_DOWN: KEYCODE.CH_DOWN,
};

const INPUT_KEY: Record<string, number> = {
  HDMI1: KEYCODE.HDMI1, HDMI2: KEYCODE.HDMI2, HDMI3: KEYCODE.HDMI3, HDMI4: KEYCODE.HDMI4,
  AV: KEYCODE.AV, TV: KEYCODE.TV, PICKER: KEYCODE.TV_INPUT,
};

export class AndroidTvDriver implements DeviceDriver {
  readonly kind = 'androidtv' as const;
  readonly requiresPairing = true;
  private device: DeviceInfo;
  private pairing: PairingSession | null = null;
  private remote: RemoteSession | null = null;

  constructor(device: DeviceInfo) {
    this.device = device;
  }

  getCapabilities(): Capabilities {
    return {
      navigation: 'supported',
      volume_step: 'supported',
      volume_set: 'unsupported',
      mute: 'supported',
      playback: 'supported',
      launch_app: 'unverified',
      close_app: 'unsupported',
      power_off: 'unverified',
      power_on: 'unverified',
      list_inputs: 'unsupported',
      switch_input: 'unverified',
    };
  }

  async beginPairing(): Promise<ActionResult> {
    try {
      this.pairing?.close();
      const session = new PairingSession(nativeTransport);
      this.pairing = session;
      await session.begin(this.device.host);
      return { outcome: 'confirmed', message: 'Look at your TV screen. It is showing a 6-character code. Type it below.' };
    } catch (e) {
      this.pairing = null;
      return failed(e);
    }
  }

  async pair(code: string): Promise<ActionResult> {
    if (!this.pairing) return { outcome: 'failed', message: 'Tap "Show code on TV" first.' };
    try {
      await this.pairing.finish(code);
      this.pairing = null;
      return { outcome: 'confirmed', message: 'Paired. You can connect now.' };
    } catch (e) {
      return failed(e);
    }
  }

  async connect(): Promise<ActionResult> {
    try {
      this.remote?.close();
      const session = new RemoteSession(nativeTransport);
      session.onClosed(() => notifyHostLost(this.device.host));
      this.remote = session;
      await session.connect(this.device.host);
      return { outcome: 'confirmed', message: 'Connected to the TV.' };
    } catch (e) {
      this.remote = null;
      return failed(e);
    }
  }

  async disconnect(): Promise<void> {
    this.pairing?.close();
    this.remote?.close();
    this.remote = null;
  }

  private async press(code: number, okMessage: string): Promise<ActionResult> {
    if (!this.remote) return { outcome: 'failed', message: 'Not connected to the TV.' };
    try {
      await this.remote.sendKey(code);
      return { outcome: 'sent', message: okMessage };
    } catch (e) {
      return failed(e);
    }
  }

  sendKey(key: RemoteKey): Promise<ActionResult> {
    return this.press(KEY_FOR[key], `${key} sent. The TV does not report back, so this cannot be confirmed.`);
  }

  async launchApp(appId: string): Promise<ActionResult> {
    const app = APPS.find((a) => a.id === appId);
    if (!app || !app.androidTvLink) return { outcome: 'failed', message: 'No launch link is known for that app yet.' };
    if (!this.remote) return { outcome: 'failed', message: 'Not connected to the TV.' };
    try {
      await this.remote.launchLink(app.androidTvLink);
      return { outcome: 'sent', message: `Asked the TV to open ${app.name}. It only opens if the app is installed.` };
    } catch (e) {
      return failed(e);
    }
  }

  async closeApp(_appId: string): Promise<ActionResult> {
    return { outcome: 'unsupported', message: 'Google TV cannot close apps remotely.' };
  }

  async setVolume(_level: number): Promise<ActionResult> {
    return { outcome: 'unsupported', message: 'Google TV cannot set an exact volume, only step it up or down.' };
  }

  async powerOff(): Promise<ActionResult> {
    const sent = await this.press(KEYCODE.POWER, '');
    if (sent.outcome === 'failed') return sent;
    return confirmOff({ probe: () => probePort(this.device.host, REMOTE_PORT) });
  }

  async powerOn(): Promise<ActionResult> {
    const host = this.device.host;
    const mac = currentDevice(this.device.id)?.mac ?? this.device.mac;
    // A TV in light standby still answers on the network: wake it with the wake key.
    if (await probePort(host, REMOTE_PORT, 1500)) {
      try {
        if (!this.remote || !this.remote.isReady) {
          const c = await this.connect();
          if (c.outcome !== 'confirmed') return c;
        }
        await this.remote!.sendKey(KEYCODE.WAKEUP);
        return {
          outcome: 'sent',
          message: 'The TV is on the network and I sent the wake key. The TV does not report whether the screen came on.',
        };
      } catch (e) {
        return failed(e);
      }
    }
    // Deep standby: only Wake-on-LAN can help, and only if the TV allows it.
    return wakeViaLan({ mac, probe: () => probePort(host, REMOTE_PORT, 1500), send: (p) => sendMagic(host, p) });
  }

  async listInputs(): Promise<InputOption[]> {
    return GUESS_INPUTS;
  }

  switchInput(inputId: string): Promise<ActionResult> {
    const code = INPUT_KEY[inputId];
    if (code === undefined) return Promise.resolve({ outcome: 'failed', message: `Unknown input ${inputId}.` });
    return this.press(code, `${inputId} key sent. Many TVs ignore it, and this cannot be confirmed.`);
  }
}
