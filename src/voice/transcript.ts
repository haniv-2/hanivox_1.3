import { parseCommand } from './intents.ts';

/**
 * Speech recognisers return several guesses. Use the first one that is a command Hanivox
 * understands; otherwise fall back to the top guess.
 */
export function pickBestTranscript(alternatives: string[]): string {
  const cleaned = alternatives.map((a) => a.trim()).filter((a) => a.length > 0);
  for (const a of cleaned) {
    if (parseCommand(a).type !== 'unknown') return a;
  }
  return cleaned[0] ?? '';
}
