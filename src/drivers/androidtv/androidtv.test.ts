import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createHash, X509Certificate } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import tls from 'node:tls';
import type { AddressInfo } from 'node:net';
import { concat, fromBase64, toBase64 } from './bytes.ts';
import { sha256 } from './sha256.ts';
import { FrameReader, decode, fieldBytes, fieldVarint, firstNumber, frame } from './pb.ts';
import { PairingSession, RemoteSession } from './session.ts';
import type { TlsConn, TlsTransport } from './transport.ts';

// ---------- certificates for the fake TV and for the "phone" ----------
const dir = mkdtempSync(join(tmpdir(), 'hanivox-'));
function makeCert(name: string) {
  const key = join(dir, `${name}.key`);
  const crt = join(dir, `${name}.crt`);
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-subj', `/CN=${name}`, '-keyout', key, '-out', crt, '-days', '2'], { stdio: 'ignore' });
  return { key: readFileSync(key), cert: readFileSync(crt) };
}
const tvCert = makeCert('fake-tv');
const phoneCert = makeCert('phone');

function jwkOf(cert: X509Certificate) {
  const jwk = cert.publicKey.export({ format: 'jwk' }) as { n: string; e: string };
  return { n: Buffer.from(jwk.n, 'base64url'), e: Buffer.from(jwk.e, 'base64url') };
}

// ---------- Node implementation of the transport ----------
const phoneKeys = jwkOf(new X509Certificate(phoneCert.cert));
const nodeTransport: TlsTransport = {
  async clientCert() {
    return { modulusHex: phoneKeys.n.toString('hex'), exponentHex: phoneKeys.e.toString('hex') };
  },
  open(host, port) {
    return new Promise<TlsConn>((resolve, reject) => {
      const socket = tls.connect({ host, port, key: phoneCert.key, cert: phoneCert.cert, rejectUnauthorized: false }, () => {
        socket.pause();
        const peer = socket.getPeerX509Certificate();
        if (!peer) return reject(new Error('no server cert'));
        const server = jwkOf(peer);
        let dataCb: (d: Uint8Array) => void = () => {};
        let closeCb: () => void = () => {};
        socket.on('close', () => closeCb());
        socket.on('error', () => {});
        resolve({
          serverModulusHex: server.n.toString('hex'),
          serverExponentHex: server.e.toString('hex'),
          onData: (cb) => { dataCb = cb; },
          onClose: (cb) => { closeCb = cb; },
          start: () => { socket.on('data', (d: Buffer) => dataCb(new Uint8Array(d))); socket.resume(); },
          write: (data) => new Promise<void>((res, rej) => socket.write(data, (e) => (e ? rej(e) : res()))),
          close: () => socket.destroy(),
        });
      });
      socket.once('error', reject);
    });
  },
};

// ---------- fake Android TV ----------
const envelope = (payload: Uint8Array, status = 200) => concat(fieldVarint(1, 2), fieldVarint(2, status), payload);

function startFakePairingTv(code: string) {
  const server = tls.createServer({ key: tvCert.key, cert: tvCert.cert, requestCert: true, rejectUnauthorized: false }, (socket) => {
    const reader = new FrameReader();
    socket.on('error', () => {});
    socket.on('data', (d: Buffer) => {
      for (const m of reader.push(new Uint8Array(d))) {
        const f = decode(m);
        if (f.has(10)) socket.write(frame(envelope(fieldBytes(11, new Uint8Array(0)))));
        else if (f.has(20)) socket.write(frame(envelope(fieldBytes(20, new Uint8Array(0)))));
        else if (f.has(30)) socket.write(frame(envelope(fieldBytes(31, new Uint8Array(0)))));
        else if (f.has(40)) {
          const secret = decode(f.get(40)![0] as Uint8Array).get(1)![0] as Uint8Array;
          const client = jwkOf(socket.getPeerX509Certificate() as X509Certificate);
          const server = jwkOf(new X509Certificate(tvCert.cert));
          const expected = createHash('sha256')
            .update(client.n).update(client.e).update(server.n).update(server.e)
            .update(Buffer.from(code.slice(2), 'hex'))
            .digest();
          if (Buffer.compare(expected, Buffer.from(secret)) === 0) {
            socket.write(frame(envelope(fieldBytes(41, new Uint8Array(0)))));
          } else {
            socket.write(frame(envelope(new Uint8Array(0), 400)));
          }
        }
      }
    });
  });
  return new Promise<{ port: number; close: () => void }>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve({ port: (server.address() as AddressInfo).port, close: () => server.close() })),
  );
}

interface TvLog { keys: number[]; links: Uint8Array[]; pings: number[]; kick: () => void }

function startFakeRemoteTv(opts: { refuse?: boolean } = {}) {
  const log: TvLog = { keys: [], links: [], pings: [], kick: () => {} };
  let current: tls.TLSSocket | null = null;
  const server = tls.createServer({ key: tvCert.key, cert: tvCert.cert, requestCert: true, rejectUnauthorized: false }, (socket) => {
    current = socket;
    socket.on('error', () => {});
    if (opts.refuse) { socket.destroy(); return; }
    const reader = new FrameReader();
    socket.write(frame(fieldBytes(1, fieldVarint(1, 100))));
    socket.on('data', (d: Buffer) => {
      for (const m of reader.push(new Uint8Array(d))) {
        const f = decode(m);
        if (f.has(1)) socket.write(frame(fieldBytes(2, fieldVarint(1, 100))));
        else if (f.has(2)) {
          socket.write(frame(fieldBytes(40, fieldVarint(1, 1))));
          socket.write(frame(fieldBytes(8, fieldVarint(1, 7))));
        } else if (f.has(9)) log.pings.push(firstNumber(decode(f.get(9)![0] as Uint8Array), 1)!);
        else if (f.has(10)) log.keys.push(firstNumber(decode(f.get(10)![0] as Uint8Array), 1)!);
        else if (f.has(90)) log.links.push(decode(f.get(90)![0] as Uint8Array).get(1)![0] as Uint8Array);
      }
    });
  });
  log.kick = () => current?.destroy();
  return new Promise<{ port: number; log: TvLog; close: () => void }>((resolve) =>
    server.listen(0, '127.0.0.1', () => resolve({ port: (server.address() as AddressInfo).port, log, close: () => server.close() })),
  );
}

const wait = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ---------- tests ----------
test('sha256 matches Node crypto for many lengths', () => {
  for (const len of [0, 1, 3, 55, 56, 57, 63, 64, 65, 119, 120, 128, 1000]) {
    const data = new Uint8Array(len).map((_, i) => (i * 31 + len) & 0xff);
    assert.equal(Buffer.from(sha256(data)).toString('hex'), createHash('sha256').update(data).digest('hex'), `length ${len}`);
  }
});

test('base64 round trip', () => {
  for (const len of [0, 1, 2, 3, 4, 5, 100]) {
    const data = new Uint8Array(len).map((_, i) => (i * 7) & 0xff);
    assert.equal(toBase64(data), Buffer.from(data).toString('base64'));
    assert.deepEqual(Array.from(fromBase64(toBase64(data))), Array.from(data));
  }
});

test('protobuf frames split and join correctly', () => {
  const msg = concat(fieldVarint(1, 300), fieldBytes(2, new Uint8Array(200).fill(7)));
  const wire = concat(frame(msg), frame(msg));
  const reader = new FrameReader();
  const got = [...reader.push(wire.slice(0, 5)), ...reader.push(wire.slice(5, 150)), ...reader.push(wire.slice(150))];
  assert.equal(got.length, 2);
  assert.equal(firstNumber(decode(got[0]), 1), 300);
  assert.equal((decode(got[1]).get(2)![0] as Uint8Array).length, 200);
});

test('pairing succeeds with the right code', async () => {
  const tv = await startFakePairingTv('A1B2C3');
  const session = new PairingSession(nodeTransport);
  await session.begin('127.0.0.1', tv.port);
  await session.finish('a1b2c3');
  tv.close();
});

test('pairing rejects a wrong code with a clear message', async () => {
  const tv = await startFakePairingTv('A1B2C3');
  const session = new PairingSession(nodeTransport);
  await session.begin('127.0.0.1', tv.port);
  await assert.rejects(() => session.finish('FFFFFF'), /did not accept that code/);
  session.close();
  tv.close();
});

test('pairing rejects malformed codes before contacting the TV', async () => {
  const tv = await startFakePairingTv('A1B2C3');
  const session = new PairingSession(nodeTransport);
  await session.begin('127.0.0.1', tv.port);
  await assert.rejects(() => session.finish('XYZ'), /6 characters/);
  session.close();
  tv.close();
});

test('remote: handshake, ping, keys, app link, and close notification', async () => {
  const tv = await startFakeRemoteTv();
  const session = new RemoteSession(nodeTransport);
  let closed = 0;
  session.onClosed(() => { closed++; });
  await session.connect('127.0.0.1', tv.port, 3000);
  assert.equal(session.isReady, true);
  await session.sendKey(24);
  await session.launchLink('https://www.youtube.com');
  await wait(150);
  assert.deepEqual(tv.log.pings, [7]);
  assert.deepEqual(tv.log.keys, [24]);
  assert.equal(Buffer.from(tv.log.links[0]).toString(), 'https://www.youtube.com');
  tv.log.kick();
  await wait(200);
  assert.equal(closed, 1);
  await assert.rejects(() => session.sendKey(24), /Not connected/);
  tv.close();
});

test('remote: a TV that drops the connection (not paired) gives a pairing hint', async () => {
  const tv = await startFakeRemoteTv({ refuse: true });
  const session = new RemoteSession(nodeTransport);
  await assert.rejects(() => session.connect('127.0.0.1', tv.port, 3000), /paired again/);
  tv.close();
});
