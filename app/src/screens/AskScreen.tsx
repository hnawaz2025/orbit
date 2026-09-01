import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Linking,
  Pressable,
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
import { LinkedInIcon } from "../components/TabIcons";
import { MicButton } from "../components/MicButton";
import { OrganizerButton } from "../components/OrganizerButton";
import { PassPicker } from "../components/PassPicker";
import { useVoiceRecording } from "../hooks/useVoiceRecording";
import { usePlan } from "../store/usePlan";
import { usePass } from "../store/usePass";
import { colors, radius, spacing, type } from "../theme";
import type { AskStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<AskStackParamList, "Ask">;

// Deliberately concrete. A blank box asking "what do you need?" gets "AI" back;
// these show, by example, that the useful input is a specific problem with a
// blocker in it -- which is what the facet extractor is actually good at.
const EXAMPLES = [
  "Our checkout API falls over under load and I don't know where to start",
  "I want to meet someone who has shipped agents in production",
  "Looking for a vendor who does document extraction with an audit trail",
];

const MAKER_LINKEDIN = "https://www.linkedin.com/in/hafsanawaz2000";

export function AskScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const voice = useVoiceRecording();
  const hydrate = usePlan((s) => s.hydrate);
  const pass = usePass((s) => s.pass);
  const setPass = usePass((s) => s.set);
  const hydratePass = usePass((s) => s.hydrate);

  useEffect(() => {
    void hydrate();
    void hydratePass();
  }, [hydrate, hydratePass]);

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
      const result = await api.ask(eventSlug, question, pass);
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
        {/* The event name and, at the far end of the same line, the way in to
            the organizer's view. It sits at the top of the first screen
            because that is where an admin mark is looked for, and nowhere
            else in the app has a header to hang it on. */}
        <View style={styles.topRow}>
          <Text style={styles.kicker}>API WORLD 2026</Text>
          <OrganizerButton />
        </View>
        <Text style={styles.heading}>What are you stuck on?</Text>
        <Text style={styles.sub}>
          Describe the actual problem, not a topic. Orbit finds the sessions and the people worth
          your time, and tells you where to catch them.
        </Text>

        {/* One box, the way a message composer reads: the microphone is an
            alternative way to fill this field, so it belongs inside it rather
            than competing with the submit button underneath. */}
        <View style={styles.composer}>
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
          <View style={styles.composerFoot}>
            <Text style={styles.micHint}>
              {voice.state === "recording"
                ? "Listening — release to send"
                : voice.state === "transcribing"
                  ? "Writing that down…"
                  : "or hold to talk"}
            </Text>
            <MicButton state={voice.state} onStart={voice.startRecording} onStop={finishSpeaking} />
          </View>
        </View>

        {error || voice.error ? (
          <Text style={styles.error}>{error ?? voice.error}</Text>
        ) : null}

        <PassPicker value={pass} onChange={setPass} />

        <Button label="Find my people" onPress={submit} loading={busy} disabled={text.trim().length === 0} />

        {/* Consent belongs where the typing happens.
            The same sentence already sat inside the organiser view, which is
            the one screen an attendee never opens -- so the people whose
            questions are being kept were the only people not told. It is one
            line, before the fact, in plain words. */}
        <Text style={styles.notice}>
          Your question is saved anonymously and shown to the organisers as part of what attendees
          needed. No name, no account.
        </Text>

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

        {/* Sits at the very bottom, after the examples, deliberately.
            Someone reads this only once they have decided the thing is worth
            their time, which is the only moment a "who made this" line is
            welcome rather than in the way. */}
        <Pressable
          style={styles.madeBy}
          accessibilityRole="link"
          accessibilityLabel="Connect with the maker on LinkedIn"
          onPress={() => Linking.openURL(MAKER_LINKEDIN).catch(() => {})}
        >
          <Text style={styles.madeByText}>
            Built by Hafsa Nawaz. If Orbit found you someone worth meeting, I&rsquo;d love to hear
            about it.
          </Text>
          <View style={styles.madeByMark}>
            <LinkedInIcon color={colors.white} size={14} />
          </View>
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.xl, gap: spacing.lg, paddingBottom: spacing.xxxl },
  madeBy: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: spacing.sm,
    marginTop: spacing.xl,
    paddingHorizontal: spacing.lg,
  },
  madeByText: { ...type.meta, color: colors.textMuted, flexShrink: 1 },
  madeByMark: {
    // The same brand blue and white mark the speakers carry, at a size that
    // suits a footer rather than an action row. One LinkedIn treatment in the
    // app, not two.
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: "#0A66C2",
    alignItems: "center",
    justifyContent: "center",
  },
  notice: {
    ...type.meta,
    color: colors.textMuted,
    textAlign: "center",
    marginTop: spacing.md,
  },
  topRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    // The button is taller than the kicker, so the row is offset back by the
    // padding inside it -- otherwise the heading below sits lower here than
    // on every other screen.
    marginRight: -spacing.sm,
    marginBottom: -spacing.sm,
  },
  kicker: { ...type.label, color: colors.primary },
  heading: { ...type.display, color: colors.textPrimary },
  sub: { ...type.body, color: colors.textSecondary },
  composer: {
    backgroundColor: colors.surface,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.border,
  },
  input: {
    minHeight: 132,
    padding: spacing.lg,
    paddingBottom: spacing.sm,
    ...type.body,
    color: colors.textPrimary,
  },
  composerFoot: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingLeft: spacing.lg,
    paddingRight: spacing.sm,
    paddingBottom: spacing.sm,
    gap: spacing.sm,
  },
  micHint: { ...type.meta, color: colors.textMuted, flexShrink: 1 },
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
