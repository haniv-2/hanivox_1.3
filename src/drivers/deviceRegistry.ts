// Drivers are created once per TV, but the person can edit a TV later (for example add its
// wake address). The store keeps this registry up to date so drivers always see the latest.
import type { DeviceInfo } from './types.ts';

const devices = new Map<string, DeviceInfo>();

export function syncDevices(list: DeviceInfo[]): void {
  devices.clear();
  for (const d of list) devices.set(d.id, d);
}

export function currentDevice(id: string): DeviceInfo | undefined {
  return devices.get(id);
}
