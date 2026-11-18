import type { InputOption } from './types';

/** Standard input keys we can try on devices that do not report their real inputs. */
export const GUESS_INPUTS: InputOption[] = [
  { id: 'TV', label: 'TV (live channels)', support: 'unverified', source: 'guess' },
  { id: 'HDMI1', label: 'HDMI 1', support: 'unverified', source: 'guess' },
  { id: 'HDMI2', label: 'HDMI 2', support: 'unverified', source: 'guess' },
  { id: 'HDMI3', label: 'HDMI 3', support: 'unverified', source: 'guess' },
  { id: 'HDMI4', label: 'HDMI 4', support: 'unverified', source: 'guess' },
  { id: 'AV', label: 'AV', support: 'unverified', source: 'guess' },
  { id: 'PICKER', label: "Open the TV's input menu", support: 'unverified', source: 'guess' },
];
