import { test } from 'node:test';
import assert from 'node:assert/strict';
import { runIntent } from './commands.ts';
import { parseCommand } from '../voice/intents.ts';

type Caps = Record<string, 'supported' | 'unverified' | 'unsupported'>;

function fakeDriver(overrides: Caps = {}) {
  const calls: string[] = [];
  const caps: Caps = {
    navigation: 'supported', volume_step: 'supported', volume_set: 'unsupported', mute: 'supported',
    playback: 'supported', launch_app: 'unverified', close_app: 'unsupported', power_off: 'supported',
    power_on: 'unverified', list_inputs: 'unsupported', switch_input: 'unverified', ...overrides,
  };
  const sent = (m: string) => ({ outcome: 'sent' as const, message: m });
  const driver: any = {
    kind: 'mock', requiresPairing: false,
    getCapabilities: () => caps,
    sendKey: async (k: string) => { calls.push(`key:${k}`); return sent(`${k} sent`); },
    launchApp: async (id: string) => { calls.push(`launch:${id}`); return sent('ok'); },
    closeApp: async (id: string) => { calls.push(`close:${id}`); return sent('ok'); },
    setVolume: async (n: number) => { calls.push(`vol:${n}`); return sent('ok'); },
    powerOff: async () => { calls.push('off'); return sent('ok'); },
    powerOn: async () => { calls.push('on'); return sent('ok'); },
    switchInput: async (id: string) => { calls.push(`input:${id}`); return sent('ok'); },
  };
  return { driver, calls };
}

const ctx = { deviceId: 'tv1', feedback: {} as Record<string, 'works' | 'broken'> };

test('closing an app on a TV that cannot close apps sends Home and says so', async () => {
  const { driver, calls } = fakeDriver();
  const r = await runIntent(driver, parseCommand('close youtube'), ctx);
  assert.deepEqual(calls, ['key:HOME']);
  assert.equal(r.outcome, 'sent');
  assert.match(r.message, /cannot close apps/i);
});

test('exact volume is refused when unsupported, and no keys are sent', async () => {
  const { driver, calls } = fakeDriver();
  const r = await runIntent(driver, parseCommand('set volume to 30'), ctx);
  assert.equal(r.outcome, 'unsupported');
  assert.deepEqual(calls, []);
});

test('volume steps send the right number of keys', async () => {
  const { driver, calls } = fakeDriver();
  await runIntent(driver, parseCommand('increase volume by 3'), ctx);
  assert.deepEqual(calls, ['key:VOL_UP', 'key:VOL_UP', 'key:VOL_UP']);
});

test('inputs marked broken are not sent', async () => {
  const { driver, calls } = fakeDriver();
  const r = await runIntent(driver, parseCommand('switch to hdmi 2'), { deviceId: 'tv1', feedback: { 'tv1:HDMI2': 'broken' } });
  assert.equal(r.outcome, 'failed');
  assert.deepEqual(calls, []);
});

test('unsupported input switching is reported, not faked', async () => {
  const { driver, calls } = fakeDriver({ switch_input: 'unsupported' });
  const r = await runIntent(driver, parseCommand('go to hdmi 1'), ctx);
  assert.equal(r.outcome, 'unsupported');
  assert.deepEqual(calls, []);
});

test('unknown app gives a clear failure', async () => {
  const { driver, calls } = fakeDriver();
  const r = await runIntent(driver, parseCommand('open zorgflix'), ctx);
  assert.equal(r.outcome, 'failed');
  assert.deepEqual(calls, []);
});

test('open youtube launches the app', async () => {
  const { driver, calls } = fakeDriver();
  await runIntent(driver, parseCommand('open youtube'), ctx);
  assert.deepEqual(calls, ['launch:youtube']);
});
