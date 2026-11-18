// Minimal WebSocket server for tests (RFC 6455, small text frames only).
import { createHash } from 'node:crypto';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import type { Socket } from 'node:net';

export interface FakeConnection {
  path: string;
  send(text: string): void;
  close(): void;
}

export interface FakeWsServer {
  port: number;
  connections: FakeConnection[];
  close(): void;
}

function encode(text: string): Buffer {
  const payload = Buffer.from(text);
  if (payload.length < 126) return Buffer.concat([Buffer.from([0x81, payload.length]), payload]);
  const header = Buffer.alloc(4);
  header[0] = 0x81;
  header[1] = 126;
  header.writeUInt16BE(payload.length, 2);
  return Buffer.concat([header, payload]);
}

function decodeFrames(buf: Buffer): { texts: string[]; rest: Buffer; closed: boolean } {
  const texts: string[] = [];
  let pos = 0;
  let closed = false;
  while (buf.length - pos >= 2) {
    const opcode = buf[pos] & 0x0f;
    let len = buf[pos + 1] & 0x7f;
    let offset = pos + 2;
    if (len === 126) {
      if (buf.length < offset + 2) break;
      len = buf.readUInt16BE(offset);
      offset += 2;
    }
    const masked = (buf[pos + 1] & 0x80) !== 0;
    const maskLen = masked ? 4 : 0;
    if (buf.length < offset + maskLen + len) break;
    const mask = masked ? buf.subarray(offset, offset + 4) : null;
    const data = Buffer.from(buf.subarray(offset + maskLen, offset + maskLen + len));
    if (mask) for (let i = 0; i < data.length; i++) data[i] ^= mask[i % 4];
    if (opcode === 8) closed = true;
    else if (opcode === 1) texts.push(data.toString());
    pos = offset + maskLen + len;
  }
  return { texts, rest: buf.subarray(pos), closed };
}

/** onConnect gets each new connection; onMessage gets each text message from the client. */
export function startFakeWsServer(handlers: {
  onConnect?: (c: FakeConnection) => void;
  onMessage?: (c: FakeConnection, text: string) => void;
}): Promise<FakeWsServer> {
  const server = http.createServer((_req, res) => { res.statusCode = 404; res.end(); });
  const connections: FakeConnection[] = [];
  const sockets = new Set<Socket>();
  server.on('upgrade', (req, socket: Socket) => {
    sockets.add(socket);
    const key = String(req.headers['sec-websocket-key']);
    const accept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
    socket.write(`HTTP/1.1 101 Switching Protocols\r\nUpgrade: websocket\r\nConnection: Upgrade\r\nSec-WebSocket-Accept: ${accept}\r\n\r\n`);
    const conn: FakeConnection = {
      path: req.url || '/',
      send: (text) => { socket.write(encode(text)); },
      close: () => { socket.destroy(); },
    };
    connections.push(conn);
    socket.on('error', () => {});
    socket.on('close', () => sockets.delete(socket));
    let pending: Buffer = Buffer.alloc(0);
    socket.on('data', (d: Buffer) => {
      pending = Buffer.concat([pending, d]);
      const { texts, rest, closed } = decodeFrames(pending);
      pending = Buffer.from(rest);
      for (const t of texts) handlers.onMessage?.(conn, t);
      if (closed) socket.end();
    });
    handlers.onConnect?.(conn);
  });
  return new Promise((resolve) =>
    server.listen(0, '127.0.0.1', () =>
      resolve({
        port: (server.address() as AddressInfo).port,
        connections,
        close: () => { sockets.forEach((s) => s.destroy()); server.close(); },
      }),
    ),
  );
}
