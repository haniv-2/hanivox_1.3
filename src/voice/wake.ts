import { tvNative } from '../../modules/hanivox-tv';
import { useHanivox } from '../store/useHanivox';
import { ensureMicPermission } from './useSpeech';

/**
 * Gets everything "Hey Vox" needs: microphone permission and the small offline model
 * (about 40 MB, downloaded once). Returns an error message, or null when ready.
 */
export async function prepareWakeWord(): Promise<string | null> {
  const { setWake } = useHanivox.getState();
  const permission = await ensureMicPermission();
  if (permission !== 'granted') return 'Hey Vox needs the microphone permission.';
  try {
    const native = tvNative();
    if (!(await native.wakeModelInstalled())) {
      setWake({ state: 'downloading', percent: 0, error: null });
      const sub = native.addListener('onWakeDownload', (e) => setWake({ percent: e.percent }));
      try {
        await native.wakeDownloadModel();
      } finally {
        sub.remove();
      }
    }
    setWake({ state: 'paused', percent: 100, error: null });
    return null;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    setWake({ state: 'error', error: message });
    return `Could not set up Hey Vox: ${message}`;
  }
}
