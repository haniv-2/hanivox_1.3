// Connects the protocol sessions to the native TLS module (modules/hanivox-tv).
import { tvNative } from '../../../modules/hanivox-tv';
import { fromBase64, toBase64 } from './bytes';
import type { TlsConn, TlsTransport } from './transport';

class NativeConn implements TlsConn {
  id: number;
  serverModulusHex: string;
  serverExponentHex: string;
  private dataCb: (d: Uint8Array) => void = () => {};
  private closeCb: () => void = () => {};

  constructor(id: number, modulus: string, exponent: string) {
    this.id = id;
    this.serverModulusHex = modulus;
    this.serverExponentHex = exponent;
  }

  onData(cb: (d: Uint8Array) => void): void { this.dataCb = cb; }
  onClose(cb: () => void): void { this.closeCb = cb; }
  deliver(d: Uint8Array): void { this.dataCb(d); }
  closed(): void { this.closeCb(); }

  start(): void {
    tvNative().tlsListen(this.id).catch(() => this.closed());
  }

  write(data: Uint8Array): Promise<void> {
    return tvNative().tlsWrite(this.id, toBase64(data));
  }

  close(): void {
    tvNative().tlsClose(this.id).catch(() => {});
    conns.delete(this.id);
  }
}

const conns = new Map<number, NativeConn>();
let hooked = false;

function hook(): void {
  if (hooked) return;
  hooked = true;
  const n = tvNative();
  n.addListener('onTlsData', (e) => conns.get(e.id)?.deliver(fromBase64(e.data)));
  n.addListener('onTlsClosed', (e) => {
    const c = conns.get(e.id);
    conns.delete(e.id);
    c?.closed();
  });
}

export const nativeTransport: TlsTransport = {
  clientCert: () => tvNative().getCertInfo(),
  async open(host: string, port: number): Promise<TlsConn> {
    hook();
    const info = await tvNative().tlsOpen(host, port);
    const conn = new NativeConn(info.id, info.serverModulusHex, info.serverExponentHex);
    conns.set(info.id, conn);
    return conn;
  },
};
