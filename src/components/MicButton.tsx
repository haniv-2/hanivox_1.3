import { useEffect, useRef } from 'react';
import { Animated, Easing, Pressable, StyleSheet, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { colors, gradient } from '../theme';

export type MicState = 'idle' | 'listening' | 'processing';

interface Props {
  state?: MicState;
  size?: number;
  onPress?: () => void;
}

export function MicButton({ state = 'idle', size = 120, onPress }: Props) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const duration = state === 'listening' ? 900 : 2000;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [state, pulse]);

  const maxScale = state === 'listening' ? 1.7 : 1.3;
  const ring1Scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, maxScale] });
  const ring1Opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] });
  const ring2Scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, maxScale * 0.85] });
  const ring2Opacity = pulse.interpolate({ inputRange: [0, 1], outputRange: [0.3, 0] });
  const box = size * 2;

  return (
    <View style={{ width: box, height: box, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={[styles.ring, { width: size, height: size, borderRadius: size / 2, transform: [{ scale: ring1Scale }], opacity: ring1Opacity }]}
      />
      <Animated.View
        style={[styles.ring, { width: size, height: size, borderRadius: size / 2, transform: [{ scale: ring2Scale }], opacity: ring2Opacity, backgroundColor: colors.blue }]}
      />
      <Pressable
        onPress={() => {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
          onPress?.();
        }}
        accessibilityRole="button"
        accessibilityLabel="Microphone"
      >
        <LinearGradient
          colors={gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={{ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center' }}
        >
          <Ionicons name={state === 'processing' ? 'ellipsis-horizontal' : 'mic'} size={size * 0.42} color="#fff" />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  ring: { position: 'absolute', backgroundColor: colors.purple },
});
