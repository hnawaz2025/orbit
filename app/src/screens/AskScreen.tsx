import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { api } from "../api/client";
import { Button } from "../components/Button";
import { MicButton } from "../components/MicButton";
import { useVoiceRecording } from "../hooks/useVoiceRecording";
import { colors, radius, spacing, type } from "../theme";
import type { RootStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<RootStackParamList, "Ask">;

// Deliberately concrete. A blank box asking "what do you need?" gets "AI" back;
// these show, by example, that the useful input is a specific problem with a
// blocker in it -- which is what the facet extractor is actually good at.
const EXAMPLES = [
  "Our checkout API falls over under load and I don't know where to start",
  "I want to meet someone who has shipped agents in production",
  "Looking for a vendor who does document extraction with an audit trail",
];

export function AskScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const voice = useVoiceRecording();

  async function finishSpeaking() {
    const heard = await voice.stopRecordingAndTranscribe();
    // Appended to whatever is already there, and not submitted. Whisper
    // mishears technical vocabulary and this is a noisy hall, so the attendee
    // reads it before it becomes a search.
    if (heard) setText((current) => (current ? `${current} ${heard}` : heard));
  }

  const eventSlug = route.params?.eventSlug ?? "api-world-2026";

  async function submit() {
    const question = text.trim();
    if (question.length === 0) return;

    setBusy(true);
    setError(null);
    try {
      const result = await api.ask(eventSlug, question);
      navigation.navigate("Results", { question, result });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xxl }]}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.kicker}>API WORLD 2026</Text>
        <Text style={styles.heading}>What are you stuck on?</Text>
        <Text style={styles.sub}>
          Describe the actual problem, not a topic. Orbit finds the sessions and the people worth
          your time, and tells you where to catch them.
        </Text>

        <TextInput
          style={styles.input}
          value={text}
          onChangeText={setText}
          placeholder="We're migrating 200 internal APIs and our consumers keep breaking…"
          placeholderTextColor={colors.textMuted}
          multiline
          textAlignVertical="top"
          editable={!busy}
        />

        {error || voice.error ? (
          <Text style={styles.error}>{error ?? voice.error}</Text>
        ) : null}

        <MicButton state={voice.state} onStart={voice.startRecording} onStop={finishSpeaking} />

        <Button label="Find my people" onPress={submit} loading={busy} disabled={text.trim().length === 0} />

        {busy ? (
          <View style={styles.thinking}>
            <ActivityIndicator color={colors.primary} />
            <Text style={styles.thinkingText}>Reading the programme…</Text>
          </View>
        ) : (
          <View style={styles.examples}>
            <Text style={styles.examplesLabel}>FOR INSTANCE</Text>
            {EXAMPLES.map((example) => (
              <Text key={example} style={styles.example} onPress={() => setText(example)}>
                {example}
              </Text>
            ))}
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  kicker: { ...type.label, color: colors.primary },
  heading: { ...type.display, color: colors.textPrimary },
  sub: { ...type.body, color: colors.textSecondary },
  input: {
    minHeight: 132,
    backgroundColor: colors.surface,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    ...type.body,
    color: colors.textPrimary,
  },
  error: { ...type.body, color: colors.error },
  thinking: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  thinkingText: { ...type.meta, color: colors.textMuted },
  examples: { gap: spacing.sm, marginTop: spacing.sm },
  examplesLabel: { ...type.label, color: colors.textMuted },
  example: {
    ...type.body,
    color: colors.primary,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.input,
    padding: spacing.md,
  },
});
