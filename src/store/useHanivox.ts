import { create } from 'zustand';
import { createJSONStorage, persist } from 'zustand/middleware';
import Storage from 'expo-sqlite/kv-store';
import { discoverDevices } from '../discovery';
import { dropDriver, getDriver } from '../drivers';
import { syncDevices } from '../drivers/deviceRegistry';
import { onCredential, onHostLost } from '../drivers/events';
import type { ActionResult, ConnectionState, DeviceInfo, SavedDevice } from '../drivers/types';
import type { InputFeedback } from '../core/commands';

export interface Settings {
  /** When false, speech is only recognised on the device itself. */
  allowOnlineSpeech: boolean;
  speechLang: string;
  /** Hands-free "Hey Vox". Off by default. */
  wakeWord: boolean;
}

export type WakeState = 'off' | 'paused' | 'needs-model' | 'downloading' | 'listening' | 'error';

export interface WakeStatus {
  state: WakeState;
  percent: number;
  error: string | null;
}

interface State {
  saved: SavedDevice[];
  activeId: string | null;
  inputFeedback: InputFeedback;
  settings: Settings;
  discovered: DeviceInfo[];
  scanning: boolean;
  scanError: string | null;
  wake: WakeStatus;
  /** True while a voice command is being listened to or run. */
  voiceBusy: boolean;
  /** True from the moment "Hey Vox" is heard until the voice command is finished. */
  wakePause: boolean;
  /** Increases every time "Hey Vox" is heard. */
  wakeSignal: number;
  connection: Record<string, ConnectionState>;

  addDiscovered: (d: DeviceInfo) => void;
  scan: () => Promise<void>;
  findDevice: (id: string) => SavedDevice | DeviceInfo | undefined;
  saveDevice: (d: DeviceInfo, paired?: boolean) => void;
  forgetDevice: (id: string) => Promise<void>;
  renameDevice: (id: string, name: string) => void;
  setMac: (id: string, mac: string) => void;
  setActive: (id: string) => void;
  pair: (id: string, code: string) => Promise<ActionResult>;
  connect: (id: string) => Promise<ActionResult>;
  disconnect: (id: string) => Promise<void>;
  updateSettings: (patch: Partial<Settings>) => void;
  setWake: (patch: Partial<WakeStatus>) => void;
  setVoiceBusy: (busy: boolean) => void;
  pauseWake: (paused: boolean) => void;
  triggerWake: () => void;
  setInputFeedback: (deviceId: string, inputId: string, value: 'works' | 'broken') => void;
}

export const useHanivox = create<State>()(
  persist(
    (set, get) => ({
      saved: [],
      activeId: null,
      inputFeedback: {},
      settings: { allowOnlineSpeech: false, speechLang: 'en-US', wakeWord: false },
      discovered: [],
      scanning: false,
      scanError: null,
      wake: { state: 'off', percent: 0, error: null },
      voiceBusy: false,
      wakePause: false,
      wakeSignal: 0,
      connection: {},

      addDiscovered: (d) =>
        set((s) => (s.discovered.some((x) => x.id === d.id) ? s : { discovered: [...s.discovered, d] })),

      scan: async () => {
        if (get().scanning) return;
        set((s) => ({ scanning: true, scanError: null, discovered: s.discovered.filter((d) => d.kind === 'mock') }));
        try {
          await discoverDevices((d) => get().addDiscovered(d));
        } catch (e) {
          set({ scanError: e instanceof Error ? e.message : String(e) });
        } finally {
          set({ scanning: false });
        }
      },

      findDevice: (id) => get().saved.find((d) => d.id === id) ?? get().discovered.find((d) => d.id === id),

      saveDevice: (d, paired) =>
        set((s) => {
          const existing = s.saved.find((x) => x.id === d.id);
          if (existing) {
            return { saved: s.saved.map((x) => (x.id === d.id ? { ...x, ...d, paired: paired ?? x.paired } : x)) };
          }
          return { saved: [...s.saved, { ...d, paired: paired ?? false }], activeId: s.activeId ?? d.id };
        }),

      forgetDevice: async (id) => {
        const driver = get().findDevice(id) ? getDriver(get().findDevice(id) as DeviceInfo) : null;
        if (driver) await driver.disconnect();
        dropDriver(id);
        set((s) => {
          const saved = s.saved.filter((d) => d.id !== id);
          const connection = { ...s.connection };
          delete connection[id];
          return { saved, connection, activeId: s.activeId === id ? (saved[0]?.id ?? null) : s.activeId };
        });
      },

      renameDevice: (id, name) =>
        set((s) => ({ saved: s.saved.map((d) => (d.id === id ? { ...d, customName: name.trim() || undefined } : d)) })),

      setMac: (id, mac) =>
        set((s) => ({
          saved: s.saved.map((d) => (d.id === id ? { ...d, mac: mac.trim() || undefined } : d)),
          discovered: s.discovered.map((d) => (d.id === id ? { ...d, mac: mac.trim() || undefined } : d)),
        })),

      setActive: (id) => set({ activeId: id }),

      pair: async (id, code) => {
        const device = get().findDevice(id);
        if (!device) return { outcome: 'failed', message: 'Device not found.' };
        set((s) => ({ connection: { ...s.connection, [id]: 'pairing' } }));
        const result = await getDriver(device).pair(code);
        const paired = result.outcome === 'confirmed';
        set((s) => ({ connection: { ...s.connection, [id]: paired ? 'disconnected' : 'error' } }));
        if (paired) get().saveDevice(device, true);
        return result;
      },

      connect: async (id) => {
        const device = get().findDevice(id);
        if (!device) return { outcome: 'failed', message: 'Device not found.' };
        set((s) => ({ connection: { ...s.connection, [id]: 'connecting' } }));
        const result = await getDriver(device).connect();
        const ok = result.outcome === 'confirmed';
        set((s) => ({
          connection: { ...s.connection, [id]: ok ? 'connected' : 'error' },
          saved: ok ? s.saved.map((d) => (d.id === id ? { ...d, lastConnectedAt: Date.now() } : d)) : s.saved,
          activeId: ok ? id : s.activeId,
        }));
        return result;
      },

      disconnect: async (id) => {
        const device = get().findDevice(id);
        if (device) await getDriver(device).disconnect();
        set((s) => ({ connection: { ...s.connection, [id]: 'disconnected' } }));
      },

      setWake: (patch) => set((s) => ({ wake: { ...s.wake, ...patch } })),
      setVoiceBusy: (busy) => set({ voiceBusy: busy }),
      pauseWake: (paused) => set({ wakePause: paused }),
      triggerWake: () => set((s) => ({ wakePause: true, wakeSignal: s.wakeSignal + 1 })),

      updateSettings: (patch) => set((s) => ({ settings: { ...s.settings, ...patch } })),

      setInputFeedback: (deviceId, inputId, value) =>
        set((s) => ({ inputFeedback: { ...s.inputFeedback, [`${deviceId}:${inputId}`]: value } })),
    }),
    {
      name: 'hanivox-store',
      storage: createJSONStorage(() => Storage),
      partialize: (s) => ({ saved: s.saved, activeId: s.activeId, inputFeedback: s.inputFeedback, settings: s.settings }),
    },
  ),
);

// Keep drivers aware of the latest device details (wake address, pairing key).
useHanivox.subscribe((st) => syncDevices([...st.discovered, ...st.saved]));
syncDevices([...useHanivox.getState().discovered, ...useHanivox.getState().saved]);

// Remember pairing keys that LG and Samsung TVs hand out.
onCredential((deviceId, credential) => {
  useHanivox.setState((st) => ({
    saved: st.saved.map((d) => (d.id === deviceId ? { ...d, credential } : d)),
    discovered: st.discovered.map((d) => (d.id === deviceId ? { ...d, credential } : d)),
  }));
});

// When a TV drops the connection by itself, show it as disconnected.
onHostLost((host) => {
  const s = useHanivox.getState();
  const ids = [...s.saved, ...s.discovered].filter((d) => d.host === host).map((d) => d.id);
  if (ids.length === 0) return;
  useHanivox.setState((st) => {
    const connection = { ...st.connection };
    for (const id of ids) if (connection[id] === 'connected') connection[id] = 'disconnected';
    return { connection };
  });
});

export function displayName(d: { name: string; customName?: string }): string {
  return d.customName || d.name;
}
