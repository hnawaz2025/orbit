import { useEffect, useMemo, useState } from "react";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  buildTimeline,
  decisionsToMake,
  planDays,
  selectNowNext,
  sortPlan,
  type PlanItem,
  type TimelineRow,
} from "@orbit/shared";
import { DecisionCard } from "../components/DecisionCard";
import { KindBadge } from "../components/KindBadge";
import { NowNext } from "../components/NowNext";
import { usePlan } from "../store/usePlan";
import { shortPlace } from "../utils/place";
import type { PlanStackParamList } from "../navigation/types";
import { colors, radius, spacing, type } from "../theme";

const GUTTER_W = 52;

function clock(iso: string, timeZone?: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone,
  });
}

function dayLabel(key: string): string {
  // key is a venue-local YYYY-MM-DD; parsed as UTC noon so the label cannot
  // slip a day on either side.
  return new Date(`${key}T12:00:00Z`).toLocaleDateString([], {
    weekday: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

function humanGap(minutes: number): string {
  if (minutes < 60) return `${minutes} min free`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m === 0 ? `${h} h free` : `${h} h ${m} m free`;
}

/** One session. Height is set by the layout, not by content. */
function Block({
  item, height, narrow, timeZone, onOpen,
}: {
  item: PlanItem; height: number; narrow: boolean; timeZone?: string; onOpen: (id: string) => void;
}) {
  const remove = usePlan((s) => s.remove);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Open ${item.title}`}
      onPress={() => onOpen(item.id)}
      // minHeight, not height. Duration should be legible as height, but a
      // fixed one made the card clip its own footer -- Remove and the end time
      // rendered outside the white box, on the page background. Proportion is
      // worth having; it is not worth breaking the card for.
      style={({ pressed }) => [styles.block, { minHeight: height }, narrow && styles.blockNarrow, pressed && { opacity: 0.9 }]}
    >
      <Text style={[styles.blockTitle, narrow && styles.blockTitleNarrow]} numberOfLines={narrow ? 3 : 2}>
        {item.title}
      </Text>
      {item.locationName ? (
        <Text style={styles.blockPlace} numberOfLines={1}>
          {shortPlace(item.locationName)}
        </Text>
      ) : null}
      <View style={styles.blockFoot}>
        <Pressable onPress={() => remove(item.id)} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.blockRemove}>Remove</Text>
        </Pressable>
        {item.endsAt ? <Text style={styles.blockEnd}>{clock(item.endsAt, timeZone)}</Text> : null}
      </View>
    </Pressable>
  );
}

function Row({ row, timeZone, onOpen }: { row: TimelineRow; timeZone?: string; onOpen: (id: string) => void }) {
  if (row.kind === "gap") {
    // A collapsed gap states its real length, so compressing the pixels never
    // hides the fact.
    if (!row.collapsed) return <View style={{ height: row.height }} />;
    return (
      <View style={styles.cuffRow}>
        <View style={styles.gutter} />
        <View style={styles.cuff}>
          <Text style={styles.cuffText}>
            {humanGap(row.minutes)} · {clock(row.from, timeZone)}–{clock(row.to, timeZone)}
          </Text>
        </View>
      </View>
    );
  }

  const narrow = row.items.length > 1;

  return (
    <View>
      <View style={styles.groupRow}>
        <View style={styles.gutter}>
          <Text style={styles.gutterTime}>{clock(row.startsAt, timeZone)}</Text>
        </View>
        {/* Two colliding sessions occupy the same vertical space. The
            impossibility is meant to be read before any words are involved. */}
        <View style={styles.column}>
          {row.items.map((item) => (
            <Block key={item.id} item={item} height={row.height} narrow={narrow} timeZone={timeZone} onOpen={onOpen} />
          ))}
        </View>
      </View>

      {row.collides ? (
        <View style={styles.clashRow}>
          <View style={styles.gutter} />
          <View style={styles.clash}>
            <Text style={styles.clashText}>These clash.</Text>
          </View>
        </View>
      ) : null}

      {row.overflow > 0 ? (
        <View style={styles.clashRow}>
          <View style={styles.gutter} />
          <Text style={styles.overflow}>
            +{row.overflow} more at {clock(row.startsAt, timeZone)}
          </Text>
        </View>
      ) : null}
    </View>
  );
}

type Props = NativeStackScreenProps<PlanStackParamList, "Plan">;

export function PlanScreen({ navigation }: Props) {
  const insets = useSafeAreaInsets();
  const items = usePlan((s) => s.items);
  const remove = usePlan((s) => s.remove);
  const timeZone = usePlan((s) => s.timeZone);
  const find = usePlan((s) => s.find);

  // The saved recommendation is kept whole, so opening one needs no fetch.
  const open = (id: string) => {
    const entity = find(id);
    if (entity) navigation.navigate("Detail", { item: entity, timeZone });
  };

  const saved = usePlan((s) => s.saved);
  const decided = usePlan((s) => s.decided);
  const declined = usePlan((s) => s.declined);
  const choose = usePlan((s) => s.choose);
  const keepBoth = usePlan((s) => s.keepBoth);
  const decline = usePlan((s) => s.decline);
  const resetSkips = usePlan((s) => s.resetSkips);

  const days = useMemo(() => planDays(items, timeZone), [items, timeZone]);

  // Zones A and B, in priority order: what to do now, then what is still
  // undecided. Both recomputed from the shortlist rather than stored, so a
  // save or a decision anywhere updates them.

  // A ticking clock, because every label on this screen is relative to it.
  // Without this "IN 12 MIN" never counts down, "UNDER WAY" never appears and
  // "Leave now" never fires -- on the one screen whose entire job is "now".
  // Thirty seconds is enough for minute-granularity copy and cheap enough to
  // leave running.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = setInterval(() => setNow(new Date()), 30_000);
    return () => clearInterval(tick);
  }, []);
  const declinedSet = useMemo(() => new Set(declined), [declined]);
  const decidedSet = useMemo(() => new Set(decided), [decided]);

  const upNext = useMemo(
    () => selectNowNext(items, now, declinedSet),
    [items, declinedSet, now]
  );
  const decisions = useMemo(
    () => decisionsToMake(items, decidedSet, now),
    [items, decidedSet, now]
  );

  // The reason is the input to a choice, and the shortlist keeps it.
  const reasons = useMemo(
    () => new Map(saved.map((entity) => [entity.id, entity.reason])),
    [saved]
  );

  const people = useMemo(() => items.filter((i) => i.kind === "PERSON"), [items]);
  const [dayIndex, setDayIndex] = useState(0);
  const activeDay = days[Math.min(dayIndex, Math.max(days.length - 1, 0))];

  const timeline = useMemo(
    () => buildTimeline(items, activeDay ?? "", timeZone),
    [items, activeDay, timeZone]
  );

  if (items.length === 0) {
    return (
      <View style={[styles.flex, styles.empty]}>
        <Text style={styles.emptyTitle}>Nothing saved yet.</Text>
        <Text style={styles.emptyBody}>
          Ask what you're stuck on and save anything worth your time — several things in the same
          slot is fine. This is a shortlist, not a schedule, and its job is to tell you where to go
          next.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      {days.length > 1 ? (
        <View style={styles.dayBar}>
          {days.map((key, index) => (
            <Pressable
              key={key}
              onPress={() => setDayIndex(index)}
              accessibilityRole="tab"
              accessibilityState={{ selected: index === dayIndex }}
              style={[styles.daySeg, index === dayIndex && styles.daySegOn]}
            >
              <Text style={[styles.dayText, index === dayIndex && styles.dayTextOn]}>
                {dayLabel(key)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      >
        {/* Zone A. Every zone disappears entirely when empty -- a placeholder
            for "nothing to decide" is worse than the space it occupies. */}
        {/* Skipping everything used to empty this zone silently, leaving the
            screen with no answer to its own question and no way back. */}
        {!upNext && declined.length > 0 && items.some((i) => i.startsAt) ? (
          <View style={styles.allSkipped}>
            <Text style={styles.allSkippedTitle}>You've skipped everything today.</Text>
            <Pressable
              accessibilityRole="button"
              onPress={() => resetSkips()}
              style={({ pressed }) => [styles.allSkippedButton, pressed && { opacity: 0.85 }]}
            >
              <Text style={styles.allSkippedText}>Show them again</Text>
            </Pressable>
          </View>
        ) : null}

        {upNext ? (
          <NowNext
            item={upNext}
            timeZone={timeZone}
            onOpen={() => open(upNext.id)}
            onGoing={() =>
              choose(
                upNext.id,
                decisions.find((d) => d.options.some((o) => o.id === upNext.id))
                  ?.options.map((o) => o.id) ?? [upNext.id]
              )
            }
            onSkip={() => decline(upNext.id)}
            committed={decidedSet.has(upNext.id)}
          />
        ) : null}

        {/* Zone B. */}
        {decisions.length > 0 ? (
          <View style={styles.zone}>
            <Text style={styles.zoneLabel}>
              {decisions.length === 1 ? "1 CHOICE TO MAKE" : `${decisions.length} CHOICES TO MAKE`}
            </Text>
            {decisions.map((decision) => (
              <DecisionCard
                key={decision.startsAt}
                decision={decision}
                reasons={reasons}
                timeZone={timeZone}
                onKeep={(id) => choose(id, decision.options.map((o) => o.id))}
                onKeepBoth={() => keepBoth(decision.options.map((o) => o.id))}
              />
            ))}
          </View>
        ) : null}

        {/* Zone C. People are the differentiator, so they sit above the day
            rather than on a shelf beneath it. */}
        {people.length > 0 ? (
          <View style={styles.zone}>
            <Text style={styles.zoneLabel}>PEOPLE TO FIND · {people.length}</Text>
            {people.map((person) => (
              <Pressable
                key={person.id}
                accessibilityRole="button"
                accessibilityLabel={`Open ${person.title}`}
                onPress={() => open(person.id)}
                style={({ pressed }) => [styles.personRow, pressed && { opacity: 0.9 }]}
              >
                <View style={styles.monogram}>
                  <Text style={styles.monogramText}>
                    {person.title.split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.personName} numberOfLines={1}>{person.title}</Text>
                  <Text style={styles.personWhere} numberOfLines={1}>
                    {person.startsAt
                      ? `${clock(person.startsAt, timeZone)} · ${shortPlace(person.locationName) ?? "find them"}`
                      : "Any time"}
                  </Text>
                </View>
              </Pressable>
            ))}
          </View>
        ) : null}

        {/* Zone D — the timeline, unchanged, under a header instead of at the
            top of the screen. */}
        {timeline.rows.some((r) => r.kind === "group") ? (
          <Text style={[styles.zoneLabel, styles.dayLabel]}>THE REST OF THE DAY</Text>
        ) : null}
        {timeline.rows.map((row, i) => (
          <Row key={row.kind === "group" ? row.startsAt + i : `gap-${i}`} row={row} timeZone={timeZone} onOpen={open} />
        ))}

        {/* Only entities with no session at all land here now -- speakers are
            placed at the session they are speaking at, and appear in Zone C. */}
        {timeline.anytime.filter((i) => i.kind !== "PERSON").length > 0 ? (
          <View style={styles.shelf}>
            <Text style={styles.shelfLabel}>ANY TIME</Text>
            {timeline.anytime.filter((i) => i.kind !== "PERSON").map((item) => (
              <Pressable
                key={item.id}
                accessibilityRole="button"
                accessibilityLabel={`Open ${item.title}`}
                onPress={() => open(item.id)}
                style={({ pressed }) => [styles.shelfCard, pressed && { opacity: 0.9 }]}
              >
                <KindBadge kind={item.kind} />
                <Text style={styles.shelfTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Pressable onPress={() => remove(item.id)} accessibilityRole="button" hitSlop={8}>
                  <Text style={styles.blockRemove}>Remove</Text>
                </Pressable>
              </Pressable>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  empty: { padding: spacing.xxl, justifyContent: "center", gap: spacing.sm },
  emptyTitle: { ...type.title, color: colors.textPrimary },
  emptyBody: { ...type.body, color: colors.textSecondary },

  dayBar: {
    flexDirection: "row",
    gap: spacing.xs,
    padding: spacing.md,
    backgroundColor: colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  daySeg: { flex: 1, paddingVertical: spacing.sm, borderRadius: radius.pill, alignItems: "center" },
  daySegOn: { backgroundColor: colors.primaryWash },
  dayText: { ...type.meta, color: colors.textMuted },
  dayTextOn: { color: colors.primary, fontFamily: "Inter_600SemiBold" },

  content: { padding: spacing.md, gap: spacing.md },
  zone: { gap: spacing.sm },
  allSkipped: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.md,
    alignItems: "flex-start",
  },
  allSkippedTitle: { ...type.cardTitle, color: colors.textPrimary },
  allSkippedButton: {
    minHeight: 44,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    borderRadius: radius.pill,
    backgroundColor: colors.primaryWash,
  },
  allSkippedText: { ...type.meta, color: colors.primary, fontFamily: "Inter_600SemiBold" },
  zoneLabel: { ...type.label, color: colors.textMuted },
  dayLabel: { marginTop: spacing.md },
  personRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 64,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
  },
  monogram: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: colors.personWash,
    alignItems: "center", justifyContent: "center",
  },
  monogramText: { ...type.meta, color: colors.person, fontFamily: "Inter_700Bold" },
  personName: { ...type.cardTitle, color: colors.textPrimary },
  personWhere: { ...type.meta, color: colors.textSecondary },

  groupRow: { flexDirection: "row", gap: 8 },
  gutter: { width: GUTTER_W, alignItems: "flex-end", paddingTop: 2 },
  gutterTime: { ...type.timeSmall, color: colors.textMuted },
  column: { flex: 1, flexDirection: "row", gap: 8 },

  block: {
    flex: 1,
    gap: spacing.xs,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderLeftWidth: 3,
    borderLeftColor: colors.primary,
    padding: spacing.md,
    justifyContent: "space-between",
  },
  blockNarrow: { padding: spacing.sm },
  blockTitle: { ...type.cardTitle, color: colors.textPrimary },
  blockTitleNarrow: { fontSize: 15, lineHeight: 20 },
  blockPlace: { ...type.meta, color: colors.textSecondary },
  blockFoot: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end" },
  blockRemove: { ...type.meta, color: colors.primary },
  blockEnd: { ...type.timeSmall, color: colors.textMuted },

  cuffRow: { flexDirection: "row", gap: 8, marginVertical: spacing.xs },
  cuff: {
    flex: 1,
    height: 64,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
  },
  cuffText: { ...type.meta, color: colors.textMuted },

  clashRow: { flexDirection: "row", gap: 8, marginTop: spacing.xs, marginBottom: spacing.sm },
  clash: {
    flex: 1,
    backgroundColor: colors.urgentWash,
    borderRadius: radius.card,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.md,
  },
  // Never "Conflict" -- that word describes the data structure, not the
  // attendee's problem.
  clashText: { ...type.meta, color: colors.urgentInk },
  overflow: { ...type.meta, color: colors.urgentInk },

  shelf: { marginTop: spacing.xl, gap: spacing.sm },
  shelfLabel: { ...type.label, color: colors.textMuted, marginLeft: GUTTER_W + 8 },
  shelfCard: {
    marginLeft: GUTTER_W + 8,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  shelfTitle: { ...type.cardTitle, color: colors.textPrimary },
});
