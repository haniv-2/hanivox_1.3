import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startFakeWsServer } from '../../test-utils/fakeWsServer.ts';
import type { FakeConnection } from '../../test-utils/fakeWsServer.ts';
import type { Deps } from '../deps.ts';
import { onCredential } from '../events.ts';
import type { DeviceInfo } from '../types.ts';
import { LgWebOsDriver } from './driver.ts';

const device: DeviceInfo = { id: 'lg-127.0.0.1', name: 'LG TV', kind: 'webos', host: '127.0.0.1' };

async function setup(opts: { badInput?: boolean } = {}) {
  const requests: Array<{ uri: string; payload?: any }> = [];
  const registers: any[] = [];
  const pointer: string[] = [];
  let port = 0;
  const server = await startFakeWsServer({
    onMessage(c: FakeConnection, text: string) {
      if (c.path.startsWith('/pointer')) { pointer.push(text); return; }
      const msg = JSON.parse(text);
      if (msg.type === 'register') {
        registers.push(msg);
        c.send(JSON.stringify({ type: 'response', id: 'register_0', payload: { pairingType: 'PROMPT', returnValue: true } }));
        setTimeout(() => c.send(JSON.stringify({ type: 'registered', id: 'register_0', payload: { 'client-key': 'KEY123' } })), 20);
        return;
      }
      requests.push({ uri: msg.uri, payload: msg.payload });
      let payload: any = { returnValue: true };
      if (msg.uri === 'ssap://audio/getVolume') payload = { returnValue: true, muted: false, volume: 10 };
      if (msg.uri === 'ssap://com.webos.service.networkinput/getPointerInputSocket') payload = { returnValue: true, socketPath: `ws://127.0.0.1:${port}/pointer` };
      if (msg.uri === 'ssap://tv/getExternalInputList') payload = { returnValue: true, devices: [{ id: 'HDMI_1', label: 'HDMI 1' }, { id: 'HDMI_2', label: 'Game Console' }, { id: 'AV_1', label: 'AV' }] };
      if (msg.uri === 'ssap://tv/switchInput' && opts.badInput) payload = { returnValue: false, errorText: 'Unknown input' };
      c.send(JSON.stringify({ type: 'response', id: msg.id, payload }));
    },
  });
  port = server.port;
  const deps: Deps = {
    ws: (url) => new WebSocket(url.replace(':3000', `:${server.port}`)),
    http: async () => { throw new Error('no http'); },
    probe: async () => false,
    sendMagic: async () => {},
  };
  const driver = new LgWebOsDriver(device, deps);
  return { driver, server, requests, registers, pointer };
}

test('LG: first connection registers, waits for approval, and hands out the pairing key', async () => {
  const { driver, server, registers } = await setup();
  const keys: string[] = [];
  const off = onCredential((_id, key) => keys.push(key));
  const r = await driver.connect();
  assert.equal(r.outcome, 'confirmed');
  assert.deepEqual(keys, ['KEY123']);
  assert.equal(registers[0].payload['client-key'], undefined);
  off();
  await driver.disconnect();
  server.close();
});

test('LG: a saved pairing key is sent on connect', async () => {
  const { server, registers } = await setup();
  const deps: Deps = { ws: (u) => new WebSocket(u.replace(':3000', `:${server.port}`)), http: async () => { throw new Error('x'); }, probe: async () => false, sendMagic: async () => {} };
  const d = new LgWebOsDriver({ ...device, id: 'lg-saved', credential: 'OLDKEY' }, deps);
  assert.equal((await d.connect()).outcome, 'confirmed');
  assert.equal(registers[0].payload['client-key'], 'OLDKEY');
  await d.disconnect();
  server.close();
});

test('LG: volume, exact volume, mute toggle, app launch and close', async () => {
  const { driver, server, requests } = await setup();
  await driver.connect();
  assert.equal((await driver.sendKey('VOL_UP')).outcome, 'confirmed');
  assert.equal((await driver.setVolume(25)).outcome, 'confirmed');
  const mute = await driver.sendKey('MUTE');
  assert.equal(mute.outcome, 'confirmed');
  assert.match(mute.message, /Muted/);
  assert.equal((await driver.launchApp('youtube')).outcome, 'confirmed');
  assert.equal((await driver.closeApp('youtube')).outcome, 'confirmed');
  const uris = requests.map((r) => r.uri);
  assert.ok(uris.includes('ssap://audio/volumeUp'));
  assert.deepEqual(requests.find((r) => r.uri === 'ssap://audio/setVolume')?.payload, { volume: 25 });
  assert.deepEqual(requests.find((r) => r.uri === 'ssap://audio/setMute')?.payload, { mute: true });
  assert.deepEqual(requests.find((r) => r.uri === 'ssap://system.launcher/launch')?.payload, { id: 'youtube.leanback.v4' });
  assert.deepEqual(requests.find((r) => r.uri === 'ssap://system.launcher/close')?.payload, { id: 'youtube.leanback.v4' });
  await driver.disconnect();
  server.close();
});

test('LG: arrow keys go through the pointer socket', async () => {
  const { driver, server, pointer } = await setup();
  await driver.connect();
  assert.equal((await driver.sendKey('UP')).outcome, 'sent');
  await new Promise((r) => setTimeout(r, 100));
  assert.deepEqual(pointer, ['type:button\nname:UP\n\n']);
  await driver.disconnect();
  server.close();
});

test('LG: real inputs are listed and switched by their own ids', async () => {
  const { driver, server, requests } = await setup();
  await driver.connect();
  const inputs = await driver.listInputs();
  assert.deepEqual(inputs.map((i) => i.id), ['TV', 'HDMI1', 'HDMI2', 'AV']);
  assert.ok(inputs.every((i) => i.support === 'supported'));
  assert.equal((await driver.switchInput('HDMI2')).outcome, 'confirmed');
  assert.deepEqual(requests.find((r) => r.uri === 'ssap://tv/switchInput')?.payload, { inputId: 'HDMI_2' });
  assert.equal((await driver.switchInput('TV')).outcome, 'confirmed');
  await driver.disconnect();
  server.close();
});

test('LG: a refused request is reported as failed, not success', async () => {
  const { driver, server } = await setup({ badInput: true });
  await driver.connect();
  const r = await driver.switchInput('HDMI1');
  assert.equal(r.outcome, 'failed');
  assert.match(r.message, /Unknown input/);
  await driver.disconnect();
  server.close();
});

test('LG: power off is confirmed only when the TV really goes offline', async () => {
  const { driver, server } = await setup();
  await driver.connect();
  const r = await driver.powerOff(); // probe says port closed straight away
  assert.equal(r.outcome, 'confirmed');
  await driver.disconnect();
  server.close();
});

test('LG: commands before connecting fail clearly', async () => {
  const deps: Deps = { ws: () => { throw new Error('unused'); }, http: async () => { throw new Error('x'); }, probe: async () => false, sendMagic: async () => {} };
  const d = new LgWebOsDriver(device, deps);
  assert.equal((await d.sendKey('UP')).outcome, 'failed');
  assert.equal((await d.launchApp('youtube')).outcome, 'failed');
});
