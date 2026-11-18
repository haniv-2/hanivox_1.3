import { StyleSheet, Text, View } from 'react-native';
import { colors } from '../theme';

export function DemoBanner() {
  return (
    <View style={styles.box}>
      <Text style={styles.title}>Simulator mode</Text>
      <Text style={styles.text}>
        These devices are simulated. Nothing here controls a real TV yet. Real Google TV control is the next stage.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { borderWidth: 1, borderColor: colors.amber + '55', backgroundColor: colors.amber + '14', borderRadius: 16, padding: 14, gap: 4 },
  title: { color: colors.amber, fontWeight: '700', fontSize: 13, letterSpacing: 0.5, textTransform: 'uppercase' },
  text: { color: colors.text, fontSize: 13, lineHeight: 19 },
});
