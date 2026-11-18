import type { ComponentProps } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { colors, gradient } from '../theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

interface Props {
  label: string;
  onPress: () => void;
  icon?: IconName;
  variant?: 'primary' | 'ghost' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  small?: boolean;
}

export function GradientButton({ label, onPress, icon, variant = 'primary', disabled, loading, small }: Props) {
  const pad = small ? 10 : 15;
  const tint = variant === 'danger' ? colors.red : '#fff';

  const inner = (
    <>
      {loading ? <ActivityIndicator color={tint} size="small" /> : icon ? <Ionicons name={icon} size={18} color={tint} /> : null}
      <Text style={[styles.label, { color: tint, fontSize: small ? 14 : 16 }]}>{label}</Text>
    </>
  );

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => ({ opacity: disabled ? 0.4 : pressed ? 0.8 : 1 })}
    >
      {variant === 'primary' ? (
        <LinearGradient colors={gradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 0 }} style={[styles.base, { paddingVertical: pad }]}>
          {inner}
        </LinearGradient>
      ) : (
        <View
          style={[
            styles.base,
            {
              paddingVertical: pad,
              backgroundColor: colors.surface2,
              borderWidth: 1,
              borderColor: variant === 'danger' ? colors.red + '66' : colors.border,
            },
          ]}
        >
          {inner}
        </View>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: 16, paddingHorizontal: 18 },
  label: { fontWeight: '600' },
});
