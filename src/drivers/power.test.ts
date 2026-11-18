import { test } from 'node:test';
import assert from 'node:assert/strict';
import { confirmOff, magicPacket, normalizeMac, pollPort, wakeViaLan } from './power.ts';

const noSleep = async () => {};

test('mac addresses are normalised or rejected', () => {
  assert.equal(normalizeMac('aa-bb-cc-dd-ee-ff'), 'AA:BB:CC:DD:EE:FF');
  assert.equal(normalizeMac('AABBCCDDEEFF'), 'AA:BB:CC:DD:EE:FF');
  assert.equal(normalizeMac(' 01:23:45:67:89:ab '), '01:23:45:67:89:AB');
  assert.equal(normalizeMac('AA:BB:CC:DD:EE'), null);
  assert.equal(normalizeMac('GG:BB:CC:DD:EE:FF'), null);
  assert.equal(normalizeMac('AA:BB:CC:DD:EE:FF:00'), null);
});

test('magic packet layout', () => {
  const p = magicPacket('01:02:03:04:05:06');
  assert.equal(p.length, 102);
  assert.deepEqual(Array.from(p.slice(0, 6)), [255, 255, 255, 255, 255, 255]);
  assert.deepEqual(Array.from(p.slice(6, 12)), [1, 2, 3, 4, 5, 6]);
  assert.deepEqual(Array.from(p.slice(96, 102)), [1, 2, 3, 4, 5, 6]);
  assert.throws(() => magicPacket('nope'));
});

test('pollPort waits for the wanted state', async () => {
  let calls = 0;
  assert.equal(await pollPort(async () => ++calls >= 3, true, 10000, 1000, noSleep), true);
  assert.equal(calls, 3);
  assert.equal(await pollPort(async () => true, false, 3000, 1000, noSleep), false);
});

test('wake: no address and TV unreachable is a clear failure, nothing is sent', async () => {
  let sent = 0;
  const r = await wakeViaLan({ mac: undefined, probe: async () => false, send: async () => { sent++; }, sleep: noSleep });
  assert.equal(r.outcome, 'failed');
  assert.match(r.message, /MAC address/);
  assert.equal(sent, 0);
});

test('wake: confirmed only when the TV really answers afterwards', async () => {
  let sent = 0;
  let probes = 0;
  const probe = async () => ++probes > 6; // unreachable at first, up a few polls later
  const r = await wakeViaLan({ mac: 'AA:BB:CC:DD:EE:FF', probe, send: async () => { sent++; }, sleep: noSleep, timeoutMs: 20000 });
  assert.equal(r.outcome, 'confirmed');
  assert.equal(sent, 3);
});

test('wake: unconfirmed when the TV never answers', async () => {
  const r = await wakeViaLan({ mac: 'AA:BB:CC:DD:EE:FF', probe: async () => false, send: async () => {}, sleep: noSleep, timeoutMs: 5000 });
  assert.equal(r.outcome, 'unconfirmed');
});

test('wake: an already reachable TV is reported as such', async () => {
  const r = await wakeViaLan({ mac: undefined, probe: async () => true, send: async () => {}, sleep: noSleep });
  assert.equal(r.outcome, 'confirmed');
});

test('off: confirmed only if the TV goes offline', async () => {
  let n = 0;
  assert.equal((await confirmOff({ probe: async () => ++n < 3, sleep: noSleep })).outcome, 'confirmed');
  assert.equal((await confirmOff({ probe: async () => true, sleep: noSleep, timeoutMs: 3000 })).outcome, 'unconfirmed');
});
