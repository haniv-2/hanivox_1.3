import type { ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { colors } from '../theme';

interface Props {
  title?: string;
  subtitle?: string;
  back?: boolean;
  scroll?: boolean;
  right?: ReactNode;
  children: ReactNode;
}

export function Screen({ title, subtitle, back = true, scroll = true, right, children }: Props) {
  const router = useRouter();
  return (
    <View style={styles.root}>
      <LinearGradient colors={['#0D0D18', '#07070B']} style={StyleSheet.absoluteFill} />
      <View pointerEvents="none" style={styles.glow} />
      <SafeAreaView style={styles.flex} edges={['top', 'bottom']}>
        {title ? (
          <View style={styles.header}>
            {back ? (
              <Pressable onPress={() => router.back()} style={styles.backBtn} hitSlop={10}>
                <Ionicons name="chevron-back" size={22} color={colors.text} />
              </Pressable>
            ) : null}
            <View style={styles.flex}>
              <Text style={styles.title}>{title}</Text>
              {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
            </View>
            {right}
          </View>
        ) : null}
        {scroll ? (
          <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
            {children}
          </ScrollView>
        ) : (
          <View style={[styles.content, styles.flex]}>{children}</View>
        )}
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  glow: {
    position: 'absolute', top: -140, alignSelf: 'center', width: 380, height: 380, borderRadius: 190,
    backgroundColor: colors.purple, opacity: 0.1,
  },
  header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 12, gap: 12 },
  backBtn: {
    width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, alignItems: 'center',
    justifyContent: 'center', borderWidth: 1, borderColor: colors.border,
  },
  title: { color: colors.text, fontSize: 24, fontWeight: '700', letterSpacing: 0.2 },
  subtitle: { color: colors.dim, fontSize: 13, marginTop: 2 },
  content: { paddingHorizontal: 20, paddingBottom: 32, gap: 14 },
});
