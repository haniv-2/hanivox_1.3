import { requireNativeModule } from 'expo';

export interface Subscription {
  remove(): void;
}

export interface HanivoxTvNative {
  getCertInfo(): Promise<{ modulusHex: string; exponentHex: string }>;
  tlsOpen(host: string, port: number): Promise<{ id: number; serverModulusHex: string; serverExponentHex: string }>;
  tlsListen(id: number): Promise<void>;
  tlsWrite(id: number, dataBase64: string): Promise<void>;
  tlsClose(id: number): Promise<void>;
  startDiscovery(): Promise<void>;
  stopDiscovery(): Promise<void>;
  scanSubnet(port: number): Promise<string[]>;
  probePort(host: string, port: number, timeoutMs: number): Promise<boolean>;
  sendUdp(dataBase64: string, host: string, port: number): Promise<void>;
  wakeModelInstalled(): Promise<boolean>;
  wakeDownloadModel(): Promise<void>;
  wakeStart(): Promise<void>;
  wakeStop(): Promise<void>;
  speechCapabilities(): Promise<{ onDevice: boolean; system: boolean }>;
  startListening(lang: string, allowOnline: boolean): Promise<void>;
  stopListening(): Promise<void>;
  cancelListening(): Promise<void>;
  addListener(event: 'onDeviceFound', cb: (e: { name: string; host: string; port: number }) => void): Subscription;
  addListener(event: 'onTlsData', cb: (e: { id: number; data: string }) => void): Subscription;
  addListener(event: 'onTlsClosed', cb: (e: { id: number }) => void): Subscription;
  addListener(event: 'onSpeechState', cb: (e: { state: 'listening' | 'processing' }) => void): Subscription;
  addListener(event: 'onSpeechPartial', cb: (e: { text: string }) => void): Subscription;
  addListener(event: 'onSpeechResult', cb: (e: { alternatives: string[] }) => void): Subscription;
  addListener(event: 'onSpeechError', cb: (e: { code: number }) => void): Subscription;
  addListener(event: 'onWakeDetected', cb: (e: { text: string }) => void): Subscription;
  addListener(event: 'onWakeDownload', cb: (e: { percent: number }) => void): Subscription;
  addListener(event: 'onWakeError', cb: (e: { message: string }) => void): Subscription;
}

let cached: HanivoxTvNative | null = null;

/** Loaded lazily, so a missing native module shows a clear message instead of crashing at startup. */
export function tvNative(): HanivoxTvNative {
  if (cached === null) cached = requireNativeModule<HanivoxTvNative>('HanivoxTv');
  return cached as HanivoxTvNative;
}
