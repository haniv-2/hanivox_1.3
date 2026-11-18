import type { ReactNode } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { KIND_LABEL } from '../drivers/types';
import type { ConnectionState, DeviceInfo } from '../drivers/types';
import { colors, connectionColor, connectionLabel, gradient } from '../theme';
import { StatusPill } from './StatusPill';

interface Props {
  device: DeviceInfo & { customName?: string };
  state?: ConnectionState;
  active?: boolean;
  onPress?: () => void;
  children?: ReactNode;
}

export function DeviceCard({ device, state = 'disconnected', active, onPress, children }: Props) {
  const title = device.customName || device.name;
  const details = [device.manufacturer, device.model].filter(Boolean).join(' · ');
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={({ pressed }) => ({ opacity: pressed ? 0.85 : 1 })}>
      <View style={[styles.card, active && { borderColor: colors.purple + 'AA' }]}>
        <View style={styles.row}>
          <LinearGradient colors={gradient} style={styles.icon}>
            <Ionicons name="tv-outline" size={22} color="#fff" />
          </LinearGradient>
          <View style={styles.info}>
            <Text style={styles.title} numberOfLines={1}>{title}</Text>
            <Text style={styles.sub} numberOfLines={1}>{KIND_LABEL[device.kind]}{details ? ` · ${details}` : ''}</Text>
            <Text style={styles.host}>{device.host}</Text>
          </View>
          {onPress ? <Ionicons name="chevron-forward" size={18} color={colors.dim} /> : null}
        </View>
        <View style={styles.pills}>
          <StatusPill label={connectionLabel[state]} color={connectionColor[state]} />
          {active ? <StatusPill label="Active" color={colors.purple} /> : null}
        </View>
        {children}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 22, padding: 16, gap: 12, borderWidth: 1, borderColor: colors.border },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  icon: { width: 46, height: 46, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  info: { flex: 1, gap: 2 },
  title: { color: colors.text, fontSize: 17, fontWeight: '700' },
  sub: { color: colors.dim, fontSize: 13 },
  host: { color: colors.dim, fontSize: 12, opacity: 0.7 },
  pills: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
});
