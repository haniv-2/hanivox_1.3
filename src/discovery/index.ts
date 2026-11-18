// Real discovery on the local Wi-Fi network:
//  - Google TV / Android TV: mDNS (_androidtvremote2._tcp) plus a scan for the remote port
//  - LG webOS: scan for port 3000, then confirm the webOS protocol answers
//  - Samsung Tizen: scan for port 8001, then confirm the Samsung API answers
// Simulated devices are opt-in.
import { tvNative } from '../../modules/hanivox-tv';
import { realDeps } from '../drivers/realDeps';
import type { DeviceInfo, DeviceKind } from '../drivers/types';
import { identifyLg, identifySamsung } from './identify';

export { detectAt } from './identify';

export const DEMO_DEVICES: DeviceInfo[] = [
  { id: 'demo-googletv', name: 'Demo Google TV', kind: 'mock', host: '192.168.1.21', manufacturer: 'Simulated', model: 'Google TV profile', profile: 'googletv' },
  { id: 'demo-tizen', name: 'Demo Samsung TV', kind: 'mock', host: '192.168.1.22', manufacturer: 'Simulated', model: 'Tizen profile', profile: 'tizen' },
  { id: 'demo-webos', name: 'Demo LG TV', kind: 'mock', host: '192.168.1.23', manufacturer: 'Simulated', model: 'webOS profile', profile: 'webos' },
];

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export const isValidIPv4 = (s: string) =>
  /^(25[0-5]|2[0-4]\d|1?\d?\d)(\.(25[0-5]|2[0-4]\d|1?\d?\d)){3}$/.test(s.trim());

export function deviceFromHost(host: string, name?: string, kind: DeviceKind = 'androidtv', extra: Partial<DeviceInfo> = {}): DeviceInfo {
  const prefix = kind === 'webos' ? 'lg' : kind === 'tizen' ? 'sam' : 'atv';
  const fallback = kind === 'webos' ? `LG TV (${host})` : kind === 'tizen' ? `Samsung TV (${host})` : `Android TV (${host})`;
  return { id: `${prefix}-${host}`, name: name || fallback, kind, host, ...extra };
}

export async function discoverDevices(onFound: (d: DeviceInfo) => void): Promise<void> {
  const native = tvNative();
  const seen = new Set<string>();
  const emit = (d: DeviceInfo) => {
    if (!d.host || seen.has(d.host)) return;
    seen.add(d.host);
    onFound(d);
  };

  const sub = native.addListener('onDeviceFound', (e) => emit(deviceFromHost(e.host, e.name)));
  try {
    await native.startDiscovery().catch(() => {});
    const scan = (port: number) => native.scanSubnet(port).catch(() => [] as string[]);
    const [androidTvs, lgs, samsungs] = await Promise.all([scan(6466), scan(3000), scan(8001)]);
    // Give mDNS a moment to deliver friendly names before falling back to bare addresses.
    await wait(2000);
    androidTvs.forEach((h) => emit(deviceFromHost(h)));
    await Promise.all([
      ...samsungs.map(async (h) => {
        if (seen.has(h)) return;
        const found = await identifySamsung(realDeps, h);
        if (found) emit(deviceFromHost(h, found.name, 'tizen', { manufacturer: 'Samsung', model: found.model, mac: found.mac }));
      }),
      ...lgs.map(async (h) => {
        if (seen.has(h)) return;
        const found = await identifyLg(realDeps, h);
        if (found) emit(deviceFromHost(h, undefined, 'webos', { manufacturer: 'LG' }));
      }),
    ]);
  } finally {
    sub.remove();
    native.stopDiscovery().catch(() => {});
  }
}
