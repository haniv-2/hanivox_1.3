import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { DeviceCard } from '../src/components/DeviceCard';
import { GradientButton } from '../src/components/GradientButton';
import { ResultBanner } from '../src/components/ResultBanner';
import { Screen } from '../src/components/Screen';
import { getDriver } from '../src/drivers';
import type { ActionResult, DeviceInfo } from '../src/drivers/types';
import { useHanivox } from '../src/store/useHanivox';
import { colors } from '../src/theme';

export default function Connect() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const deviceId = String(id ?? '');
  const saved = useHanivox((s) => s.saved);
  const discovered = useHanivox((s) => s.discovered);
  const connection = useHanivox((s) => s.connection);
  const { saveDevice, forgetDevice, pair, connect, disconnect, setActive } = useHanivox();

  const device: (DeviceInfo & { customName?: string; paired?: boolean }) | undefined =
    saved.find((d) => d.id === deviceId) ?? discovered.find((d) => d.id === deviceId);
  const isSaved = saved.some((d) => d.id === deviceId);
  const paired = saved.find((d) => d.id === deviceId)?.paired ?? false;

  const [code, setCode] = useState('');
  const [awaitingCode, setAwaitingCode] = useState(false);
  const [repair, setRepair] = useState(false);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [busy, setBusy] = useState(false);

  if (!device) {
    return (
      <Screen title="Device">
        <Text style={styles.text}>This device is no longer in the list. Search again from the Find devices screen.</Text>
      </Screen>
    );
  }

  const state = connection[device.id] ?? 'disconnected';
  const driver = getDriver(device);
  const needsPairing = driver.requiresPairing && (!paired || repair);

  async function run(fn: () => Promise<ActionResult | void>) {
    setBusy(true);
    setResult(null);
    try {
      const r = await fn();
      if (r) setResult(r);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Screen title="Connect" subtitle="Pair, connect and save this device">
      <DeviceCard device={device} state={state} />

      {needsPairing ? (
        <View style={styles.box}>
          <Text style={styles.boxTitle}>Pair with the TV</Text>
          {!awaitingCode ? (
            <>
              <Text style={styles.text}>Switch the TV on, then tap the button. The TV will show a 6-character code on screen.</Text>
              <GradientButton
                label="Show code on TV"
                icon="tv-outline"
                loading={busy}
                onPress={() =>
                  run(async () => {
                    const r = await driver.beginPairing();
                    if (r.outcome === 'confirmed') setAwaitingCode(true);
                    return r;
                  })
                }
              />
            </>
          ) : (
            <>
              <Text style={styles.text}>Type the code that the TV is showing.</Text>
              <TextInput
                value={code}
                onChangeText={setCode}
                placeholder="Code from the TV"
                placeholderTextColor={colors.dim}
                autoCapitalize="characters"
                autoCorrect={false}
                maxLength={8}
                style={styles.input}
              />
              <GradientButton
                label="Pair"
                icon="link"
                loading={busy}
                disabled={code.trim().length === 0}
                onPress={() =>
                  run(async () => {
                    const r = await pair(device.id, code);
                    if (r.outcome === 'confirmed') {
                      setAwaitingCode(false);
                      setRepair(false);
                      setCode('');
                    }
                    return r;
                  })
                }
              />
            </>
          )}
        </View>
      ) : null}

      {(device.kind === 'webos' || device.kind === 'tizen') && state !== 'connected' ? (
        <View style={styles.box}>
          <Text style={styles.boxTitle}>First time?</Text>
          <Text style={styles.text}>
            {device.kind === 'webos'
              ? "Your LG TV will show a message asking to allow Hanivox. Press Yes with the TV's own remote within 45 seconds."
              : "Your Samsung TV will show an Allow / Deny message. Choose Allow with the TV's own remote within 30 seconds."}
          </Text>
        </View>
      ) : null}

      {!needsPairing && state !== 'connected' ? (
        <GradientButton label="Connect" icon="flash" loading={busy || state === 'connecting'} onPress={() => run(() => connect(device.id))} />
      ) : null}

      {state === 'connected' ? (
        <>
          <GradientButton label="Open remote" icon="game-controller-outline" onPress={() => router.push('/remote')} />
          <GradientButton label="Disconnect" icon="power" variant="ghost" loading={busy} onPress={() => run(() => disconnect(device.id))} />
        </>
      ) : null}

      <ResultBanner result={result} />

      {state === 'error' && paired && !repair ? (
        <GradientButton label="Pair this TV again" icon="link" variant="ghost" onPress={() => { setRepair(true); setAwaitingCode(false); }} />
      ) : null}

      {!isSaved ? (
        <GradientButton label="Save device" icon="bookmark-outline" variant="ghost" onPress={() => saveDevice(device)} />
      ) : (
        <>
          <GradientButton label="Use as active device" icon="checkmark-circle-outline" variant="ghost" onPress={() => setActive(device.id)} />
          <GradientButton
            label="Forget this device"
            icon="trash-outline"
            variant="danger"
            onPress={() =>
              Alert.alert('Forget device?', 'You will need to pair it again.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Forget', style: 'destructive', onPress: async () => { await forgetDevice(device.id); router.back(); } },
              ])
            }
          />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  text: { color: colors.dim, fontSize: 14, lineHeight: 20 },
  box: { backgroundColor: colors.surface, borderRadius: 22, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.border },
  boxTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  input: {
    backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border,
    color: colors.text, fontSize: 20, letterSpacing: 4, paddingHorizontal: 16, paddingVertical: 12, textAlign: 'center',
  },
});
