import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { DemoBanner } from '../src/components/DemoBanner';
import { DeviceCard } from '../src/components/DeviceCard';
import { GradientButton } from '../src/components/GradientButton';
import { Screen } from '../src/components/Screen';
import { DEMO_DEVICES, detectAt, deviceFromHost, isValidIPv4 } from '../src/discovery';
import { realDeps } from '../src/drivers/realDeps';
import { useHanivox } from '../src/store/useHanivox';
import { colors } from '../src/theme';

export default function Discovery() {
  const router = useRouter();
  const discovered = useHanivox((s) => s.discovered);
  const scanning = useHanivox((s) => s.scanning);
  const scanError = useHanivox((s) => s.scanError);
  const connection = useHanivox((s) => s.connection);
  const scan = useHanivox((s) => s.scan);
  const addDiscovered = useHanivox((s) => s.addDiscovered);
  const [ip, setIp] = useState('');
  const [ipError, setIpError] = useState('');
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    scan();
  }, [scan]);

  const hasDemo = discovered.some((d) => d.kind === 'mock');

  async function addByIp() {
    const host = ip.trim();
    if (!isValidIPv4(host)) {
      setIpError('Enter the TV address like 192.168.1.25');
      return;
    }
    setIpError('');
    setChecking(true);
    try {
      const found = await detectAt(realDeps, host);
      if (!found) {
        setIpError('No supported TV answered at that address. Check the address, and that the TV is switched on and on the same Wi-Fi.');
        return;
      }
      const device = deviceFromHost(host, found.name, found.kind, {
        model: found.model,
        mac: found.mac,
        manufacturer: found.kind === 'tizen' ? 'Samsung' : found.kind === 'webos' ? 'LG' : undefined,
      });
      addDiscovered(device);
      setIp('');
      router.push({ pathname: '/connect', params: { id: device.id } });
    } finally {
      setChecking(false);
    }
  }

  return (
    <Screen title="Find devices" subtitle="Google TV, LG and Samsung TVs on your Wi-Fi">
      <View style={styles.status}>
        {scanning ? <ActivityIndicator color={colors.purple} /> : null}
        <Text style={styles.statusText}>
          {scanning ? 'Searching… (about 6 seconds)' : discovered.length ? `${discovered.length} device(s) found` : 'No TVs found'}
        </Text>
      </View>

      {scanError ? <Text style={styles.error}>Search problem: {scanError}</Text> : null}

      {discovered.map((d) => (
        <DeviceCard
          key={d.id}
          device={d}
          state={connection[d.id] ?? 'disconnected'}
          onPress={() => router.push({ pathname: '/connect', params: { id: d.id } })}
        />
      ))}

      {!scanning && discovered.filter((d) => d.kind !== 'mock').length === 0 ? (
        <Text style={styles.hint}>
          Make sure the phone and TV are on the same Wi-Fi and the TV is switched on. If nothing shows up, add the TV by its address below (TV Settings → Network shows it).
        </Text>
      ) : null}

      <GradientButton label="Search again" icon="refresh" variant="ghost" onPress={scan} disabled={scanning} />

      <View style={styles.box}>
        <Text style={styles.boxTitle}>Add by address</Text>
        <TextInput
          value={ip}
          onChangeText={setIp}
          placeholder="192.168.1.25"
          placeholderTextColor={colors.dim}
          keyboardType="numbers-and-punctuation"
          autoCorrect={false}
          style={styles.input}
        />
        {ipError ? <Text style={styles.error}>{ipError}</Text> : null}
        <GradientButton label="Add TV" icon="add" onPress={addByIp} disabled={!ip.trim()} loading={checking} small />
      </View>

      {!hasDemo ? (
        <GradientButton label="Show simulated TVs (for testing)" variant="ghost" small onPress={() => DEMO_DEVICES.forEach(addDiscovered)} />
      ) : (
        <DemoBanner />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusText: { color: colors.dim, fontSize: 14 },
  hint: { color: colors.dim, fontSize: 13, lineHeight: 19 },
  error: { color: colors.red, fontSize: 13, lineHeight: 19 },
  box: { backgroundColor: colors.surface, borderRadius: 22, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.border },
  boxTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  input: { backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: 16, paddingHorizontal: 14, paddingVertical: 10 },
});
