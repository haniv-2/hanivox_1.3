import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import { runIntent } from '../src/core/commands';
import { GradientButton } from '../src/components/GradientButton';
import { MicButton } from '../src/components/MicButton';
import type { MicState } from '../src/components/MicButton';
import { ResultBanner } from '../src/components/ResultBanner';
import { Screen } from '../src/components/Screen';
import { StatusPill } from '../src/components/StatusPill';
import type { ActionResult } from '../src/drivers/types';
import { useActiveDevice } from '../src/hooks/useActiveDevice';
import { displayName, useHanivox } from '../src/store/useHanivox';
import { colors, connectionColor, connectionLabel } from '../src/theme';
import { parseCommand } from '../src/voice/intents';
import { prepareWakeWord } from '../src/voice/wake';
import { getSpeechSupport, useSpeech } from '../src/voice/useSpeech';
import type { SpeechSupport } from '../src/voice/useSpeech';

const SUGGESTIONS = ['Open YouTube', 'Increase volume', 'Mute the TV', 'Go to HDMI 1', 'Switch to AV', 'Go to TV channels', 'Close YouTube', 'Turn off the TV'];

const LANGS = [
  { code: 'en-US', label: 'English (US)' },
  { code: 'en-GB', label: 'English (UK)' },
  { code: 'en-IN', label: 'English (India)' },
];

export default function Voice() {
  const { listen } = useLocalSearchParams<{ listen?: string }>();
  const { device, driver, state } = useActiveDevice();
  const saved = useHanivox((s) => s.saved);
  const feedback = useHanivox((s) => s.inputFeedback);
  const settings = useHanivox((s) => s.settings);
  const setActive = useHanivox((s) => s.setActive);
  const updateSettings = useHanivox((s) => s.updateSettings);
  const wake = useHanivox((s) => s.wake);
  const wakeSignal = useHanivox((s) => s.wakeSignal);
  const setVoiceBusy = useHanivox((s) => s.setVoiceBusy);
  const pauseWake = useHanivox((s) => s.pauseWake);

  const [running, setRunning] = useState(false);
  const [heard, setHeard] = useState('');
  const [typed, setTyped] = useState('');
  const [result, setResult] = useState<ActionResult | null>(null);
  const [support, setSupport] = useState<SpeechSupport | null>(null);

  useEffect(() => {
    getSpeechSupport().then(setSupport);
  }, []);

  const execute = useCallback(
    async (text: string) => {
      const phrase = text.trim();
      if (!phrase) return;
      setHeard(phrase);
      setResult(null);
      if (!device || !driver) {
        setResult({ outcome: 'failed', message: 'No device selected. Pick one above or find a TV first.' });
        return;
      }
      const intent = parseCommand(phrase);
      if (state !== 'connected' && intent.type !== 'power_on') {
        setResult({ outcome: 'failed', message: `${displayName(device)} is not connected. Connect it first.` });
        return;
      }
      setRunning(true);
      try {
        setResult(await runIntent(driver, intent, { deviceId: device.id, feedback }));
      } catch (e) {
        setResult({ outcome: 'failed', message: e instanceof Error ? e.message : 'Something went wrong.' });
      } finally {
        setRunning(false);
      }
    },
    [device, driver, state, feedback],
  );

  const speech = useSpeech(execute, (message) => setResult({ outcome: 'failed', message }));

  const beginListening = useCallback(() => {
    setResult(null);
    setHeard('');
    if (!device || !driver) {
      setResult({ outcome: 'failed', message: 'No device selected. Pick one above or find a TV first.' });
      pauseWake(false);
      return;
    }
    speech.start(settings.speechLang, settings.allowOnlineSpeech);
  }, [device, driver, settings.speechLang, settings.allowOnlineSpeech, speech, pauseWake]);

  const autoStarted = useRef(false);
  useEffect(() => {
    if (listen === '1' && !autoStarted.current) {
      autoStarted.current = true;
      beginListening();
    }
  }, [listen, beginListening]);


  // Tell the "Hey Vox" listener when the microphone is in use, and react when it hears the phrase.
  const busy = speech.phase !== 'idle' || running;
  useEffect(() => {
    setVoiceBusy(busy);
  }, [busy, setVoiceBusy]);
  useEffect(
    () => () => {
      setVoiceBusy(false);
      pauseWake(false);
    },
    [setVoiceBusy, pauseWake],
  );
  const wasBusy = useRef(false);
  useEffect(() => {
    if (wasBusy.current && !busy) pauseWake(false);
    wasBusy.current = busy;
  }, [busy, pauseWake]);
  const lastSignal = useRef(wakeSignal);
  useEffect(() => {
    if (wakeSignal !== lastSignal.current) {
      lastSignal.current = wakeSignal;
      beginListening();
    }
  }, [wakeSignal, beginListening]);

  const toggleWake = (on: boolean) => {
    if (!on) {
      updateSettings({ wakeWord: false });
      return;
    }
    Alert.alert(
      'Turn on "Hey Vox"?',
      'The microphone will stay open while Hanivox is on screen. The wake phrase is detected on the phone itself, so that audio is not sent anywhere. It uses more battery.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Turn on',
          onPress: async () => {
            const error = await prepareWakeWord();
            if (error) setResult({ outcome: 'failed', message: error });
            else updateSettings({ wakeWord: true });
          },
        },
      ],
    );
  };
  const wakeText =
    wake.state === 'off' ? 'Off.'
    : wake.state === 'downloading' ? `Downloading the offline model… ${wake.percent}%`
    : wake.state === 'needs-model' ? 'The offline model is not installed. Switch this off and on again to download it.'
    : wake.state === 'listening' ? 'Listening for "Hey Vox"…'
    : wake.state === 'error' ? wake.error ?? 'Something went wrong.'
    : 'Paused: the app is not on screen, or a command is running.';

  const micState: MicState = speech.phase === 'listening' ? 'listening' : speech.phase === 'idle' && !running ? 'idle' : 'processing';
  const label =
    speech.phase === 'starting' ? 'Starting…'
    : speech.phase === 'listening' ? 'Listening… speak now (tap to finish)'
    : speech.phase === 'processing' || running ? 'Working…'
    : 'Tap the mic and say a command';

  const shownText = speech.phase !== 'idle' && speech.partial ? speech.partial : heard;

  return (
    <Screen title="Voice" subtitle="Say what the TV should do">
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {saved.length === 0 ? <Text style={styles.dim}>No saved devices yet.</Text> : null}
        {saved.map((d) => (
          <Pressable key={d.id} onPress={() => setActive(d.id)} style={[styles.chip, d.id === device?.id && styles.chipActive]}>
            <Text style={styles.chipText}>{displayName(d)}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {device ? <StatusPill label={connectionLabel[state]} color={connectionColor[state]} /> : null}

      <View style={styles.micWrap}>
        <MicButton
          state={micState}
          size={130}
          onPress={() => {
            if (speech.phase === 'listening') speech.stop();
            else if (speech.phase === 'idle' && !running) beginListening();
          }}
        />
      </View>
      <Text style={[styles.status, speech.phase === 'listening' && { color: colors.green }]}>{label}</Text>

      <View style={styles.heardBox}>
        <Text style={styles.label}>Recognized command</Text>
        <Text style={styles.heard}>{shownText || '—'}</Text>
      </View>
      <ResultBanner result={result} />

      <Text style={styles.label}>Or type it</Text>
      <TextInput
        value={typed}
        onChangeText={setTyped}
        placeholder="Type a command"
        placeholderTextColor={colors.dim}
        style={styles.input}
        returnKeyType="send"
        onSubmitEditing={() => { execute(typed); setTyped(''); }}
      />
      <GradientButton label="Run command" icon="send" disabled={!typed.trim()} onPress={() => { execute(typed); setTyped(''); }} />

      <Text style={styles.label}>Try saying</Text>
      <View style={styles.suggestions}>
        {SUGGESTIONS.map((s) => (
          <Pressable key={s} style={styles.suggestion} onPress={() => execute(s)}>
            <Text style={styles.suggestionText}>{s}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Speech and privacy</Text>
        <Text style={styles.dim}>
          Hanivox listens only after you tap the mic, for one command, then stops. Nothing is recorded in the background.
        </Text>
        <Text style={styles.dim}>
          {support === null ? 'Checking this phone…'
            : support.onDevice ? 'This phone can recognise speech on the device itself. Your voice stays on the phone.'
            : support.system ? 'This phone cannot recognise speech on the device itself. Online recognition is the only option.'
            : 'No speech recognition service was found on this phone.'}
        </Text>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitle}>Allow online recognition</Text>
            <Text style={styles.dim}>
              {support?.onDevice
                ? 'Not needed on this phone. Off keeps your voice on the device.'
                : 'Needed on this phone. Your voice is sent to Google to turn it into text.'}
            </Text>
          </View>
          <Switch
            value={settings.allowOnlineSpeech}
            onValueChange={(v) => updateSettings({ allowOnlineSpeech: v })}
            trackColor={{ true: colors.purple, false: colors.border }}
          />
        </View>
        <Text style={styles.label}>Speech language</Text>
        <View style={styles.suggestions}>
          {LANGS.map((l) => (
            <Pressable key={l.code} onPress={() => updateSettings({ speechLang: l.code })} style={[styles.chip, settings.speechLang === l.code && styles.chipActive]}>
              <Text style={styles.chipText}>{l.label}</Text>
            </Pressable>
          ))}
        </View>
      </View>


      <View style={styles.card}>
        <Text style={styles.cardTitle}>Hands-free: say "Hey Vox"</Text>
        <Text style={styles.dim}>
          Instead of tapping the mic, say "Hey Vox", wait for the buzz, then say your command. It works while Hanivox is open on screen, not in the background or with the screen off.
        </Text>
        <Text style={styles.dim}>
          While this is on, the microphone stays open. "Hey Vox" is detected by a small model on the phone itself (a one-time download of about 40 MB), so that audio never leaves the phone. After "Hey Vox", your command is recognised as set above. It uses more battery, and may sometimes react to similar words like "hey box" or "hey fox".
        </Text>
        <View style={styles.switchRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.switchTitle}>Hey Vox</Text>
            <Text style={[styles.dim, wake.state === 'listening' && { color: colors.green }, wake.state === 'error' && { color: colors.red }]}>{wakeText}</Text>
          </View>
          <Switch
            value={settings.wakeWord}
            onValueChange={toggleWake}
            disabled={wake.state === 'downloading'}
            trackColor={{ true: colors.purple, false: colors.border }}
          />
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  dim: { color: colors.dim, fontSize: 13, lineHeight: 19 },
  chips: { gap: 8 },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
  chipActive: { borderColor: colors.purple, backgroundColor: colors.purple + '26' },
  chipText: { color: colors.text, fontSize: 13, fontWeight: '600' },
  micWrap: { alignItems: 'center', marginVertical: -30 },
  status: { color: colors.dim, fontSize: 14, textAlign: 'center', fontWeight: '600' },
  heardBox: { backgroundColor: colors.surface, borderRadius: 18, padding: 16, gap: 6, borderWidth: 1, borderColor: colors.border },
  label: { color: colors.dim, fontSize: 12, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  heard: { color: colors.text, fontSize: 20, fontWeight: '600' },
  input: { backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border, color: colors.text, fontSize: 16, paddingHorizontal: 16, paddingVertical: 12 },
  suggestions: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  suggestion: { paddingHorizontal: 12, paddingVertical: 8, borderRadius: 999, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  suggestionText: { color: colors.text, fontSize: 13 },
  card: { backgroundColor: colors.surface, borderRadius: 22, padding: 16, gap: 10, borderWidth: 1, borderColor: colors.border },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: '700' },
  switchRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  switchTitle: { color: colors.text, fontSize: 15, fontWeight: '600' },
});
