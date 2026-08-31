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
  timeZone,
  note,
}: {
  startsAt: string | null;
  endsAt: string | null;
  kind: EntityKind;
  /** What to do instead, when there is no time. "Find them", "Booth 412". */
  untimedLabel?: string;
  /** The venue's zone. A schedule is written in the conference's wall clock. */
  timeZone?: string;
  /** Replaces the day chip. Used to say the time belongs to their session. */
  note?: string;
}) {
  const state = railState(startsAt, endsAt, kind, new Date(), timeZone);

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
      <Text style={[styles.chip, { color: ink }]} numberOfLines={1}>
        {state.kind === "urgent"
          ? state.lead
          : state.kind === "underway"
            ? "UNDER WAY"
            : (note ?? state.day)}
      </Text>
      {note && state.kind === "scheduled" ? (
        <Text style={[styles.chip, { color: ink }]}>{state.day}</Text>
      ) : null}
      {/* The clock survives every state. Only the colour and one line of copy
          change, so the card does not reflow as a session approaches. */}
      {/* One line, always. A clock that wraps its last digit onto a second
          line is unreadable at a glance, which is the only way this is ever
          read. adjustsFontSizeToFit is the floor rather than the plan -- the
          box is sized for 22pt "15:00" and only shrinks for something
          unexpected. */}
      <Text
        style={[styles.start, { color: ink }]}
        numberOfLines={1}
        adjustsFontSizeToFit
        minimumFontScale={0.8}
      >
        {state.start}
      </Text>
      {state.end ? (
        <Text style={[styles.end, { color: ink }]} numberOfLines={1} adjustsFontSizeToFit>
          {state.end}
        </Text>
      ) : null}
      <Text style={styles.duration} numberOfLines={1}>
        {state.kind === "underway" ? state.remaining : state.duration}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  rail: {
    // 84 rather than 76: "15:00" set at 22pt in a bold grotesque needs about
    // 58pt, and 76 minus padding left too little margin once the font
    // actually loaded.
    width: 84,
    minHeight: 88,
    borderRadius: 8,
    backgroundColor: colors.primaryWash,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    paddingHorizontal: 4,
    gap: 1,
  },
  chip: { ...type.label, textAlign: "center" },
  start: { ...type.timeHero },
  end: { ...type.timeSmall },
  duration: { ...type.meta, color: colors.textMuted },
  untimed: { ...type.cardTitle, textAlign: "center" },
});
