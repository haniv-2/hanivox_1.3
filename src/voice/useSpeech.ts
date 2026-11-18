import { useCallback, useEffect, useRef, useState } from 'react';
import { PermissionsAndroid } from 'react-native';
import { tvNative } from '../../modules/hanivox-tv';
import type { Subscription } from '../../modules/hanivox-tv';
import { speechErrorMessage } from './speechErrors';
import { pickBestTranscript } from './transcript';

export type SpeechPhase = 'idle' | 'starting' | 'listening' | 'processing';

export interface SpeechSupport {
  onDevice: boolean;
  system: boolean;
}

export async function getSpeechSupport(): Promise<SpeechSupport> {
  try {
    return await tvNative().speechCapabilities();
  } catch {
    return { onDevice: false, system: false };
  }
}

export async function ensureMicPermission(): Promise<'granted' | 'denied' | 'blocked'> {
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO, {
    title: 'Microphone',
    message: 'Hanivox only listens after you tap the microphone button, for one command at a time.',
    buttonPositive: 'Allow',
    buttonNegative: 'Not now',
  });
  if (result === PermissionsAndroid.RESULTS.GRANTED) return 'granted';
  if (result === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'blocked';
  return 'denied';
}

/**
 * One tap = one command. Nothing is recorded in the background.
 * onFinal gets the recognised text; onProblem gets a message to show the person.
 */
export function useSpeech(onFinal: (text: string) => void, onProblem: (message: string) => void) {
  const [phase, setPhase] = useState<SpeechPhase>('idle');
  const [partial, setPartial] = useState('');
  const subs = useRef<Subscription[]>([]);
  const finalRef = useRef(onFinal);
  const problemRef = useRef(onProblem);
  finalRef.current = onFinal;
  problemRef.current = onProblem;

  const cleanup = useCallback(() => {
    subs.current.forEach((s) => s.remove());
    subs.current = [];
  }, []);

  useEffect(() => {
    return () => {
      cleanup();
      try {
        tvNative().cancelListening().catch(() => {});
      } catch {
        // native module not available
      }
    };
  }, [cleanup]);

  const start = useCallback(
    async (lang: string, allowOnline: boolean) => {
      cleanup();
      setPartial('');
      setPhase('starting');

      const permission = await ensureMicPermission();
      if (permission !== 'granted') {
        setPhase('idle');
        problemRef.current(
          permission === 'blocked'
            ? 'The microphone is blocked. Open Android Settings → Apps → Hanivox → Permissions and allow Microphone.'
            : 'Hanivox needs the microphone permission to hear your commands.',
        );
        return;
      }

      try {
        const native = tvNative();
        await native.wakeStop().catch(() => {}); // free the microphone if "Hey Vox" was listening
        subs.current = [
          native.addListener('onSpeechState', (e) => setPhase(e.state === 'listening' ? 'listening' : 'processing')),
          native.addListener('onSpeechPartial', (e) => setPartial(e.text)),
          native.addListener('onSpeechResult', (e) => {
            cleanup();
            setPhase('idle');
            const text = pickBestTranscript(e.alternatives);
            if (!text) problemRef.current(speechErrorMessage(7));
            else {
              setPartial(text);
              finalRef.current(text);
            }
          }),
          native.addListener('onSpeechError', (e) => {
            cleanup();
            setPhase('idle');
            problemRef.current(speechErrorMessage(e.code));
          }),
        ];
        await native.startListening(lang, allowOnline);
      } catch (e) {
        cleanup();
        setPhase('idle');
        problemRef.current(e instanceof Error ? e.message : speechErrorMessage(-2));
      }
    },
    [cleanup],
  );

  const stop = useCallback(() => {
    try {
      tvNative().stopListening().catch(() => {});
    } catch {
      // native module not available
    }
  }, []);

  return { phase, partial, start, stop };
}
