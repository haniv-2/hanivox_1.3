// Turns a parsed voice intent into driver calls. Checks capabilities first, so the app never
// claims an action worked when the device cannot do it.
import type { ActionResult, DeviceDriver } from '../drivers/types';
import type { Intent } from '../voice/intents';

export type InputFeedback = Record<string, 'works' | 'broken'>;

export interface RunContext {
  deviceId: string;
  feedback: InputFeedback;
}

const unsupported = (message: string): ActionResult => ({ outcome: 'unsupported', message });

export async function runIntent(driver: DeviceDriver, intent: Intent, ctx: RunContext): Promise<ActionResult> {
  const caps = driver.getCapabilities();

  switch (intent.type) {
    case 'open_app': {
      if (!intent.app) {
        return { outcome: 'failed', message: `I don't know an app called "${intent.spoken}". You can add it in src/voice/apps.ts.` };
      }
      if (caps.launch_app === 'unsupported') return unsupported('This device cannot open apps.');
      return driver.launchApp(intent.app.id);
    }

    case 'close_app': {
      if (caps.close_app !== 'unsupported') return driver.closeApp(intent.app ? intent.app.id : '');
      if (caps.navigation === 'unsupported') return unsupported('This device cannot close apps.');
      const r = await driver.sendKey('HOME');
      if (r.outcome === 'failed') return r;
      return {
        outcome: 'sent',
        message: 'This TV cannot close apps remotely. I sent Home, which hides the app but does not quit it.',
      };
    }

    case 'power_off':
      if (caps.power_off === 'unsupported') return unsupported('This device cannot be turned off from here.');
      return driver.powerOff();

    case 'power_on':
      if (caps.power_on === 'unsupported') return unsupported('This device cannot be turned on from here.');
      return driver.powerOn();

    case 'volume_step': {
      if (caps.volume_step === 'unsupported') return unsupported('This device does not support volume control.');
      let last: ActionResult = { outcome: 'failed', message: 'No volume key sent.' };
      for (let i = 0; i < intent.steps; i++) {
        last = await driver.sendKey(intent.direction === 'up' ? 'VOL_UP' : 'VOL_DOWN');
        if (last.outcome === 'failed') return last;
      }
      const times = intent.steps > 1 ? ` x${intent.steps}` : '';
      return { outcome: last.outcome, message: `Volume ${intent.direction}${times}. ${last.message}` };
    }

    case 'volume_set':
      if (caps.volume_set === 'unsupported') {
        return unsupported('This TV cannot set an exact volume, only step it up or down. Say "increase volume by 5" instead.');
      }
      return driver.setVolume(intent.level);

    case 'mute':
      if (caps.mute === 'unsupported') return unsupported('This device cannot be muted from here.');
      return driver.sendKey('MUTE');

    case 'playback':
      if (caps.playback === 'unsupported') return unsupported('This device does not support playback keys.');
      return driver.sendKey(intent.key);

    case 'switch_input': {
      if (caps.switch_input === 'unsupported') return unsupported('This device cannot switch inputs from here.');
      if (ctx.feedback[`${ctx.deviceId}:${intent.input}`] === 'broken') {
        return { outcome: 'failed', message: `You marked ${intent.input} as not working on this TV, so I did not send it.` };
      }
      return driver.switchInput(intent.input);
    }

    case 'key':
      if (caps.navigation === 'unsupported') return unsupported('This device does not support remote keys.');
      return driver.sendKey(intent.key);

    case 'unknown':
      return { outcome: 'failed', message: `I didn't understand "${intent.heard}".` };
  }
}
