import { Pressable, StyleSheet, Text, View } from "react-native";
import { PASS_TIERS, type PassTier } from "@orbit/shared";
import { colors, radius, spacing, type } from "../theme";

/**
 * Which ticket they hold, asked once and remembered.
 *
 * Worth the space on the Ask screen because it changes what is true rather
 * than what is preferred: at API World an OPEN pass admits 117 of 196
 * sessions, so without this the app confidently recommends rooms that will not
 * let them in.
 */
export function PassPicker({
  value,
  onChange,
}: {
  value?: PassTier;
  onChange: (pass: PassTier | undefined) => void;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>YOUR PASS</Text>
      <View style={styles.row}>
        {PASS_TIERS.map((tier) => {
          const on = value === tier;
          return (
            <Pressable
              key={tier}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              accessibilityLabel={`${tier} pass`}
              // Tapping the active tier clears it, which is how someone
              // undoes a mis-tap without a fourth "all" button.
              onPress={() => onChange(on ? undefined : tier)}
              style={[styles.chip, on && styles.chipOn]}
            >
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{tier}</Text>
            </Pressable>
          );
        })}
      </View>
      {!value ? (
        <Text style={styles.hint}>
          Showing everything. Pick your pass and Orbit stops suggesting rooms you can't get into.
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  label: { ...type.label, color: colors.textMuted },
  row: { flexDirection: "row", gap: spacing.sm },
  chip: {
    flex: 1,
    minHeight: 44,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...type.meta, color: colors.textSecondary },
  chipTextOn: { color: colors.white, fontFamily: "Inter_600SemiBold" },
  hint: { ...type.meta, color: colors.textMuted },
});
