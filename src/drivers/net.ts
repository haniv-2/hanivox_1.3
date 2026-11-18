import { tvNative } from '../../modules/hanivox-tv';
import { toBase64 } from './androidtv/bytes';

/** True when something accepts a TCP connection on host:port. Never throws. */
export async function probePort(host: string, port: number, timeoutMs = 1200): Promise<boolean> {
  try {
    return await tvNative().probePort(host, port, timeoutMs);
  } catch {
    return false;
  }
}

/** Sends a Wake-on-LAN packet to the local broadcast addresses on the usual ports. */
export async function sendMagic(host: string, packet: Uint8Array): Promise<void> {
  const data = toBase64(packet);
  const subnetBroadcast = host.replace(/\.\d+$/, '.255');
  for (const target of ['255.255.255.255', subnetBroadcast]) {
    for (const port of [9, 7]) {
      try {
        await tvNative().sendUdp(data, target, port);
      } catch {
        // keep trying the other targets
      }
    }
  }
}
