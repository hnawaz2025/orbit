import { Pressable, StyleSheet, Text, View } from "react-native";
import { leaveBy, railState, type PlanItem } from "@orbit/shared";
import { colors, radius, spacing, type } from "../theme";

function clock(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit", minute: "2-digit", hour12: false, timeZone,
  });
}

/**
 * The answer to the only question asked twenty times a day.
 *
 * A day grid answers "what does Thursday look like", which someone asks maybe
 * three times across a conference. This answers "where do I go now", in the
 * top third of the screen, where the eye lands.
 */
export function NowNext({
  item,
  previous,
  timeZone,
  onOpen,
  onGoing,
  onSkip,
}: {
  item: PlanItem;
  previous: PlanItem | null;
  timeZone?: string;
  onOpen: () => void;
  onGoing: () => void;
  onSkip: () => void;
}) {
  const state = railState(item.startsAt, item.endsAt, item.kind, new Date(), timeZone);
  const leave = leaveBy(item, previous);
  const lateToLeave = leave ? Date.now() >= Date.parse(leave) : false;
  const hot = state.kind === "urgent" || state.kind === "underway" || lateToLeave;

  const chip =
    state.kind === "urgent" ? state.lead
      : state.kind === "underway" ? "UNDER WAY"
      : state.kind === "scheduled" ? `NEXT · ${state.day}`
      : "NEXT";

  return (
    <View style={[styles.card, hot && styles.cardHot]}>
      <Pressable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`Open ${item.title}`}>
        <View style={styles.head}>
          <Text style={[styles.chip, hot && styles.chipHot]}>{chip}</Text>
          {item.startsAt ? (
            <Text style={[styles.time, hot && styles.chipHot]}>{clock(item.startsAt, timeZone)}</Text>
          ) : null}
        </View>

        <Text style={styles.title} numberOfLines={2}>{item.title}</Text>

        {item.locationName ? (
          <Text style={styles.place} numberOfLines={1}>{item.locationName}</Text>
        ) : null}
      </Pressable>

      {/* The one piece of new arithmetic, and the only thing on this card that
          is actionable rather than informational. */}
      {leave ? (
        <View style={styles.walk}>
          <Text style={[styles.walkText, lateToLeave && styles.walkLate]}>
            {lateToLeave ? "Leave now" : `Leave by ${clock(leave, timeZone)}`}
          </Text>
        </View>
      ) : null}

      {/* Bottom third of the card, for a thumb. Neither of these is a
          commitment: going settles the slot, skipping refills the card. */}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          onPress={onGoing}
          style={({ pressed }) => [styles.action, styles.going, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.goingText}>I'm going</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={onSkip}
          style={({ pressed }) => [styles.action, styles.skip, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.skipText}>Not this</Text>
        </Pressable>
      </View>
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
    gap: spacing.sm,
  },
  cardHot: { borderColor: colors.urgent, borderWidth: 2 },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  chip: { ...type.label, color: colors.primary },
  chipHot: { color: colors.urgentInk },
  time: { ...type.timeHero, color: colors.primary },
  title: { ...type.title, color: colors.textPrimary, marginTop: spacing.xs },
  place: { ...type.place, color: colors.textPrimary },
  walk: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
  },
  walkText: { ...type.meta, color: colors.textSecondary },
  walkLate: { color: colors.urgentInk, fontFamily: "Inter_600SemiBold" },
  actions: { flexDirection: "row", gap: spacing.md, marginTop: spacing.xs },
  action: {
    flex: 1,
    minHeight: 52,
    borderRadius: radius.input,
    alignItems: "center",
    justifyContent: "center",
  },
  going: { backgroundColor: colors.primary },
  goingText: { ...type.cardTitle, color: colors.white },
  skip: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  skipText: { ...type.cardTitle, color: colors.textSecondary },
});
