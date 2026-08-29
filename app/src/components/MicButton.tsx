import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing, type } from "../theme";
import type { RecordingState } from "../hooks/useVoiceRecording";

/**
 * Hold to talk, release to send.
 *
 * Hold rather than tap-to-start/tap-to-stop because the alternative fails in
 * exactly the situation this exists for: a hallway, walking, half-attention. A
 * tap-toggle that misses leaves the microphone open and the attendee unaware,
 * and there is no way to tell from a glance which state it is in. Holding is
 * self-evident and self-terminating.
 */
export function MicButton({
  state,
  onStart,
  onStop,
}: {
  state: RecordingState;
  onStart: () => void;
  onStop: () => void;
}) {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (state !== "recording") {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }

    // A visible, continuous signal that the microphone is live. The failure
    // this guards against is not aesthetic: someone who does not realise they
    // are still recording keeps talking into a hallway.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [state, pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.06] });
  const busy = state === "transcribing";

  const label =
    state === "recording" ? "Listening — release to send" : busy ? "Writing that down…" : "Hold to talk";

  return (
    <View style={styles.wrap}>
      <Animated.View style={{ transform: [{ scale }], width: "100%" }}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Hold to describe your problem out loud"
          accessibilityState={{ busy }}
          onPressIn={busy ? undefined : onStart}
          onPressOut={busy ? undefined : onStop}
          style={[
            styles.button,
            state === "recording" && styles.recording,
            busy && styles.busy,
          ]}
        >
          <Text style={[styles.label, state === "recording" && styles.labelRecording]}>{label}</Text>
        </Pressable>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: "100%" },
  button: {
    minHeight: 56,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing.xl,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.primary,
  },
  recording: { backgroundColor: colors.urgent, borderColor: colors.urgent },
  busy: { opacity: 0.6 },
  label: { ...type.cardTitle, color: colors.primary },
  labelRecording: { color: colors.white },
});
