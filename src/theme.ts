import type { ConnectionState, Outcome } from './drivers/types';

export const colors = {
  bg: '#07070B',
  surface: '#12121A',
  surface2: '#1A1A25',
  border: '#272736',
  text: '#F4F4FA',
  dim: '#9A9AB2',
  purple: '#8B5CF6',
  blue: '#3B82F6',
  green: '#34D399',
  amber: '#FBBF24',
  red: '#F87171',
};

export const gradient = ['#8B5CF6', '#3B82F6'] as const;

export const connectionColor: Record<ConnectionState, string> = {
  disconnected: colors.dim,
  connecting: colors.amber,
  pairing: colors.amber,
  connected: colors.green,
  error: colors.red,
};

export const connectionLabel: Record<ConnectionState, string> = {
  disconnected: 'Not connected',
  connecting: 'Connecting…',
  pairing: 'Pairing',
  connected: 'Connected',
  error: 'Error',
};

export const outcomeColor: Record<Outcome, string> = {
  confirmed: colors.green,
  sent: colors.blue,
  unconfirmed: colors.amber,
  failed: colors.red,
  unsupported: colors.dim,
};

export const outcomeLabel: Record<Outcome, string> = {
  confirmed: 'Confirmed',
  sent: 'Sent, not verifiable',
  unconfirmed: 'Unconfirmed',
  failed: 'Failed',
  unsupported: 'Not supported',
};
