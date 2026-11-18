import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from './intents.ts';

function appId(raw: string): string | null | undefined {
  const i = parseCommand(raw);
  return i.type === 'open_app' ? (i.app ? i.app.id : null) : undefined;
}

test('opening apps', () => {
  assert.equal(appId('Open YouTube.'), 'youtube');
  assert.equal(appId('open netflix'), 'netflix');
  assert.equal(appId('launch Prime Video'), 'primevideo');
  assert.equal(appId('go to youtube'), 'youtube');
  assert.equal(appId('open Zorgflix'), null);
});

test('closing apps', () => {
  const a = parseCommand('close youtube');
  assert.equal(a.type, 'close_app');
  const b = parseCommand('close the app');
  assert.equal(b.type, 'close_app');
  assert.equal(parseCommand('stop').type, 'playback');
  assert.equal(parseCommand('stop the video').type, 'playback');
});

test('power', () => {
  assert.equal(parseCommand('Turn off the TV.').type, 'power_off');
  assert.equal(parseCommand('please switch off').type, 'power_off');
  assert.equal(parseCommand('turn on the tv').type, 'power_on');
});

test('volume', () => {
  assert.deepEqual(parseCommand('Increase volume.'), { type: 'volume_step', direction: 'up', steps: 1 });
  assert.deepEqual(parseCommand('volume down'), { type: 'volume_step', direction: 'down', steps: 1 });
  assert.deepEqual(parseCommand('increase the volume by five'), { type: 'volume_step', direction: 'up', steps: 5 });
  assert.deepEqual(parseCommand('set volume to 30'), { type: 'volume_set', level: 30 });
  assert.deepEqual(parseCommand('set the volume to twenty five'), { type: 'volume_set', level: 25 });
  assert.deepEqual(parseCommand('Mute the TV.'), { type: 'mute' });
  assert.deepEqual(parseCommand('unmute'), { type: 'mute' });
});

test('playback', () => {
  assert.deepEqual(parseCommand('Pause the video.'), { type: 'playback', key: 'PAUSE' });
  assert.deepEqual(parseCommand('play'), { type: 'playback', key: 'PLAY' });
  assert.deepEqual(parseCommand('resume'), { type: 'playback', key: 'PLAY' });
});

test('inputs', () => {
  assert.deepEqual(parseCommand('Go to HDMI 1.'), { type: 'switch_input', input: 'HDMI1' });
  assert.deepEqual(parseCommand('Switch to HDMI 2'), { type: 'switch_input', input: 'HDMI2' });
  assert.deepEqual(parseCommand('switch to hdmi three'), { type: 'switch_input', input: 'HDMI3' });
  assert.deepEqual(parseCommand('Switch to AV.'), { type: 'switch_input', input: 'AV' });
  assert.deepEqual(parseCommand('switch to a v'), { type: 'switch_input', input: 'AV' });
  assert.deepEqual(parseCommand('Go to TV channels.'), { type: 'switch_input', input: 'TV' });
  assert.deepEqual(parseCommand('switch to normal tv mode'), { type: 'switch_input', input: 'TV' });
  assert.deepEqual(parseCommand('change input'), { type: 'switch_input', input: 'PICKER' });
});

test('navigation and unknown', () => {
  assert.deepEqual(parseCommand('go home'), { type: 'key', key: 'HOME' });
  assert.deepEqual(parseCommand('go back'), { type: 'key', key: 'BACK' });
  assert.equal(parseCommand('what is the weather').type, 'unknown');
  assert.equal(parseCommand('').type, 'unknown');
});
