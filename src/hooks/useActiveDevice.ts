import { useMemo } from 'react';
import { getDriver } from '../drivers';
import type { ConnectionState, DeviceDriver, SavedDevice } from '../drivers/types';
import { useHanivox } from '../store/useHanivox';

export function useActiveDevice(): {
  device: SavedDevice | null;
  driver: DeviceDriver | null;
  state: ConnectionState;
  connected: boolean;
} {
  const saved = useHanivox((s) => s.saved);
  const activeId = useHanivox((s) => s.activeId);
  const connection = useHanivox((s) => s.connection);
  const device = useMemo(() => saved.find((d) => d.id === activeId) ?? null, [saved, activeId]);
  const driver = useMemo(() => (device ? getDriver(device) : null), [device]);
  const state: ConnectionState = device ? (connection[device.id] ?? 'disconnected') : 'disconnected';
  return { device, driver, state, connected: state === 'connected' };
}
