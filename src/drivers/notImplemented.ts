// Placeholder for real integrations that arrive in later stages.
// It never pretends to work: every action returns "unsupported" with a clear reason.
import type {
  ActionResult, Capabilities, DeviceDriver, DeviceInfo, InputOption, RemoteKey,
} from './types';

const none: Capabilities = {
  navigation: 'unsupported', volume_step: 'unsupported', volume_set: 'unsupported', mute: 'unsupported',
  playback: 'unsupported', launch_app: 'unsupported', close_app: 'unsupported', power_off: 'unsupported',
  power_on: 'unsupported', list_inputs: 'unsupported', switch_input: 'unsupported',
};

export class NotImplementedDriver implements DeviceDriver {
  readonly kind: DeviceInfo['kind'];
  readonly requiresPairing = false;
  private reason: ActionResult;

  constructor(device: DeviceInfo) {
    this.kind = device.kind;
    this.reason = {
      outcome: 'unsupported',
      message: 'Real control of this device type is not built yet.',
    };
  }

  getCapabilities(): Capabilities { return none; }
  async beginPairing(): Promise<ActionResult> { return this.reason; }
  async pair(_code: string): Promise<ActionResult> { return this.reason; }
  async connect(): Promise<ActionResult> { return this.reason; }
  async disconnect(): Promise<void> {}
  async sendKey(_key: RemoteKey): Promise<ActionResult> { return this.reason; }
  async launchApp(_appId: string): Promise<ActionResult> { return this.reason; }
  async closeApp(_appId: string): Promise<ActionResult> { return this.reason; }
  async setVolume(_level: number): Promise<ActionResult> { return this.reason; }
  async powerOff(): Promise<ActionResult> { return this.reason; }
  async powerOn(): Promise<ActionResult> { return this.reason; }
  async listInputs(): Promise<InputOption[]> { return []; }
  async switchInput(_inputId: string): Promise<ActionResult> { return this.reason; }
}
