import { useMemo } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { findConflicts, sortPlan, type PlanItem } from "@orbit/shared";
import { KindBadge } from "../components/KindBadge";
import { usePlan } from "../store/usePlan";
import { colors, radius, spacing, type } from "../theme";

function timeLabel(item: PlanItem): string {
  if (!item.startsAt) return "Any time";
  const start = new Date(item.startsAt);
  const day = start.toLocaleDateString([], { weekday: "short" });
  const time = start.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  return `${day} ${time}`;
}

export function PlanScreen() {
  const insets = useSafeAreaInsets();
  const items = usePlan((s) => s.items);
  const remove = usePlan((s) => s.remove);

  const ordered = useMemo(() => sortPlan(items), [items]);

  if (items.length === 0) {
    return (
      <View style={[styles.flex, styles.empty]}>
        <Text style={styles.emptyTitle}>Nothing saved yet.</Text>
        <Text style={styles.emptyBody}>
          Ask what you're stuck on, then save the sessions and people worth your time. Orbit will
          flag anything that collides.
        </Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
    >
      {ordered.map((item) => {
        const conflicts = findConflicts(item, ordered);
        const overlap = conflicts.find((c) => c.kind === "overlap");
        const tight = conflicts.find((c) => c.kind === "tight");

        return (
          <View key={item.id} style={styles.row}>
            <Text style={styles.time}>{timeLabel(item)}</Text>

            <View style={[styles.card, overlap && styles.cardConflict]}>
              <KindBadge kind={item.kind} />
              <Text style={styles.title}>{item.title}</Text>
              {item.locationName ? <Text style={styles.where}>{item.locationName}</Text> : null}

              {/* Named, never resolved on their behalf. Which of two colliding
                  sessions matters more is not something Orbit can know. */}
              {overlap ? (
                <Text style={styles.conflict}>
                  Clashes with{" "}
                  {ordered.find((i) => i.id === overlap.withId)?.title ?? "another session"}
                </Text>
              ) : tight ? (
                <Text style={styles.tight}>
                  Only {tight.minutes} min to get here from your last session
                </Text>
              ) : null}

              <Pressable onPress={() => remove(item.id)} accessibilityRole="button">
                <Text style={styles.remove}>Remove</Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg, gap: spacing.md },
  empty: { padding: spacing.xxl, justifyContent: "center", gap: spacing.sm },
  emptyTitle: { ...type.title, color: colors.textPrimary },
  emptyBody: { ...type.body, color: colors.textSecondary },
  row: { gap: spacing.xs },
  time: { ...type.label, color: colors.textMuted },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  cardConflict: { borderColor: colors.urgent, borderWidth: 2 },
  title: { ...type.cardTitle, color: colors.textPrimary },
  where: { ...type.meta, color: colors.textSecondary },
  conflict: { ...type.meta, color: colors.urgent },
  tight: { ...type.meta, color: colors.textSecondary },
  remove: { ...type.meta, color: colors.primary, marginTop: spacing.xs },
});
