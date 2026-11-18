// Core types shared by the UI, the voice pipeline and every device driver.

export type DeviceKind = 'androidtv' | 'tizen' | 'webos' | 'mock';

/**
 * supported   = the protocol provides this reliably.
 * unverified  = the protocol can attempt it, but the TV may ignore it. Must be tested on the real TV.
 * unsupported = not possible with this protocol. The UI must not offer it as working.
 */
export type Support = 'supported' | 'unverified' | 'unsupported';

export type CapabilityKey =
  | 'navigation'
  | 'volume_step'
  | 'volume_set'
  | 'mute'
  | 'playback'
  | 'launch_app'
  | 'close_app'
  | 'power_off'
  | 'power_on'
  | 'list_inputs'
  | 'switch_input';

export type Capabilities = Record<CapabilityKey, Support>;

export type ConnectionState = 'disconnected' | 'connecting' | 'pairing' | 'connected' | 'error';

export type RemoteKey =
  | 'UP'
  | 'DOWN'
  | 'LEFT'
  | 'RIGHT'
  | 'OK'
  | 'BACK'
  | 'HOME'
  | 'MENU'
  | 'VOL_UP'
  | 'VOL_DOWN'
  | 'MUTE'
  | 'PLAY'
  | 'PAUSE'
  | 'STOP'
  | 'NEXT'
  | 'PREVIOUS'
  | 'CH_UP'
  | 'CH_DOWN';

export type SimProfile = 'googletv' | 'tizen' | 'webos';

export interface DeviceInfo {
  id: string;
  name: string;
  kind: DeviceKind;
  host: string;
  manufacturer?: string;
  model?: string;
  /** Only used by the Stage 1 simulator to mimic a real brand's limits. */
  profile?: SimProfile;
  /** Wi-Fi MAC address, used to turn the TV on with Wake-on-LAN. */
  mac?: string;
  /** Pairing key issued by the TV (LG client-key, Samsung token). Stored on the phone only. */
  credential?: string;
}

export interface SavedDevice extends DeviceInfo {
  customName?: string;
  paired: boolean;
  lastConnectedAt?: number;
}

/**
 * confirmed   = we verified the effect (e.g. TV answered, port went down).
 * sent        = command delivered, but the TV gives no way to verify the effect.
 * unconfirmed = we tried, and cannot tell whether it worked.
 * failed      = it did not work.
 * unsupported = this device cannot do it.
 */
export type Outcome = 'confirmed' | 'sent' | 'unconfirmed' | 'failed' | 'unsupported';

export interface ActionResult {
  outcome: Outcome;
  message: string;
}

export interface InputOption {
  id: string;
  label: string;
  support: Support;
  /** reported = the TV told us it exists. guess = a standard key we will try. */
  source: 'reported' | 'guess';
}

export interface DeviceDriver {
  readonly kind: DeviceKind;
  readonly requiresPairing: boolean;
  getCapabilities(): Capabilities;
  /** Starts pairing. For real TVs this makes the TV show a code. */
  beginPairing(): Promise<ActionResult>;
  pair(code: string): Promise<ActionResult>;
  connect(): Promise<ActionResult>;
  disconnect(): Promise<void>;
  sendKey(key: RemoteKey): Promise<ActionResult>;
  launchApp(appId: string): Promise<ActionResult>;
  closeApp(appId: string): Promise<ActionResult>;
  setVolume(level: number): Promise<ActionResult>;
  powerOff(): Promise<ActionResult>;
  powerOn(): Promise<ActionResult>;
  listInputs(): Promise<InputOption[]>;
  switchInput(inputId: string): Promise<ActionResult>;
}

export const KIND_LABEL: Record<DeviceKind, string> = {
  androidtv: 'Google TV / Android TV',
  tizen: 'Samsung (Tizen)',
  webos: 'LG (webOS)',
  mock: 'Simulator',
};
