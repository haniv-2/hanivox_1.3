import { useCallback, useEffect, useRef, useState } from 'react';
import type { ComponentProps } from 'react';
import { Alert, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { GradientButton } from '../src/components/GradientButton';
import { Screen } from '../src/components/Screen';
import { StatusPill } from '../src/components/StatusPill';
import type { ActionResult, CapabilityKey, RemoteKey } from '../src/drivers/types';
import { useActiveDevice } from '../src/hooks/useActiveDevice';
import { displayName } from '../src/store/useHanivox';
import { colors, connectionColor, connectionLabel, gradient, outcomeColor } from '../src/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];
type Send = (key: RemoteKey) => void;

const KEY_BG = '#22222E';
const KEY_PRESSED = '#33334A';

/** Press once = one key. Hold = repeat (volume, arrows). */
function useRepeat(fire: () => void, repeat: boolean) {
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  const fireRef = useRef(fire);
  fireRef.current = fire;
  const stop = useCallback(() => {
    if (timer.current) {
      clearInterval(timer.current);
      timer.current = null;
    }
  }, []);
  useEffect(() => stop, [stop]);
  return {
    onPress: () => fireRef.current(),
    onLongPress: repeat
      ? () => {
          stop();
          timer.current = setInterval(() => fireRef.current(), 220);
        }
      : undefined,
    onPressOut: stop,
    delayLongPress: 380,
  };
}

function RoundKey(props: {
  k: RemoteKey;
  icon: IconName;
  send: Send;
  enabled: boolean;
  size?: number;
  caption?: string;
  repeat?: boolean;
}) {
  const { k, icon, send, enabled, size = 58, caption, repeat = false } = props;
  const handlers = useRepeat(() => send(k), repeat);
  return (
    <View style={styles.keyWrap}>
      <Pressable
        {...handlers}
        disabled={!enabled}
        style={({ pressed }) => [styles.round, { width: size, height: size, borderRadius: size / 2, backgroundColor: pressed ? KEY_PRESSED : KEY_BG, opacity: enabled ? 1 : 0.35 }]}
      >
        <Ionicons name={icon} size={size * 0.42} color={colors.text} />
      </Pressable>
      {caption ? <Text style={styles.caption}>{caption}</Text> : null}
    </View>
  );
}

function ArrowZone(props: {
  k: RemoteKey;
  icon: IconName;
  send: Send;
  enabled: boolean;
  style: object;
  iconSize: number;
}) {
  const { k, icon, send, enabled, style, iconSize } = props;
  const handlers = useRepeat(() => send(k), true);
  return (
    <Pressable {...handlers} disabled={!enabled} style={({ pressed }) => [styles.zone, style, { backgroundColor: pressed ? KEY_PRESSED : 'transparent' }]}>
      <Ionicons name={icon} size={iconSize} color={enabled ? colors.text : colors.dim} />
    </Pressable>
  );
}

function DPad({ send, enabled, size }: { send: Send; enabled: boolean; size: number }) {
  const long = size * 0.36;
  const short = size * 0.27;
  const edge = size * 0.035;
  const ok = size * 0.38;
  const icon = size * 0.13;
  return (
    <View style={[styles.dpad, { width: size, height: size, borderRadius: size / 2 }]}>
      <ArrowZone k="UP" icon="chevron-up" send={send} enabled={enabled} iconSize={icon}
        style={{ top: edge, left: (size - long) / 2, width: long, height: short, borderRadius: short / 2 }} />
      <ArrowZone k="DOWN" icon="chevron-down" send={send} enabled={enabled} iconSize={icon}
        style={{ bottom: edge, left: (size - long) / 2, width: long, height: short, borderRadius: short / 2 }} />
      <ArrowZone k="LEFT" icon="chevron-back" send={send} enabled={enabled} iconSize={icon}
        style={{ left: edge, top: (size - long) / 2, width: short, height: long, borderRadius: short / 2 }} />
      <ArrowZone k="RIGHT" icon="chevron-forward" send={send} enabled={enabled} iconSize={icon}
        style={{ right: edge, top: (size - long) / 2, width: short, height: long, borderRadius: short / 2 }} />
      <Pressable onPress={() => send('OK')} disabled={!enabled} style={({ pressed }) => ({ opacity: !enabled ? 0.35 : pressed ? 0.75 : 1 })}>
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={{ width: ok, height: ok, borderRadius: ok / 2, alignItems: 'center', justifyContent: 'center' }}>
          <Text style={styles.okText}>OK</Text>
        </LinearGradient>
      </Pressable>
    </View>
  );
}

function RockerHalf(props: { k: RemoteKey; icon: IconName; send: Send; enabled: boolean; style: object }) {
  const { k, icon, send, enabled, style } = props;
  const handlers = useRepeat(() => send(k), true);
  return (
    <Pressable {...handlers} disabled={!enabled} style={({ pressed }) => [styles.rockerHalf, style, { backgroundColor: pressed ? KEY_PRESSED : 'transparent', opacity: enabled ? 1 : 0.35 }]}>
      <Ionicons name={icon} size={26} color={colors.text} />
    </Pressable>
  );
}

function Rocker(props: { label: string; up: RemoteKey; down: RemoteKey; upIcon: IconName; downIcon: IconName; send: Send; enabled: boolean }) {
  const { label, up, down, upIcon, downIcon, send, enabled } = props;
  return (
    <View style={styles.rocker}>
      <RockerHalf k={up} icon={upIcon} send={send} enabled={enabled} style={{ borderTopLeftRadius: 40, borderTopRightRadius: 40 }} />
      <Text style={styles.rockerLabel}>{label}</Text>
      <RockerHalf k={down} icon={downIcon} send={send} enabled={enabled} style={{ borderBottomLeftRadius: 40, borderBottomRightRadius: 40 }} />
    </View>
  );
}

function PillKey(props: { icon: IconName; onPress: () => void; enabled: boolean }) {
  const { icon, onPress, enabled } = props;
  return (
    <Pressable onPress={onPress} disabled={!enabled} style={({ pressed }) => [styles.pillKey, { backgroundColor: pressed ? KEY_PRESSED : 'transparent', opacity: enabled ? 1 : 0.35 }]}>
      <Ionicons name={icon} size={22} color={colors.text} />
    </Pressable>
  );
}

function AppKey(props: { label: string; onPress: () => void; enabled: boolean }) {
  return (
    <Pressable onPress={props.onPress} disabled={!props.enabled} style={({ pressed }) => [styles.appKey, { backgroundColor: pressed ? KEY_PRESSED : KEY_BG, opacity: props.enabled ? 1 : 0.35 }]}>
      <Text style={styles.appKeyText}>{props.label}</Text>
    </Pressable>
  );
}

export default function Remote() {
  const router = useRouter();
  const { width } = useWindowDimensions();
  const { device, driver, state, connected } = useActiveDevice();
  const [result, setResult] = useState<ActionResult | null>(null);

  const send = useCallback<Send>(
    (key) => {
      Haptics.selectionAsync().catch(() => {});
      if (!driver) return;
      driver.sendKey(key).then(setResult);
    },
    [driver],
  );

  if (!device || !driver) {
    return (
      <Screen title="Remote">
        <Text style={styles.dim}>No device selected. Find and connect a TV first.</Text>
        <GradientButton label="Find TVs" icon="wifi" onPress={() => router.push('/discovery')} />
      </Screen>
    );
  }

  const caps = driver.getCapabilities();
  const can = (cap: CapabilityKey) => connected && caps[cap] !== 'unsupported';
  const dpadSize = Math.min(width - 40 - 36, 290) * 0.95;

  const launch = (appId: string) => {
    Haptics.selectionAsync().catch(() => {});
    driver.launchApp(appId).then(setResult);
  };

  return (
    <Screen
      title="Remote"
      subtitle={displayName(device)}
      right={<StatusPill label={connectionLabel[state]} color={connectionColor[state]} />}
    >
      {!connected ? (
        <GradientButton label="Connect first" icon="flash" onPress={() => router.push({ pathname: '/connect', params: { id: device.id } })} small />
      ) : null}

      <View style={styles.body}>
        <View style={styles.topRow}>
          <View style={styles.keyWrap}>
            <Pressable
              disabled={caps.power_off === 'unsupported' && caps.power_on === 'unsupported'}
              onPress={() =>
                Alert.alert('TV power', undefined, [
                  { text: 'Cancel', style: 'cancel' },
                  ...(caps.power_on !== 'unsupported' ? [{ text: 'Turn on', onPress: () => { driver.powerOn().then(setResult); } }] : []),
                  ...(caps.power_off !== 'unsupported' ? [{ text: 'Turn off', style: 'destructive' as const, onPress: () => { driver.powerOff().then(setResult); } }] : []),
                ])
              }
              style={({ pressed }) => [styles.round, { width: 58, height: 58, borderRadius: 29, backgroundColor: pressed ? '#5A2A2E' : '#3A1E24' }]}
            >
              <Ionicons name="power" size={24} color={colors.red} />
            </Pressable>
            <Text style={styles.caption}>Power</Text>
          </View>
          <View style={styles.keyWrap}>
            <Pressable
              onPress={() => router.push('/inputs')}
              style={({ pressed }) => [styles.round, { width: 58, height: 58, borderRadius: 29, backgroundColor: pressed ? KEY_PRESSED : KEY_BG }]}
            >
              <Ionicons name="swap-horizontal" size={24} color={colors.text} />
            </Pressable>
            <Text style={styles.caption}>Input</Text>
          </View>
          <View style={styles.keyWrap}>
            <Pressable
              onPress={() => router.push({ pathname: '/voice', params: { listen: '1' } })}
              style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
            >
              <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={[styles.round, { width: 58, height: 58, borderRadius: 29 }]}>
                <Ionicons name="mic" size={26} color="#fff" />
              </LinearGradient>
            </Pressable>
            <Text style={styles.caption}>Voice</Text>
          </View>
        </View>

        <DPad send={send} enabled={can('navigation')} size={dpadSize} />

        <View style={styles.topRow}>
          <RoundKey k="BACK" icon="arrow-undo" caption="Back" send={send} enabled={can('navigation')} />
          <RoundKey k="HOME" icon="home" caption="Home" send={send} enabled={can('navigation')} />
          <RoundKey k="MENU" icon="menu" caption="Menu" send={send} enabled={can('navigation')} />
        </View>

        <View style={styles.rockerRow}>
          <Rocker label="VOL" up="VOL_UP" down="VOL_DOWN" upIcon="add" downIcon="remove" send={send} enabled={can('volume_step')} />
          <RoundKey k="MUTE" icon="volume-mute" caption="Mute" send={send} enabled={can('mute')} />
          <Rocker label="CH" up="CH_UP" down="CH_DOWN" upIcon="chevron-up" downIcon="chevron-down" send={send} enabled={can('navigation')} />
        </View>

        <View style={styles.playbackRow}>
          <PillKey icon="play-skip-back" onPress={() => send('PREVIOUS')} enabled={can('playback')} />
          <PillKey icon="play" onPress={() => send('PLAY')} enabled={can('playback')} />
          <PillKey icon="pause" onPress={() => send('PAUSE')} enabled={can('playback')} />
          <PillKey icon="stop" onPress={() => send('STOP')} enabled={can('playback')} />
          <PillKey icon="play-skip-forward" onPress={() => send('NEXT')} enabled={can('playback')} />
        </View>

        <View style={styles.appsRow}>
          <AppKey label="YouTube" onPress={() => launch('youtube')} enabled={can('launch_app')} />
          <AppKey label="Netflix" onPress={() => launch('netflix')} enabled={can('launch_app')} />
          <AppKey label="Prime" onPress={() => launch('primevideo')} enabled={can('launch_app')} />
        </View>
      </View>

      {result ? (
        <View style={styles.toast}>
          <View style={[styles.toastDot, { backgroundColor: outcomeColor[result.outcome] }]} />
          <Text style={styles.toastText} numberOfLines={3}>{result.message}</Text>
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  dim: { color: colors.dim, fontSize: 13, lineHeight: 19 },
  body: {
    alignSelf: 'center', width: '100%', maxWidth: 380, backgroundColor: '#13131B', borderRadius: 48, paddingVertical: 22, paddingHorizontal: 18,
    gap: 20, alignItems: 'center', borderWidth: 1, borderColor: colors.border,
  },
  topRow: { flexDirection: 'row', justifyContent: 'space-around', alignSelf: 'stretch', alignItems: 'flex-start' },
  keyWrap: { alignItems: 'center', gap: 6 },
  round: { alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  caption: { color: colors.dim, fontSize: 11, fontWeight: '600', letterSpacing: 0.4 },
  dpad: { backgroundColor: '#1B1B26', borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  zone: { position: 'absolute', alignItems: 'center', justifyContent: 'center' },
  okText: { color: '#fff', fontSize: 22, fontWeight: '800', letterSpacing: 1 },
  rockerRow: { flexDirection: 'row', justifyContent: 'space-around', alignSelf: 'stretch', alignItems: 'center' },
  rocker: { width: 78, height: 170, borderRadius: 40, backgroundColor: KEY_BG, borderWidth: 1, borderColor: colors.border, overflow: 'hidden', alignItems: 'stretch' },
  rockerHalf: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  rockerLabel: { color: colors.dim, fontSize: 11, fontWeight: '700', letterSpacing: 1, textAlign: 'center' },
  playbackRow: { flexDirection: 'row', alignSelf: 'stretch', backgroundColor: KEY_BG, borderRadius: 26, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
  pillKey: { flex: 1, height: 52, alignItems: 'center', justifyContent: 'center' },
  appsRow: { flexDirection: 'row', gap: 10, alignSelf: 'stretch' },
  appKey: { flex: 1, height: 46, borderRadius: 23, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
  appKeyText: { color: colors.text, fontSize: 13, fontWeight: '700' },
  toast: { flexDirection: 'row', gap: 10, alignItems: 'center', backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 12 },
  toastDot: { width: 9, height: 9, borderRadius: 5 },
  toastText: { color: colors.text, fontSize: 13, flex: 1, lineHeight: 18 },
});
