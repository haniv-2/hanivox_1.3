import { StyleSheet, Text, View } from 'react-native';
import type { ActionResult } from '../drivers/types';
import { colors, outcomeColor, outcomeLabel } from '../theme';

export function ResultBanner({ result }: { result: ActionResult | null }) {
  if (!result) return null;
  const color = outcomeColor[result.outcome];
  return (
    <View style={[styles.box, { borderColor: color + '55', backgroundColor: color + '14' }]}>
      <Text style={[styles.tag, { color }]}>{outcomeLabel[result.outcome]}</Text>
      <Text style={styles.msg}>{result.message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderRadius: 16, padding: 14, gap: 4 },
  tag: { fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  msg: { color: colors.text, fontSize: 14, lineHeight: 20 },
});
