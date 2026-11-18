import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseCommand } from './intents.ts';
import { pickBestTranscript } from './transcript.ts';
import { speechErrorMessage } from './speechErrors.ts';

test('misheard numbers after HDMI are repaired', () => {
  assert.deepEqual(parseCommand('switch to hdmi too'), { type: 'switch_input', input: 'HDMI2' });
  assert.deepEqual(parseCommand('go to hd my 3'), { type: 'switch_input', input: 'HDMI3' });
  assert.deepEqual(parseCommand('switch to hdmi for'), { type: 'switch_input', input: 'HDMI4' });
  assert.deepEqual(parseCommand('go to hdmi won'), { type: 'switch_input', input: 'HDMI1' });
});

test('netflix homophone', () => {
  const i = parseCommand('open net flicks');
  assert.equal(i.type, 'open_app');
  assert.equal(i.type === 'open_app' && i.app?.id, 'netflix');
});

test('best transcript prefers one that is a real command', () => {
  assert.equal(pickBestTranscript(['hello there', 'open youtube', 'open you tube']), 'open youtube');
  assert.equal(pickBestTranscript(['blah blah', 'nothing here']), 'blah blah');
  assert.equal(pickBestTranscript([]), '');
  assert.equal(pickBestTranscript(['  ', '']), '');
});

test('speech errors are readable', () => {
  assert.match(speechErrorMessage(7), /couldn't understand/);
  assert.match(speechErrorMessage(-1), /Allow online recognition/);
  assert.match(speechErrorMessage(9), /permission/i);
  assert.match(speechErrorMessage(999), /999/);
});
