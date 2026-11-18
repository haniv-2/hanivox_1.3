import { AndroidTvDriver } from './androidtv/driver';
import { MockDriver } from './mock';
import { NotImplementedDriver } from './notImplemented';
import { realDeps } from './realDeps';
import { SamsungTizenDriver } from './tizen/driver';
import { LgWebOsDriver } from './webos/driver';
import type { DeviceDriver, DeviceInfo } from './types';

const cache = new Map<string, DeviceDriver>();

/** One driver instance per device, so connection state survives screen changes. */
export function getDriver(device: DeviceInfo): DeviceDriver {
  const existing = cache.get(device.id);
  if (existing) return existing;
  let driver: DeviceDriver;
  if (device.kind === 'mock') driver = new MockDriver(device);
  else if (device.kind === 'androidtv') driver = new AndroidTvDriver(device);
  else if (device.kind === 'webos') driver = new LgWebOsDriver(device, realDeps);
  else if (device.kind === 'tizen') driver = new SamsungTizenDriver(device, realDeps);
  else driver = new NotImplementedDriver(device);
  cache.set(device.id, driver);
  return driver;
}

export function dropDriver(deviceId: string): void {
  cache.delete(deviceId);
}
