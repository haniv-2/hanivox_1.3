import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import { GradientButton } from '../src/components/GradientButton';
import { ResultBanner } from '../src/components/ResultBanner';
import { Screen } from '../src/components/Screen';
import { StatusPill } from '../src/components/StatusPill';
import type { ActionResult, InputOption } from '../src/drivers/types';
import { useActiveDevice } from '../src/hooks/useActiveDevice';
import { displayName, useHanivox } from '../src/store/useHanivox';
import { colors } from '../src/theme';

export default function Inputs() {
  const router = useRouter();
  const { device, driver, connected } = useActiveDevice();
  const feedback = useHanivox((s) => s.inputFeedback);
  const setFeedback = useHanivox((s) => s.setInputFeedback);

  const [inputs, setInputs] = useState<InputOption[] | null>(null);
  const [result, setResult] = useState<ActionResult | null>(null);
  const [pending, setPending] = useState<string | null>(null); // input waiting for "did it switch?"
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!driver || !connected) { setInputs(null); return; }
    setInputs(await driver.listInputs());
  }, [driver, connected]);

  useEffect(() => { load(); }, [load]);

  if (!device || !driver) {
    return (
      <Screen title="Inputs">
        <Text style={styles.dim}>No device selected. Find and connect a TV first.</Text>
        <GradientButton label="Find TVs" icon="wifi" onPress={() => router.push('/discovery')} />
      </Screen>
    );
  }

  const caps = driver.getCapabilities();
  const guessed = inputs?.some((i) => i.source === 'guess') ?? false;

  async function choose(opt: InputOption) {
    if (!driver || !device) return;
    setBusy(opt.id);
    setResult(null);
    setPending(null);
    const r = await driver.switchInput(opt.id);
    setResult(r);
    setBusy(null);
    if (opt.support === 'unverified' && r.outcome !== 'failed' && r.outcome !== 'unsupported') setPending(opt.id);
  }

  return (
    <Screen title="Inputs" subtitle={displayName(device)}>
      {!connected ? (
        <GradientButton label="Connect first" icon="flash" onPress={() => router.push({ pathname: '/connect', params: { id: device.id } })} />
      ) : null}

      {caps.switch_input === 'unsupported' ? <Text style={styles.dim}>This device cannot switch inputs from here.</Text> : null}
      {connected && inputs === null ? <ActivityIndicator color={colors.purple} /> : null}

      {guessed ? (
        <Text style={styles.dim}>
          This TV does not tell us which inputs it has, so these are standard options we can try. Tap one, then tell Hanivox if the TV really switched. Inputs you mark as not working are never sent again.
        </Text>
      ) : null}

      {inputs?.map((opt) => {
        const fb = feedback[`${device.id}:${opt.id}`];
        return (
          <View key={opt.id} style={styles.row}>
            <View style={styles.flex}>
              <Text style={styles.label}>{opt.label}</Text>
              <View style={{ marginTop: 6 }}>
                {fb === 'works' ? <StatusPill label="Works on this TV" color={colors.green} />
                  : fb === 'broken' ? <StatusPill label="Marked not working" color={colors.red} />
                  : opt.source === 'reported' ? <StatusPill label="Reported by the TV" color={colors.green} />
                  : <StatusPill label="Untested" color={colors.amber} />}
              </View>
              {pending === opt.id ? (
                <View style={styles.ask}>
                  <Text style={styles.dim}>Did the TV switch?</Text>
                  <View style={styles.askBtns}>
                    <View style={styles.flex}><GradientButton label="Yes" small onPress={() => { setFeedback(device.id, opt.id, 'works'); setPending(null); }} /></View>
                    <View style={styles.flex}><GradientButton label="No" small variant="danger" onPress={() => { setFeedback(device.id, opt.id, 'broken'); setPending(null); }} /></View>
                  </View>
                </View>
              ) : null}
            </View>
            <View style={{ width: 110 }}>
              <GradientButton
                label={fb === 'broken' ? 'Retry' : 'Switch'}
                small
                variant={fb === 'broken' ? 'ghost' : 'primary'}
                loading={busy === opt.id}
                disabled={!connected || caps.switch_input === 'unsupported'}
                onPress={() => choose(opt)}
              />
            </View>
          </View>
        );
      })}

      <ResultBanner result={result} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dim: { color: colors.dim, fontSize: 13, lineHeight: 19 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: colors.surface, borderRadius: 20, padding: 16, borderWidth: 1, borderColor: colors.border },
  label: { color: colors.text, fontSize: 16, fontWeight: '700' },
  ask: { marginTop: 10, gap: 8 },
  askBtns: { flexDirection: 'row', gap: 8 },
});
