import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, View } from 'react-native';
import { useRouter } from 'expo-router';
import { DeviceCard } from '../src/components/DeviceCard';
import { GradientButton } from '../src/components/GradientButton';
import { Screen } from '../src/components/Screen';
import { getDriver } from '../src/drivers';
import { normalizeMac } from '../src/drivers/power';
import { useHanivox } from '../src/store/useHanivox';
import { colors } from '../src/theme';

type Editing = { id: string; field: 'name' | 'mac' } | null;

export default function Devices() {
  const router = useRouter();
  const saved = useHanivox((s) => s.saved);
  const activeId = useHanivox((s) => s.activeId);
  const connection = useHanivox((s) => s.connection);
  const { setActive, renameDevice, setMac, forgetDevice, connect, disconnect } = useHanivox();
  const [editing, setEditing] = useState<Editing>(null);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState('');

  function startEdit(id: string, field: 'name' | 'mac', value: string) {
    setDraft(value);
    setError('');
    setEditing({ id, field });
  }

  function saveEdit() {
    if (!editing) return;
    if (editing.field === 'name') {
      renameDevice(editing.id, draft);
    } else {
      const trimmed = draft.trim();
      if (trimmed === '') setMac(editing.id, '');
      else {
        const mac = normalizeMac(trimmed);
        if (!mac) {
          setError('That is not a valid MAC address. It looks like AA:BB:CC:DD:EE:FF.');
          return;
        }
        setMac(editing.id, mac);
      }
    }
    setEditing(null);
  }

  return (
    <Screen title="My devices" subtitle="Saved TVs and devices">
      {saved.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing saved yet</Text>
          <Text style={styles.dim}>Find a TV, connect it and tap Save device.</Text>
          <GradientButton label="Find TVs" icon="wifi" onPress={() => router.push('/discovery')} small />
        </View>
      ) : null}

      {saved.map((d) => {
        const state = connection[d.id] ?? 'disconnected';
        const needsPairing = getDriver(d).requiresPairing && !d.paired;
        const isEditing = editing?.id === d.id;
        return (
          <DeviceCard key={d.id} device={d} state={state} active={d.id === activeId}>
            {isEditing && editing ? (
              <View style={{ gap: 8 }}>
                <Text style={styles.dim}>
                  {editing.field === 'name'
                    ? 'Give this TV a name you will recognise.'
                    : 'Needed to turn the TV on from standby. Find it in the TV settings under Network. Also switch on "Wake on LAN / Wi-Fi" there if it exists. Leave empty to remove it.'}
                </Text>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder={editing.field === 'name' ? 'Custom name' : 'AA:BB:CC:DD:EE:FF'}
                  placeholderTextColor={colors.dim}
                  autoCapitalize={editing.field === 'mac' ? 'characters' : 'sentences'}
                  autoCorrect={false}
                  style={styles.input}
                  autoFocus
                />
                {error ? <Text style={styles.error}>{error}</Text> : null}
                <View style={styles.actions}>
                  <View style={styles.flex}><GradientButton label="Save" small onPress={saveEdit} /></View>
                  <View style={styles.flex}><GradientButton label="Cancel" small variant="ghost" onPress={() => setEditing(null)} /></View>
                </View>
              </View>
            ) : (
              <>
                {d.mac ? <Text style={styles.dim}>Wake address: {d.mac}</Text> : null}
                <View style={styles.actions}>
                  {d.id !== activeId ? <View style={styles.flex}><GradientButton label="Use" small variant="ghost" onPress={() => setActive(d.id)} /></View> : null}
                  <View style={styles.flex}>
                    {state === 'connected' ? (
                      <GradientButton label="Disconnect" small variant="ghost" onPress={() => disconnect(d.id)} />
                    ) : (
                      <GradientButton label="Connect" small loading={state === 'connecting'} onPress={() => connect(d.id)} disabled={needsPairing} />
                    )}
                  </View>
                  <View style={styles.flex}><GradientButton label="Rename" small variant="ghost" onPress={() => startEdit(d.id, 'name', d.customName ?? d.name)} /></View>
                  {d.kind !== 'mock' ? (
                    <View style={styles.flex}><GradientButton label="Wake address" small variant="ghost" onPress={() => startEdit(d.id, 'mac', d.mac ?? '')} /></View>
                  ) : null}
                  <View style={styles.flex}>
                    <GradientButton
                      label="Forget"
                      small
                      variant="danger"
                      onPress={() =>
                        Alert.alert('Forget device?', 'You will need to pair it again.', [
                          { text: 'Cancel', style: 'cancel' },
                          { text: 'Forget', style: 'destructive', onPress: () => forgetDevice(d.id) },
                        ])
                      }
                    />
                  </View>
                </View>
              </>
            )}
            {needsPairing ? <Text style={styles.dim}>Not paired yet. Open it from Find TVs to pair.</Text> : null}
          </DeviceCard>
        );
      })}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flexGrow: 1, flexBasis: '45%' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  dim: { color: colors.dim, fontSize: 13, lineHeight: 19 },
  error: { color: colors.red, fontSize: 13, lineHeight: 19 },
  empty: { backgroundColor: colors.surface, borderRadius: 22, padding: 18, gap: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'flex-start' },
  emptyTitle: { color: colors.text, fontSize: 17, fontWeight: '700' },
  input: { backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: 16, paddingHorizontal: 14, paddingVertical: 10 },
});
