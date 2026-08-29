import { Pressable, StyleSheet, Text, View } from "react-native";
import type { RecommendedEntity } from "@orbit/shared";
import { colors, radius, spacing, type } from "../theme";
import { KindBadge } from "./KindBadge";

/**
 * Formats when a session starts, relative to now.
 *
 * Relative rather than absolute because the only question an attendee is
 * actually asking is "can I still get to this" -- "in 20 min" answers it and
 * "14:20" makes them do arithmetic while walking.
 */
function whenLabel(startsAt: string | null): { text: string; urgent: boolean } | null {
  if (!startsAt) return null;

  const minutes = Math.round((new Date(startsAt).getTime() - Date.now()) / 60000);

  if (minutes < -5) return { text: "under way", urgent: true };
  if (minutes < 10) return { text: "starting now", urgent: true };
  if (minutes < 60) return { text: `in ${minutes} min`, urgent: minutes < 20 };

  const when = new Date(startsAt);
  const time = when.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  const day = when.toLocaleDateString([], { weekday: "short" });
  return { text: `${day} ${time}`, urgent: false };
}

export function RecommendationCard({
  item,
  onPress,
}: {
  item: RecommendedEntity;
  onPress: () => void;
}) {
  const when = whenLabel(item.startsAt);
  // For a person, the linked talk is the reason they are here. For a talk, the
  // linked person is who to actually approach. Either way the other end is the
  // actionable half, so it belongs on the card rather than one tap away.
  const linked = item.linked.slice(0, 2);

  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
    >
      <View style={styles.head}>
        <KindBadge kind={item.kind} />
        {when && (
          <Text style={[styles.when, when.urgent && styles.whenUrgent]}>{when.text}</Text>
        )}
      </View>

      <Text style={styles.title}>{item.title}</Text>
      {item.subtitle ? <Text style={styles.subtitle}>{item.subtitle}</Text> : null}

      {/* The reason is the product. Retrieval without it is just search. */}
      <Text style={styles.reason}>{item.reason}</Text>

      {(item.locationName || linked.length > 0) && (
        <View style={styles.foot}>
          {item.locationName ? (
            <Text style={styles.meta} numberOfLines={1}>
              {item.locationName}
            </Text>
          ) : null}
          {linked.length > 0 ? (
            <Text style={styles.metaLinked} numberOfLines={1}>
              {linked.map((l) => l.title).join(" · ")}
            </Text>
          ) : null}
        </View>
      )}
    </Pressable>
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
  pressed: { opacity: 0.9, borderColor: colors.hairline },
  head: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  when: { ...type.meta, color: colors.textMuted },
  whenUrgent: { color: colors.urgent },
  title: { ...type.cardTitle, color: colors.textPrimary },
  subtitle: { ...type.meta, color: colors.textSecondary, marginTop: -spacing.xs },
  reason: { ...type.reason, color: colors.textSecondary },
  foot: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingTop: spacing.sm,
    gap: 2,
  },
  meta: { ...type.meta, color: colors.textPrimary },
  metaLinked: { ...type.meta, color: colors.person },
});
