import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startFakeWsServer } from '../../test-utils/fakeWsServer.ts';
import type { FakeConnection } from '../../test-utils/fakeWsServer.ts';
import { identifyLg, identifySamsung, detectAt } from '../../discovery/identify.ts';
import type { Deps, HttpResponse } from '../deps.ts';
import { onCredential } from '../events.ts';
import type { DeviceInfo } from '../types.ts';
import { SamsungTizenDriver } from './driver.ts';

const device: DeviceInfo = { id: 'sam-127.0.0.1', name: 'Samsung TV', kind: 'tizen', host: '127.0.0.1' };

function depsFor(port: number, http?: Deps['http']): Deps {
  return {
    ws: (url) => new WebSocket(url.replace(':8001', `:${port}`).replace(':3000', `:${port}`)),
    http: http ?? (async () => { throw new Error('no http'); }),
    probe: async () => false,
    sendMagic: async () => {},
  };
}

test('Samsung: connect announces itself, gets a token, sends keys', async () => {
  const keys: any[] = [];
  const server = await startFakeWsServer({
    onConnect: (c: FakeConnection) => c.send(JSON.stringify({ event: 'ms.channel.connect', data: { token: 'TOK1' } })),
    onMessage: (_c, text) => keys.push(JSON.parse(text)),
  });
  const driver = new SamsungTizenDriver(device, depsFor(server.port));
  const tokens: string[] = [];
  const off = onCredential((_id, t) => tokens.push(t));
  const r = await driver.connect();
  assert.equal(r.outcome, 'confirmed');
  assert.deepEqual(tokens, ['TOK1']);
  assert.ok(server.connections[0].path.includes(`name=${encodeURIComponent(Buffer.from('Hanivox').toString('base64'))}`));
  assert.equal((await driver.sendKey('VOL_UP')).outcome, 'sent');
  assert.equal((await driver.switchInput('AV')).outcome, 'sent');
  await new Promise((r2) => setTimeout(r2, 100));
  assert.equal(keys[0].method, 'ms.remote.control');
  assert.equal(keys[0].params.DataOfCmd, 'KEY_VOLUP');
  assert.equal(keys[0].params.TypeOfRemote, 'SendRemoteKey');
  assert.equal(keys[1].params.DataOfCmd, 'KEY_AV1');
  off();
  await driver.disconnect();
  server.close();
});

test('Samsung: a refusal on the TV is explained', async () => {
  const server = await startFakeWsServer({
    onConnect: (c) => c.send(JSON.stringify({ event: 'ms.channel.unauthorized' })),
  });
  const driver = new SamsungTizenDriver(device, depsFor(server.port));
  const r = await driver.connect();
  assert.equal(r.outcome, 'failed');
  assert.match(r.message, /refused/);
  server.close();
});

test('Samsung: HDMI requests are honest that only the next input is selected', async () => {
  const server = await startFakeWsServer({ onConnect: (c) => c.send(JSON.stringify({ event: 'ms.channel.connect', data: {} })) });
  const driver = new SamsungTizenDriver(device, depsFor(server.port));
  await driver.connect();
  const r = await driver.switchInput('HDMI3');
  assert.equal(r.outcome, 'sent');
  assert.match(r.message, /next HDMI input/);
  await driver.disconnect();
  server.close();
});

test('Samsung: apps open and close over HTTP; HTTP errors are failures', async () => {
  const calls: string[] = [];
  let ok = true;
  const http = async (url: string, init?: { method?: string }): Promise<HttpResponse> => {
    calls.push(`${init?.method ?? 'GET'} ${url}`);
    return { ok, status: ok ? 200 : 404, json: async () => ({}) };
  };
  const driver = new SamsungTizenDriver(device, depsFor(1, http));
  assert.equal((await driver.launchApp('youtube')).outcome, 'sent');
  assert.equal((await driver.closeApp('youtube')).outcome, 'sent');
  assert.deepEqual(calls, ['POST http://127.0.0.1:8001/api/v2/applications/111299001912', 'DELETE http://127.0.0.1:8001/api/v2/applications/111299001912']);
  ok = false;
  assert.equal((await driver.launchApp('netflix')).outcome, 'failed');
});

test('Samsung: exact volume is refused', async () => {
  const driver = new SamsungTizenDriver(device, depsFor(1));
  assert.equal((await driver.setVolume(20)).outcome, 'unsupported');
});

test('identify: Samsung answers with name, model and wifi address', async () => {
  const http = async (): Promise<HttpResponse> => ({
    ok: true, status: 200,
    json: async () => ({ device: { name: '[TV] Samsung 7 Series', modelName: 'UE55', wifiMac: 'aa:bb:cc:dd:ee:ff', type: 'Samsung SmartTV' } }),
  });
  const r = await identifySamsung(depsFor(1, http), '10.0.0.5');
  assert.deepEqual(r, { kind: 'tizen', name: '[TV] Samsung 7 Series', model: 'UE55', mac: 'AA:BB:CC:DD:EE:FF' });
  const notSamsung = async (): Promise<HttpResponse> => ({ ok: true, status: 200, json: async () => ({ device: { name: 'Printer', type: 'Printer' } }) });
  assert.equal(await identifySamsung(depsFor(1, notSamsung), '10.0.0.6'), null);
});

test('identify: LG is recognised by its webOS reply; other services are not', async () => {
  const lg = await startFakeWsServer({ onMessage: (c, t) => c.send(JSON.stringify({ type: 'error', id: JSON.parse(t).id, error: '401 insufficient permissions' })) });
  assert.deepEqual(await identifyLg(depsFor(lg.port), '127.0.0.1'), { kind: 'webos' });
  lg.close();
  const other = await startFakeWsServer({ onMessage: (c) => c.send('hello, not json') });
  assert.equal(await identifyLg(depsFor(other.port), '127.0.0.1'), null);
  other.close();
});

test('identify: detectAt falls back to Android TV by port', async () => {
  const deps: Deps = { ...depsFor(1), probe: async (_h, p) => p === 6466 };
  assert.deepEqual(await detectAt(deps, '10.0.0.7'), { kind: 'androidtv' });
  assert.equal(await detectAt({ ...deps, probe: async () => false }, '10.0.0.8'), null);
});
