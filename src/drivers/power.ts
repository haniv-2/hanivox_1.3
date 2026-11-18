// Power helpers shared by every driver. They never claim success they have not seen:
// results come from actually probing the TV's network port.
import type { ActionResult } from './types.ts';

export type Probe = () => Promise<boolean>;
type Sleep = (ms: number) => Promise<void>;
const realSleep: Sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** "aa-bb-cc-dd-ee-ff", "AABBCCDDEEFF", ... -> "AA:BB:CC:DD:EE:FF", or null when invalid. */
export function normalizeMac(input: string): string | null {
  const t = input.trim();
  if (!/^([0-9a-f]{2}[:-]?){5}[0-9a-f]{2}$/i.test(t)) return null;
  const hex = t.replace(/[^0-9a-f]/gi, '').toUpperCase();
  return hex.match(/.{2}/g)!.join(':');
}

/** Wake-on-LAN magic packet: 6 x 0xFF followed by the MAC address 16 times. */
export function magicPacket(mac: string): Uint8Array {
  const normalized = normalizeMac(mac);
  if (!normalized) throw new Error('Invalid MAC address');
  const bytes = normalized.split(':').map((h) => parseInt(h, 16));
  const out = new Uint8Array(6 + 16 * 6);
  out.fill(0xff, 0, 6);
  for (let i = 0; i < 16; i++) out.set(bytes, 6 + i * 6);
  return out;
}

export async function pollPort(probe: Probe, wantOpen: boolean, timeoutMs: number, intervalMs = 1000, sleep: Sleep = realSleep): Promise<boolean> {
  const rounds = Math.max(1, Math.ceil(timeoutMs / intervalMs));
  for (let i = 0; i < rounds; i++) {
    if ((await probe()) === wantOpen) return true;
    await sleep(intervalMs);
  }
  return false;
}

export async function wakeViaLan(opts: {
  mac: string | undefined;
  probe: Probe;
  send: (packet: Uint8Array) => Promise<void>;
  timeoutMs?: number;
  intervalMs?: number;
  sleep?: Sleep;
}): Promise<ActionResult> {
  const sleep = opts.sleep ?? realSleep;
  if (await opts.probe()) return { outcome: 'confirmed', message: 'The TV is already on the network.' };
  const mac = opts.mac ? normalizeMac(opts.mac) : null;
  if (!mac) {
    return {
      outcome: 'failed',
      message: 'The TV is not reachable and no wake address is saved. Add its MAC address in My devices → Wake address (TV Settings → Network shows it).',
    };
  }
  const packet = magicPacket(mac);
  for (let i = 0; i < 3; i++) {
    await opts.send(packet);
    await sleep(300);
  }
  const up = await pollPort(opts.probe, true, opts.timeoutMs ?? 25000, opts.intervalMs ?? 1000, sleep);
  return up
    ? { outcome: 'confirmed', message: 'The TV answered on the network, so it is turning on.' }
    : {
        outcome: 'unconfirmed',
        message: 'The wake signal was sent but the TV did not answer within 25 seconds. Many TVs ignore it unless "Wake on LAN / Wi-Fi" is switched on in the TV network settings.',
      };
}

export async function confirmOff(opts: { probe: Probe; timeoutMs?: number; intervalMs?: number; sleep?: Sleep }): Promise<ActionResult> {
  const closed = await pollPort(opts.probe, false, opts.timeoutMs ?? 10000, opts.intervalMs ?? 1000, opts.sleep ?? realSleep);
  return closed
    ? { outcome: 'confirmed', message: 'The TV went offline.' }
    : {
        outcome: 'unconfirmed',
        message: 'The off command was sent, but the TV is still reachable on the network. It may be in standby. Check the screen.',
      };
}
