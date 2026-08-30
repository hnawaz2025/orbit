import { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { buildTimeline, planDays, type PlanItem, type TimelineRow } from "@orbit/shared";
import { KindBadge } from "../components/KindBadge";
import { usePlan } from "../store/usePlan";
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
function Block({ item, height, narrow, timeZone }: { item: PlanItem; height: number; narrow: boolean; timeZone?: string }) {
  const remove = usePlan((s) => s.remove);
  return (
    <View style={[styles.block, { height }, narrow && styles.blockNarrow]}>
      <Text style={[styles.blockTitle, narrow && styles.blockTitleNarrow]} numberOfLines={narrow ? 3 : 2}>
        {item.title}
      </Text>
      {item.locationName ? (
        <Text style={styles.blockPlace} numberOfLines={1}>
          {item.locationName.replace(/^(API World|AI TechWorld|CloudX)\s*--?\s*/i, "")}
        </Text>
      ) : null}
      <View style={styles.blockFoot}>
        <Pressable onPress={() => remove(item.id)} accessibilityRole="button" hitSlop={8}>
          <Text style={styles.blockRemove}>Remove</Text>
        </Pressable>
        {item.endsAt ? <Text style={styles.blockEnd}>{clock(item.endsAt, timeZone)}</Text> : null}
      </View>
    </View>
  );
}

function Row({ row, timeZone }: { row: TimelineRow; timeZone?: string }) {
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
            <Block key={item.id} item={item} height={row.height} narrow={narrow} timeZone={timeZone} />
          ))}
        </View>
      </View>

      {row.collides ? (
        <View style={styles.clashRow}>
          <View style={styles.gutter} />
          <View style={styles.clash}>
            <Text style={styles.clashText}>You can only be at one of these.</Text>
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

export function PlanScreen() {
  const insets = useSafeAreaInsets();
  const items = usePlan((s) => s.items);
  const remove = usePlan((s) => s.remove);
  const timeZone = usePlan((s) => s.timeZone);

  const days = useMemo(() => planDays(items, timeZone), [items, timeZone]);
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
          Ask what you're stuck on, then save what's worth your time. Anything that collides will
          show up here as two sessions in the same slot, not as a warning you have to decode.
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
        {timeline.rows.map((row, i) => (
          <Row key={row.kind === "group" ? row.startsAt + i : `gap-${i}`} row={row} timeZone={timeZone} />
        ))}

        {/* Docked above nothing in particular: a person has no place on a time
            axis, and putting them in a slot would invent one. */}
        {timeline.anytime.length > 0 ? (
          <View style={styles.shelf}>
            <Text style={styles.shelfLabel}>ANY TIME</Text>
            {timeline.anytime.map((item) => (
              <View key={item.id} style={styles.shelfCard}>
                <KindBadge kind={item.kind} />
                <Text style={styles.shelfTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <Pressable onPress={() => remove(item.id)} accessibilityRole="button" hitSlop={8}>
                  <Text style={styles.blockRemove}>Remove</Text>
                </Pressable>
              </View>
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

  content: { padding: spacing.md },

  groupRow: { flexDirection: "row", gap: 8 },
  gutter: { width: GUTTER_W, alignItems: "flex-end", paddingTop: 2 },
  gutterTime: { ...type.timeSmall, color: colors.textMuted },
  column: { flex: 1, flexDirection: "row", gap: 8 },

  block: {
    flex: 1,
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
