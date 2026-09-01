import { useEffect, useRef } from "react";
import { Animated, Easing, Pressable, StyleSheet } from "react-native";
import { MicIcon } from "./TabIcons";
import { colors } from "../theme";
import type { RecordingState } from "../hooks/useVoiceRecording";

/**
 * Hold to talk, release to send. Lives inside the composer.
 *
 * It was a full-width button reading "Hold to talk", which took as much of the
 * screen as the thing it was an alternative to and put a second call to action
 * directly above the real one. As a mark in the corner of the input it reads
 * the way every other message box on a phone does, and costs the layout
 * nothing.
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
    // are still recording keeps talking into a hallway. It matters more now
    // that the control is small, not less.
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 700, easing: Easing.out(Easing.ease), useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 700, easing: Easing.in(Easing.ease), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [state, pulse]);

  const scale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.12] });
  const busy = state === "transcribing";
  const recording = state === "recording";

  return (
    <Animated.View style={{ transform: [{ scale }] }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Hold to describe your problem out loud"
        accessibilityState={{ busy }}
        onPressIn={busy ? undefined : onStart}
        onPressOut={busy ? undefined : onStop}
        // 44pt is the smallest target a thumb reliably hits, and this one is
        // pressed while walking.
        hitSlop={8}
        style={[styles.button, recording && styles.recording, busy && styles.busy]}
      >
        <MicIcon color={recording ? colors.white : colors.primary} size={20} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface,
    borderWidth: 1.5,
    borderColor: colors.border,
  },
  recording: { backgroundColor: colors.urgent, borderColor: colors.urgent },
  busy: { opacity: 0.5 },
});
