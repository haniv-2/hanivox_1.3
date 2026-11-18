// Works out what kind of TV answers at an address. Pure logic with injected network access,
// so it can be tested without a TV.
import type { Deps } from '../drivers/deps.ts';
import { normalizeMac } from '../drivers/power.ts';
import { openSocket } from '../drivers/ws.ts';

export interface Identified {
  kind: 'tizen' | 'webos' | 'androidtv';
  name?: string;
  model?: string;
  mac?: string;
}

export async function identifySamsung(deps: Deps, host: string): Promise<Identified | null> {
  try {
    const res = await deps.http(`http://${host}:8001/api/v2/`);
    if (!res.ok) return null;
    const body = (await res.json()) as { device?: { name?: string; modelName?: string; wifiMac?: string; type?: string } };
    const d = body.device;
    if (!d || !/samsung/i.test(String(d.type || d.name || ''))) return null;
    return { kind: 'tizen', name: d.name, model: d.modelName, mac: d.wifiMac ? (normalizeMac(d.wifiMac) ?? undefined) : undefined };
  } catch {
    return null;
  }
}

/** LG TVs answer on port 3000 with the webOS protocol. Any JSON reply with a "type" proves it. */
export async function identifyLg(deps: Deps, host: string): Promise<Identified | null> {
  let ws: WebSocket | null = null;
  try {
    ws = await openSocket(deps.ws, `ws://${host}:3000`, 2500);
    const socket = ws;
    const answered = await new Promise<boolean>((resolve) => {
      const timer = setTimeout(() => resolve(false), 2500);
      socket.onmessage = (ev: { data: unknown }) => {
        clearTimeout(timer);
        try {
          const msg = JSON.parse(String(ev.data));
          resolve(typeof msg === 'object' && msg !== null && typeof msg.type === 'string');
        } catch {
          resolve(false);
        }
      };
      socket.onclose = () => {
        clearTimeout(timer);
        resolve(false);
      };
      socket.send(JSON.stringify({ type: 'request', id: 'probe_1', uri: 'ssap://com.webos.service.update/getCurrentSWInformation' }));
    });
    return answered ? { kind: 'webos' } : null;
  } catch {
    return null;
  } finally {
    try { ws?.close(); } catch { /* ignore */ }
  }
}

/** Tries every supported family at one address. */
export async function detectAt(deps: Deps, host: string): Promise<Identified | null> {
  const samsung = await identifySamsung(deps, host);
  if (samsung) return samsung;
  const lg = await identifyLg(deps, host);
  if (lg) return lg;
  if (await deps.probe(host, 6466)) return { kind: 'androidtv' };
  return null;
}
