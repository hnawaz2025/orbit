import { StyleSheet, Text, View } from "react-native";
import { railState, type EntityKind, type RailState } from "@orbit/shared";
import { colors, radius, spacing, type } from "../theme";

/**
 * The when-and-where block on the left of every recommendation.
 *
 * The rules live in @orbit/shared as railState, so they can be tested without
 * rendering. This file decides only colour and layout.
 */

export function TimeRail({
  startsAt,
  endsAt,
  kind,
  untimedLabel,
}: {
  startsAt: string | null;
  endsAt: string | null;
  kind: EntityKind;
  /** What to do instead, when there is no time. "Find them", "Booth 412". */
  untimedLabel?: string;
}) {
  const state = railState(startsAt, endsAt, kind);

  if (state.kind === "untimed") {
    const isPerson = state.entity === "PERSON";
    return (
      <View
        style={[
          styles.rail,
          { backgroundColor: isPerson ? colors.personWash : colors.venueWash },
        ]}
      >
        <Text style={[styles.chip, { color: isPerson ? colors.person : colors.venue }]}>
          ANY TIME
        </Text>
        <Text
          style={[styles.untimed, { color: isPerson ? colors.person : colors.venue }]}
          numberOfLines={2}
        >
          {untimedLabel ?? (isPerson ? "Find them" : "All day")}
        </Text>
      </View>
    );
  }

  const hot = state.kind === "urgent" || state.kind === "underway";
  const ink = hot ? colors.urgentInk : colors.primary;

  return (
    <View style={[styles.rail, hot && { backgroundColor: colors.urgentWash }]}>
      <Text style={[styles.chip, { color: ink }]}>
        {state.kind === "urgent" ? state.lead : state.kind === "underway" ? "UNDER WAY" : state.day}
      </Text>
      {/* The clock survives every state. Only the colour and one line of copy
          change, so the card does not reflow as a session approaches. */}
      <Text style={[styles.start, { color: ink }]}>{state.start}</Text>
      {state.end ? <Text style={[styles.end, { color: ink }]}>{state.end}</Text> : null}
      <Text style={styles.duration}>
        {state.kind === "underway" ? state.remaining : state.duration}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    width: 76,
    minHeight: 88,
    borderRadius: 8,
    backgroundColor: colors.primaryWash,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
    gap: 1,
  },
  chip: { ...type.label, textAlign: "center" },
  start: { ...type.timeHero },
  end: { ...type.timeSmall },
  duration: { ...type.meta, color: colors.textMuted },
  untimed: { ...type.cardTitle, textAlign: "center" },
});
