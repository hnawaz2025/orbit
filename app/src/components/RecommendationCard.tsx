import { Pressable, StyleSheet, Text, View } from "react-native";
import type { RecommendedEntity } from "@orbit/shared";
import { colors, radius, spacing, type } from "../theme";
import { KindBadge } from "./KindBadge";
import { TimeRail } from "./TimeRail";

/**
 * Room names arrive long and repetitive -- "API World -- Workshop Stage A
 * (PRO)" -- and the leading conference name is on every one of them, so inside
 * the app it carries no information at all. Trimmed here rather than
 * server-side for now, which keeps the wire format unchanged.
 */
function shortPlace(location: string | null): string | null {
  if (!location) return null;
  return location
    .replace(/^(API World|AI TechWorld|CloudX|Santa Clara Convention Center)\s*--?\s*/i, "")
    .replace(/\s+--\s+/g, " · ")
    .trim();
}

export function RecommendationCard({
  item,
  onPress,
  onPressLinked,
  timeZone,
}: {
  item: RecommendedEntity;
  onPress: () => void;
  onPressLinked?: (id: string) => void;
  timeZone?: string;
}) {
  const place = shortPlace(item.locationName);
  // For a talk this is the speaker you can walk up to; for a person it is the
  // talk that explains why they are here. Either way the other end is the
  // actionable half, so it earns a row of its own rather than a metadata line.
  const linked = item.linked[0];

  return (
    <View style={styles.card}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${item.title}. ${item.reason}`}
        onPress={onPress}
        style={({ pressed }) => [styles.body, pressed && styles.pressed]}
      >
        <TimeRail
          startsAt={item.startsAt}
          endsAt={item.endsAt}
          kind={item.kind}
          untimedLabel={place ?? undefined}
          timeZone={timeZone}
        />

        <View style={styles.main}>
          <KindBadge kind={item.kind} />
          <Text style={styles.title} numberOfLines={3}>
            {item.title}
          </Text>
          {item.subtitle ? (
            <Text style={styles.subtitle} numberOfLines={1}>
              {item.subtitle}
            </Text>
          ) : null}
          {place && item.startsAt ? (
            <Text style={styles.place} numberOfLines={2}>
              {place}
            </Text>
          ) : null}
        </View>
      </Pressable>

      {/* The reason is the product, so it is set in ink at the widest measure
          on the card. It was previously textSecondary, which made the single
          most important sentence the second-darkest thing here. */}
      <Text style={styles.reason} numberOfLines={4}>
        {item.reason}
      </Text>

      {/* Informational until there is a route to a linked entity. Rendering it
          as a button that does nothing would be worse than rendering it flat:
          the differentiator would look broken rather than unfinished. */}
      {linked ? (
        <Pressable
          accessibilityRole={onPressLinked ? "button" : "text"}
          accessibilityLabel={
            onPressLinked ? `Open ${linked.title}` : `Also here: ${linked.title}`
          }
          onPress={onPressLinked ? () => onPressLinked(linked.id) : undefined}
          disabled={!onPressLinked}
          style={({ pressed }) => [styles.strip, pressed && onPressLinked && styles.pressed]}
        >
          <View style={styles.monogram}>
            <Text style={styles.monogramText}>
              {linked.title
                .split(/\s+/)
                .slice(0, 2)
                .map((w) => w[0])
                .join("")
                .toUpperCase()}
            </Text>
          </View>
          <View style={styles.stripText}>
            <Text style={styles.stripTitle} numberOfLines={1}>
              {linked.title}
            </Text>
            {linked.subtitle ? (
              <Text style={styles.stripSub} numberOfLines={1}>
                {linked.subtitle}
              </Text>
            ) : null}
          </View>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  body: { flexDirection: "row", gap: spacing.md, padding: spacing.lg },
  pressed: { opacity: 0.92 },
  main: { flex: 1, gap: spacing.xs },
  title: { ...type.cardTitle, color: colors.textPrimary },
  subtitle: { ...type.meta, color: colors.textSecondary },
  place: { ...type.place, color: colors.textPrimary },
  reason: {
    ...type.reason,
    color: colors.textPrimary,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.lg,
  },
  strip: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
  },
  monogram: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.personWash,
    alignItems: "center",
    justifyContent: "center",
  },
  monogramText: { ...type.meta, color: colors.person, fontFamily: "Inter_700Bold" },
  stripText: { flex: 1 },
  stripTitle: { ...type.cardTitle, color: colors.textPrimary },
  stripSub: { ...type.meta, color: colors.textSecondary },
});
