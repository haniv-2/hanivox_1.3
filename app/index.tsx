import { useMemo } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import type { ComponentProps } from 'react';
import { DemoBanner } from '../src/components/DemoBanner';
import { DeviceCard } from '../src/components/DeviceCard';
import { GradientButton } from '../src/components/GradientButton';
import { MicButton } from '../src/components/MicButton';
import { Screen } from '../src/components/Screen';
import { useActiveDevice } from '../src/hooks/useActiveDevice';
import { useHanivox } from '../src/store/useHanivox';
import { colors } from '../src/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

const TILES: { label: string; icon: IconName; path: string }[] = [
  { label: 'Remote', icon: 'game-controller-outline', path: '/remote' },
  { label: 'Inputs', icon: 'swap-horizontal', path: '/inputs' },
  { label: 'My devices', icon: 'albums-outline', path: '/devices' },
  { label: 'Find TVs', icon: 'wifi', path: '/discovery' },
];

export default function Home() {
  const router = useRouter();
  const { device, state } = useActiveDevice();
  const saved = useHanivox((s) => s.saved);
  const activeId = useHanivox((s) => s.activeId);
  const connection = useHanivox((s) => s.connection);

  const recents = useMemo(
    () =>
      saved
        .filter((d) => d.id !== activeId)
        .sort((a, b) => (b.lastConnectedAt ?? 0) - (a.lastConnectedAt ?? 0))
        .slice(0, 3),
    [saved, activeId],
  );

  return (
    <Screen back={false}>
      <View style={styles.hero}>
        <Text style={styles.brand}>Hanivox</Text>
        <Text style={styles.welcome}>Welcome back. What should the TV do?</Text>
      </View>

      {device ? (
        <DeviceCard device={device} state={state} active onPress={() => router.push({ pathname: '/connect', params: { id: device.id } })} />
      ) : (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>No device selected</Text>
          <Text style={styles.emptyText}>Find a TV on your Wi-Fi to get started.</Text>
          <GradientButton label="Find TVs" icon="wifi" onPress={() => router.push('/discovery')} small />
        </View>
      )}

      <View style={styles.micWrap}>
        <MicButton size={110} onPress={() => router.push({ pathname: '/voice', params: { listen: '1' } })} />
        <Text style={styles.micHint}>Tap to talk</Text>
      </View>

      <View style={styles.tiles}>
        {TILES.map((t) => (
          <Pressable key={t.label} style={styles.tile} onPress={() => router.push(t.path as never)}>
            <Ionicons name={t.icon} size={24} color={colors.purple} />
            <Text style={styles.tileText}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {recents.length > 0 ? (
        <View style={{ gap: 10 }}>
          <Text style={styles.section}>Recently used</Text>
          {recents.map((d) => (
            <DeviceCard key={d.id} device={d} state={connection[d.id] ?? 'disconnected'} onPress={() => router.push({ pathname: '/connect', params: { id: d.id } })} />
          ))}
        </View>
      ) : null}

      {!device || device.kind === 'mock' ? <DemoBanner /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { paddingTop: 8, gap: 6 },
  brand: { color: colors.text, fontSize: 34, fontWeight: '800', letterSpacing: 0.5 },
  welcome: { color: colors.dim, fontSize: 15 },
  empty: { backgroundColor: colors.surface, borderRadius: 22, padding: 18, gap: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'flex-start' },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  emptyText: { color: colors.dim, fontSize: 14 },
  micWrap: { alignItems: 'center', marginVertical: -10 },
  micHint: { color: colors.dim, fontSize: 13, marginTop: -40, marginBottom: 20 },
  tiles: { flexDirection: 'row', gap: 10 },
  tile: { flex: 1, backgroundColor: colors.surface, borderRadius: 18, paddingVertical: 16, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.border },
  tileText: { color: colors.text, fontSize: 12, fontWeight: '600' },
  section: { color: colors.dim, fontSize: 13, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
});
