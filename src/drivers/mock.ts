// Stage 1 simulator. It mimics the LIMITS of each TV family so the UI can be built and tested
// honestly, but it does NOT talk to any real TV. Every message is prefixed "Simulated".
import { APPS } from '../voice/apps';
import { GUESS_INPUTS } from './inputs';
import type {
  ActionResult, Capabilities, DeviceDriver, DeviceInfo, InputOption, RemoteKey, SimProfile,
} from './types';

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
const ok = (message: string): ActionResult => ({ outcome: 'confirmed', message: `Simulated: ${message}` });
const sent = (message: string): ActionResult => ({ outcome: 'sent', message: `Simulated: ${message}` });

function capsFor(profile: SimProfile): Capabilities {
  const base: Capabilities = {
    navigation: 'supported', volume_step: 'supported', volume_set: 'unsupported', mute: 'supported',
    playback: 'supported', launch_app: 'unverified', close_app: 'unsupported', power_off: 'supported',
    power_on: 'unverified', list_inputs: 'unsupported', switch_input: 'unverified',
  };
  if (profile === 'tizen') return { ...base, launch_app: 'supported', close_app: 'unverified' };
  if (profile === 'webos') {
    return {
      ...base, volume_set: 'supported', launch_app: 'supported', close_app: 'supported',
      list_inputs: 'supported', switch_input: 'supported',
    };
  }
  return base;
}

const REPORTED_INPUTS: InputOption[] = [
  { id: 'TV', label: 'TV (live channels)', support: 'supported', source: 'reported' },
  { id: 'HDMI1', label: 'HDMI 1', support: 'supported', source: 'reported' },
  { id: 'HDMI2', label: 'HDMI 2', support: 'supported', source: 'reported' },
  { id: 'HDMI3', label: 'HDMI 3', support: 'supported', source: 'reported' },
  { id: 'AV', label: 'AV', support: 'supported', source: 'reported' },
];

export class MockDriver implements DeviceDriver {
  readonly kind = 'mock' as const;
  readonly requiresPairing = true;
  private profile: SimProfile;
  private sim = { volume: 20, muted: false, input: 'TV', app: '' as string };

  constructor(device: DeviceInfo) {
    this.profile = device.profile ?? 'googletv';
  }

  getCapabilities(): Capabilities {
    return capsFor(this.profile);
  }

  async beginPairing(): Promise<ActionResult> {
    await wait(500);
    return ok('the TV would show a code now. Type any code of 4 or more characters.');
  }

  async pair(code: string): Promise<ActionResult> {
    await wait(700);
    if (code.trim().length < 4) return { outcome: 'failed', message: 'Simulated: that code is too short.' };
    return ok('paired.');
  }

  async connect(): Promise<ActionResult> {
    await wait(900);
    return ok('connected.');
  }

  async disconnect(): Promise<void> {
    await wait(200);
  }

  async sendKey(key: RemoteKey): Promise<ActionResult> {
    await wait(150);
    if (key === 'VOL_UP') this.sim.volume = Math.min(100, this.sim.volume + 1);
    if (key === 'VOL_DOWN') this.sim.volume = Math.max(0, this.sim.volume - 1);
    if (key === 'MUTE') this.sim.muted = !this.sim.muted;
    if (key === 'VOL_UP' || key === 'VOL_DOWN') return sent(`volume key sent (TV volume would be about ${this.sim.volume}).`);
    if (key === 'MUTE') return sent(`mute toggled (${this.sim.muted ? 'muted' : 'unmuted'}).`);
    return sent(`${key} key sent.`);
  }

  async launchApp(appId: string): Promise<ActionResult> {
    await wait(500);
    const app = APPS.find((a) => a.id === appId);
    this.sim.app = appId;
    return sent(`asked the TV to open ${app ? app.name : appId}. A real TV only opens it if the app is installed.`);
  }

  async closeApp(_appId: string): Promise<ActionResult> {
    await wait(300);
    if (this.getCapabilities().close_app === 'unsupported') {
      return { outcome: 'unsupported', message: 'This TV type cannot close apps remotely.' };
    }
    this.sim.app = '';
    return sent('close request sent.');
  }

  async setVolume(level: number): Promise<ActionResult> {
    await wait(300);
    if (this.getCapabilities().volume_set === 'unsupported') {
      return { outcome: 'unsupported', message: 'This TV type cannot set an exact volume.' };
    }
    this.sim.volume = level;
    return ok(`volume set to ${level}.`);
  }

  async powerOff(): Promise<ActionResult> {
    await wait(600);
    return ok('TV went to standby.');
  }

  async powerOn(): Promise<ActionResult> {
    await wait(600);
    if (this.profile === 'webos') return ok('TV woke up.');
    return {
      outcome: 'unconfirmed',
      message: 'Simulated: wake signal sent, but this TV type cannot confirm it woke up. Many TVs ignore it in deep standby.',
    };
  }

  async listInputs(): Promise<InputOption[]> {
    await wait(300);
    return this.profile === 'webos' ? REPORTED_INPUTS : GUESS_INPUTS;
  }

  async switchInput(inputId: string): Promise<ActionResult> {
    await wait(400);
    this.sim.input = inputId;
    if (this.profile === 'webos') return ok(`switched to ${inputId}.`);
    return sent(`${inputId} request sent. This TV type cannot confirm the input changed.`);
  }
}
