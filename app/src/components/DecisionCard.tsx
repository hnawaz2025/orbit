import { Pressable, StyleSheet, Text, View } from "react-native";
import type { Decision } from "@orbit/shared";
import { colors, radius, spacing, type } from "../theme";

function clock(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone,
  });
}

/**
 * A clash, presented as the choice it is.
 *
 * The timeline could only show that two things collided. This shows the reason
 * for each -- which is the actual input to the decision, and was missing from
 * the surface that was supposed to help make it.
 *
 * "Keep both" stays available, because hedging is legal: someone may genuinely
 * want to decide at 13:55 based on how the last session went.
 */
export function DecisionCard({
  decision,
  reasons,
  timeZone,
  onKeep,
  onKeepBoth,
}: {
  decision: Decision;
  reasons: Map<string, string>;
  timeZone?: string;
  onKeep: (id: string) => void;
  onKeepBoth: () => void;
}) {
  const options = decision.options.slice(0, 2);

  return (
    <View style={styles.card}>
      <Text style={styles.when}>{clock(decision.startsAt, timeZone)} · both of these</Text>

      <View style={styles.row}>
        {options.map((option) => (
          <View key={option.id} style={styles.option}>
            <Text style={styles.title} numberOfLines={3}>{option.title}</Text>
            {reasons.get(option.id) ? (
              <Text style={styles.reason} numberOfLines={4}>{reasons.get(option.id)}</Text>
            ) : null}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Keep ${option.title}`}
              onPress={() => onKeep(option.id)}
              style={({ pressed }) => [styles.keep, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.keepText}>Keep this</Text>
            </Pressable>
          </View>
        ))}
      </View>

      <Pressable onPress={onKeepBoth} accessibilityRole="button" hitSlop={8}>
        <Text style={styles.both}>Keep both — decide later</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
  },
  when: { ...type.label, color: colors.urgentInk },
  row: { flexDirection: "row", gap: spacing.md },
  option: { flex: 1, gap: spacing.sm },
  title: { ...type.cardTitle, fontSize: 15, lineHeight: 20, color: colors.textPrimary },
  reason: { ...type.meta, color: colors.textSecondary },
  keep: {
    minHeight: 44,
    borderRadius: radius.input,
    borderWidth: 1,
    borderColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  keepText: { ...type.meta, color: colors.primary, fontFamily: "Inter_600SemiBold" },
  both: { ...type.meta, color: colors.textMuted, textAlign: "center" },
});
