// Local, rule-based command parser. No network, no cloud AI.
import type { RemoteKey } from '../drivers/types';
import { findApp } from './apps.ts';
import type { AppDef } from './apps.ts';

export type Intent =
  | { type: 'open_app'; app: AppDef | null; spoken: string }
  | { type: 'close_app'; app: AppDef | null; spoken: string }
  | { type: 'power_off' }
  | { type: 'power_on' }
  | { type: 'volume_step'; direction: 'up' | 'down'; steps: number }
  | { type: 'volume_set'; level: number }
  | { type: 'mute' }
  | { type: 'playback'; key: 'PLAY' | 'PAUSE' | 'STOP' | 'NEXT' | 'PREVIOUS' }
  | { type: 'switch_input'; input: string }
  | { type: 'key'; key: RemoteKey }
  | { type: 'unknown'; heard: string };

const UNITS: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9,
  ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16,
  seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

/** Replace spelled-out numbers ("twenty five") with digits. */
function numberWordsToDigits(text: string): string {
  const tokens = text.split(' ');
  const out: string[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (t in TENS) {
      let n = TENS[t];
      const next = tokens[i + 1];
      if (next && next in UNITS && UNITS[next] > 0 && UNITS[next] < 10) {
        n += UNITS[next];
        i++;
      }
      out.push(String(n));
    } else if (t in UNITS) {
      out.push(String(UNITS[t]));
    } else if (t === 'hundred') {
      out.push('100');
    } else {
      out.push(t);
    }
  }
  return out.join(' ');
}

export function normalize(raw: string): string {
  let t = raw.toLowerCase();
  t = t.replace(/\bh\s?d\s?m\s?i\b/g, 'hdmi');
  t = t.replace(/\bh\s?d\s?(my|me|mi)\b/g, 'hdmi');
  // speech recognisers often hear the number after "hdmi" as a similar-sounding word
  t = t.replace(/\bhdmi\s*(won|one)\b/g, 'hdmi 1').replace(/\bhdmi\s*(to|too|two)\b/g, 'hdmi 2');
  t = t.replace(/\bhdmi\s*(tree|free|three)\b/g, 'hdmi 3').replace(/\bhdmi\s*(for|fore|four)\b/g, 'hdmi 4');
  t = t.replace(/\ba\s?v\b/g, 'av');
  t = t.replace(/%/g, ' percent ');
  t = t.replace(/[^a-z0-9+\s]/g, ' ');
  t = t.replace(/\s+/g, ' ').trim();
  t = numberWordsToDigits(t);
  t = t.replace(/\bhdmi\s*(\d)\b/g, 'hdmi $1');
  t = t.replace(/^(hey |ok |okay )?(hanivox|tv|please)\s+/, '');
  t = t.replace(/\b(please|the tv|my tv|for me)\b/g, ' ').replace(/\s+/g, ' ').trim();
  return t;
}

export function parseCommand(raw: string): Intent {
  const t = normalize(raw);
  if (!t) return { type: 'unknown', heard: raw };

  // Power
  if (/\b(turn off|switch off|shut down|shutdown|power off|put to sleep|standby)\b/.test(t) || /^off$/.test(t)) {
    return { type: 'power_off' };
  }
  if (/\b(turn on|switch on|power on|wake up|wake)\b/.test(t) || /^on$/.test(t)) {
    return { type: 'power_on' };
  }

  // Inputs
  const hdmi = t.match(/\bhdmi (\d)\b/);
  if (hdmi && Number(hdmi[1]) >= 1 && Number(hdmi[1]) <= 4) {
    return { type: 'switch_input', input: `HDMI${hdmi[1]}` };
  }
  if (/\b(live tv|tv channels?|normal tv|tv mode|watch tv|tv input|tv source|television|cable)\b/.test(t) ||
      /^(go to |switch to |change to |select )?tv$/.test(t)) {
    return { type: 'switch_input', input: 'TV' };
  }
  if (/\b(av|composite|a v)\b/.test(t) && /\b(switch|go|change|select|input|source|to|use)\b/.test(t)) {
    return { type: 'switch_input', input: 'AV' };
  }
  if (/\b(change|switch|select|open|show)\b.*\b(input|inputs|source|sources)\b/.test(t) || /^(input|source)s?( menu)?$/.test(t)) {
    return { type: 'switch_input', input: 'PICKER' };
  }

  // Volume
  const setVol = t.match(/\bvolume (?:to |at |level )?(\d{1,3})\b/) || t.match(/\bset (?:the )?volume (?:to |at )?(\d{1,3})\b/) || t.match(/\b(\d{1,3}) percent volume\b/);
  if (setVol) {
    return { type: 'volume_set', level: Math.max(0, Math.min(100, Number(setVol[1]))) };
  }
  if (/\bunmute\b/.test(t) || /\bmute\b/.test(t)) return { type: 'mute' };

  const by = t.match(/\b(?:by|times?)\s+(\d{1,2})\b/) || t.match(/\b(\d{1,2}) (?:times|steps?)\b/);
  const steps = by ? Math.max(1, Math.min(20, Number(by[1]))) : 1;
  if (/\b(increase|raise|turn up|louder|volume up|up the volume|higher|more volume)\b/.test(t)) {
    return { type: 'volume_step', direction: 'up', steps };
  }
  if (/\b(decrease|lower|reduce|turn down|quieter|softer|volume down|down the volume|less volume)\b/.test(t)) {
    return { type: 'volume_step', direction: 'down', steps };
  }

  // Closing apps (before playback so "stop youtube" is a close, "stop" alone is playback)
  const close = t.match(/^(close|exit|quit|kill|stop)\s+(.+)$/);
  if (close) {
    const app = findApp(close[2]);
    if (app) return { type: 'close_app', app, spoken: close[2] };
    if (close[1] !== 'stop' && !/\b(video|movie|music|playback|playing)\b/.test(close[2])) {
      return { type: 'close_app', app: null, spoken: close[2] };
    }
  }
  if (/^(close|exit|quit)( app| this app| the app)?$/.test(t)) return { type: 'close_app', app: null, spoken: '' };

  // Playback
  if (/\b(pause|hold on)\b/.test(t)) return { type: 'playback', key: 'PAUSE' };
  if (/\b(resume|continue)\b/.test(t) || /^play( video| the video| it)?$/.test(t)) return { type: 'playback', key: 'PLAY' };
  if (/^stop\b/.test(t)) return { type: 'playback', key: 'STOP' };
  if (/\b(next|skip)\b/.test(t)) return { type: 'playback', key: 'NEXT' };
  if (/\b(previous|go back one|last video)\b/.test(t)) return { type: 'playback', key: 'PREVIOUS' };

  // Opening apps
  const open = t.match(/^(open|launch|start|run|go to|show|play|watch|take me to)\s+(.+)$/);
  if (open) {
    const app = findApp(open[2]);
    if (app) return { type: 'open_app', app, spoken: open[2] };
    if (['open', 'launch', 'start', 'run'].includes(open[1])) {
      return { type: 'open_app', app: null, spoken: open[2] };
    }
  }

  // Navigation keys
  if (/^(go )?(home|home screen|go to home|go to the home screen)$/.test(t) || /\bhome screen\b/.test(t)) return { type: 'key', key: 'HOME' };
  if (/^(go )?back$/.test(t)) return { type: 'key', key: 'BACK' };
  if (/^(ok|okay|select|enter|confirm)$/.test(t)) return { type: 'key', key: 'OK' };
  if (/^(go )?up$/.test(t)) return { type: 'key', key: 'UP' };
  if (/^(go )?down$/.test(t)) return { type: 'key', key: 'DOWN' };
  if (/^(go )?left$/.test(t)) return { type: 'key', key: 'LEFT' };
  if (/^(go )?right$/.test(t)) return { type: 'key', key: 'RIGHT' };
  if (/^menu$/.test(t)) return { type: 'key', key: 'MENU' };

  return { type: 'unknown', heard: raw };
}
