import { useEffect, useRef, useState } from 'react';
import { AppState, PermissionsAndroid } from 'react-native';
import * as Haptics from 'expo-haptics';
import { usePathname, useRouter } from 'expo-router';
import { tvNative } from '../../modules/hanivox-tv';
import { useHanivox } from '../store/useHanivox';

/**
 * Keeps the offline "Hey Vox" listener running only while it should:
 * the switch is on, the app is on screen, and no voice command is in progress.
 * Mounted once at the top of the app. Renders nothing.
 */
export function WakeWordManager() {
  const router = useRouter();
  const pathname = usePathname();
  const enabled = useHanivox((s) => s.settings.wakeWord);
  const voiceBusy = useHanivox((s) => s.voiceBusy);
  const wakePause = useHanivox((s) => s.wakePause);
  const [appActive, setAppActive] = useState(AppState.currentState === 'active');
  const pathnameRef = useRef(pathname);
  const routerRef = useRef(router);
  pathnameRef.current = pathname;
  routerRef.current = router;

  useEffect(() => {
    const sub = AppState.addEventListener('change', (s) => setAppActive(s === 'active'));
    return () => sub.remove();
  }, []);

  // Never stay paused for long, even if something went wrong in the voice screen.
  useEffect(() => {
    if (!wakePause) return;
    const timer = setTimeout(() => useHanivox.getState().pauseWake(false), 25000);
    return () => clearTimeout(timer);
  }, [wakePause]);

  const shouldListen = enabled && appActive && !voiceBusy && !wakePause;

  useEffect(() => {
    const { setWake } = useHanivox.getState();
    if (!enabled) {
      setWake({ state: 'off', error: null });
      tvNative().wakeStop().catch(() => {});
      return;
    }
    if (!shouldListen) {
      setWake({ state: 'paused' });
      tvNative().wakeStop().catch(() => {});
      return;
    }

    let cancelled = false;
    const native = tvNative();
    const subs = [
      native.addListener('onWakeDetected', () => {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        useHanivox.getState().triggerWake();
        if (pathnameRef.current !== '/voice') routerRef.current.push({ pathname: '/voice', params: { listen: '1' } });
      }),
      native.addListener('onWakeError', (e) => {
        useHanivox.getState().setWake({ state: 'error', error: e.message });
      }),
    ];

    (async () => {
      try {
        if (!(await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.RECORD_AUDIO))) {
          setWake({ state: 'error', error: 'The microphone permission is missing.' });
          return;
        }
        if (!(await native.wakeModelInstalled())) {
          setWake({ state: 'needs-model' });
          return;
        }
        if (cancelled) return;
        await native.wakeStart();
        if (!cancelled) setWake({ state: 'listening', error: null });
      } catch (e) {
        setWake({ state: 'error', error: e instanceof Error ? e.message : String(e) });
      }
    })();

    return () => {
      cancelled = true;
      subs.forEach((s) => s.remove());
      native.wakeStop().catch(() => {});
    };
  }, [enabled, shouldListen]);

  return null;
}
