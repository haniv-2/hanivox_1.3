import { FrameReader, decode, firstBytes, firstNumber, frame } from './pb.ts';
import type { PbFields } from './pb.ts';
import * as P from './protocol.ts';
import type { TlsConn, TlsTransport } from './transport.ts';

type Timer = ReturnType<typeof setTimeout>;

class Inbox {
  private queue: Uint8Array[] = [];
  private waiter: { resolve: (m: Uint8Array) => void; reject: (e: Error) => void; timer: Timer } | null = null;
  private closed = false;

  push(message: Uint8Array): void {
    const w = this.waiter;
    if (w) {
      this.waiter = null;
      clearTimeout(w.timer);
      w.resolve(message);
    } else this.queue.push(message);
  }

  close(): void {
    this.closed = true;
    const w = this.waiter;
    if (w) {
      this.waiter = null;
      clearTimeout(w.timer);
      w.reject(new Error('The TV closed the connection.'));
    }
  }

  next(timeoutMs: number): Promise<Uint8Array> {
    const queued = this.queue.shift();
    if (queued) return Promise.resolve(queued);
    if (this.closed) return Promise.reject(new Error('The TV closed the connection.'));
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        reject(new Error('The TV did not answer in time.'));
      }, timeoutMs);
      this.waiter = { resolve, reject, timer };
    });
  }
}

export class PairingRefused extends Error {
  status: number | undefined;
  constructor(message: string, status: number | undefined) {
    super(message);
    this.status = status;
  }
}

export class PairingSession {
  private transport: TlsTransport;
  private conn: TlsConn | null = null;
  private inbox = new Inbox();

  constructor(transport: TlsTransport) {
    this.transport = transport;
  }

  private async send(message: Uint8Array): Promise<void> {
    if (!this.conn) throw new Error('Not connected.');
    await this.conn.write(frame(message));
  }

  private async expect(field: number, what: string): Promise<PbFields> {
    const fields = decode(await this.inbox.next(8000));
    const status = firstNumber(fields, 2);
    if (status !== P.STATUS_OK || !fields.has(field)) {
      throw new PairingRefused(`The TV refused ${what} (status ${status ?? 'none'}).`, status);
    }
    return fields;
  }

  /** Opens the pairing channel. When this resolves, the TV is showing its 6-character code. */
  async begin(host: string, port: number = P.PAIRING_PORT): Promise<void> {
    this.close();
    this.inbox = new Inbox();
    const inbox = this.inbox;
    const conn = await this.transport.open(host, port);
    this.conn = conn;
    const reader = new FrameReader();
    conn.onData((d) => {
      for (const m of reader.push(d)) inbox.push(m);
    });
    conn.onClose(() => inbox.close());
    conn.start();

    await this.send(P.pairingRequest());
    await this.expect(11, 'the pairing request');
    await this.send(P.pairingOption());
    await this.expect(20, 'the pairing options');
    await this.send(P.pairingConfiguration());
    await this.expect(31, 'the pairing configuration');
  }

  async finish(code: string): Promise<void> {
    const conn = this.conn;
    if (!conn) throw new Error('Start pairing first.');
    const cleaned = code.trim().replace(/\s+/g, '').toUpperCase();
    if (!/^[0-9A-F]{6}$/.test(cleaned)) {
      throw new Error('The code has 6 characters, using only 0-9 and A-F.');
    }
    const client = await this.transport.clientCert();
    const secret = P.computeSecret(
      client.modulusHex, client.exponentHex, conn.serverModulusHex, conn.serverExponentHex, cleaned,
    );
    await this.send(P.pairingSecret(secret));
    try {
      await this.expect(41, 'the code');
    } catch (e) {
      if (e instanceof PairingRefused) throw new Error('The TV did not accept that code. Check it and try again.');
      throw e;
    }
    this.close();
  }

  close(): void {
    const c = this.conn;
    this.conn = null;
    if (c) c.close();
  }
}

export class RemoteSession {
  private transport: TlsTransport;
  private conn: TlsConn | null = null;
  private ready = false;
  private closedCallbacks: Array<() => void> = [];

  constructor(transport: TlsTransport) {
    this.transport = transport;
  }

  onClosed(cb: () => void): void {
    this.closedCallbacks.push(cb);
  }

  get isReady(): boolean {
    return this.ready;
  }

  private write(message: Uint8Array): void {
    const c = this.conn;
    if (!c) return;
    c.write(frame(message)).catch(() => {});
  }

  private handle(message: Uint8Array, markReady: () => void): void {
    let fields: PbFields;
    try {
      fields = decode(message);
    } catch {
      return;
    }
    if (fields.has(1)) this.write(P.remoteConfigure());
    if (fields.has(2)) this.write(P.remoteSetActive());
    const ping = firstBytes(fields, 8);
    if (ping) this.write(P.remotePingResponse(firstNumber(decode(ping), 1) ?? 0));
    if (fields.has(40)) {
      this.ready = true;
      markReady();
    }
  }

  async connect(host: string, port: number = P.REMOTE_PORT, timeoutMs = 8000): Promise<void> {
    this.close();
    const conn = await this.transport.open(host, port);
    this.conn = conn;
    const reader = new FrameReader();
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        this.close();
        reject(new Error('The TV did not finish connecting. It may need to be paired again.'));
      }, timeoutMs);
      conn.onData((d) => {
        for (const m of reader.push(d)) {
          this.handle(m, () => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            resolve();
          });
        }
      });
      conn.onClose(() => {
        clearTimeout(timer);
        const wasReady = this.ready;
        this.ready = false;
        this.conn = null;
        if (!settled) {
          settled = true;
          reject(new Error('The TV closed the connection. It probably needs to be paired again.'));
        } else if (wasReady) {
          for (const cb of this.closedCallbacks) cb();
        }
      });
      conn.start();
    });
  }

  private async sendReady(message: Uint8Array): Promise<void> {
    if (!this.conn || !this.ready) throw new Error('Not connected to the TV.');
    await this.conn.write(frame(message));
  }

  sendKey(keyCode: number): Promise<void> {
    return this.sendReady(P.remoteKey(keyCode));
  }

  launchLink(url: string): Promise<void> {
    return this.sendReady(P.remoteLaunchLink(url));
  }

  close(): void {
    const c = this.conn;
    this.conn = null;
    this.ready = false;
    if (c) c.close();
  }
}
