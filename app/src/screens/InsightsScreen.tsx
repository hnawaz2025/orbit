import { useCallback, useState } from "react";
import { useFocusEffect } from "@react-navigation/native";
import { ActivityIndicator, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { EventInsights } from "@orbit/shared";
import { api } from "../api/client";
import { colors, radius, spacing, type } from "../theme";

const EVENT = "api-world-2026";

/**
 * The organizer's half of the product.
 *
 * An attendee asks what is worth their time. The organizer gets the aggregate
 * of those questions -- what the people who actually turned up needed, against
 * what was programmed six months earlier. Nothing here identifies anyone:
 * questions are stored against a device token never joined to a person, and
 * this screen shows counts and text, never who.
 */
export function InsightsScreen() {
  const insets = useSafeAreaInsets();
  const [data, setData] = useState<EventInsights | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    try {
      setData(await api.insights(EVENT));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't load that.");
    }
  }, []);

  // Refetched on focus, not once on mount: the point of this screen in a demo
  // is that it changes as people ask things.
  useFocusEffect(useCallback(() => { void load(); }, [load]));

  if (error) {
    return <View style={[styles.flex, styles.centred]}><Text style={styles.body}>{error}</Text></View>;
  }
  if (!data) {
    return <View style={[styles.flex, styles.centred]}><ActivityIndicator color={colors.primary} /></View>;
  }

  const gap = data.weak + data.unanswered;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => { setRefreshing(true); await load(); setRefreshing(false); }}
          tintColor={colors.primary}
        />
      }
    >
      <Text style={styles.lede}>
        What attendees actually asked for, against what the programme offers.
      </Text>

      <View style={styles.row}>
        <Stat value={data.questions} label="QUESTIONS" />
        <Stat value={data.attendees} label="ATTENDEES" />
        <Stat value={gap} label="UNMET" urgent={gap > 0} />
      </View>

      {/* The headline. A survey asks months later and gets a sanitised answer;
          this is the question someone typed at the time, with the programme
          having nothing good for it. */}
      {data.unmet.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.label}>NO GOOD ANSWER IN THE PROGRAMME</Text>
          {data.unmet.map((q) => (
            <View key={q.askedAt} style={styles.unmetCard}>
              <Text style={styles.unmetText}>“{q.text}”</Text>
              <Text style={styles.unmetScore}>
                {q.bestScore === 0 ? "nothing matched at all" : `closest match scored ${q.bestScore}`}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {data.topDomains.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.label}>WHAT THEY CAME TO SOLVE</Text>
          {data.topDomains.map((d) => (
            <Bar key={d.label} label={d.label} count={d.count} max={data.topDomains[0].count} />
          ))}
        </View>
      ) : null}

      {data.topSeeking.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.label}>WHAT KIND OF HELP THEY WANTED</Text>
          {data.topSeeking.map((s) => (
            <Bar key={s.label} label={s.label} count={s.count} max={data.topSeeking[0].count} />
          ))}
        </View>
      ) : null}

      {data.mostRecommended.length > 0 ? (
        <View style={styles.section}>
          <Text style={styles.label}>WHAT THE PROGRAMME ANSWERS WITH</Text>
          {data.mostRecommended.map((m) => (
            <View key={m.id} style={styles.recRow}>
              <Text style={styles.recTimes}>{m.times}×</Text>
              <Text style={styles.recTitle} numberOfLines={2}>{m.title}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <Text style={styles.footnote}>
        Questions are stored against an anonymous device token and never joined to a person.
      </Text>
    </ScrollView>
  );
}

function Stat({ value, label, urgent }: { value: number; label: string; urgent?: boolean }) {
  return (
    <View style={styles.stat}>
      <Text style={[styles.statValue, urgent && { color: colors.urgentInk }]}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function Bar({ label, count, max }: { label: string; count: number; max: number }) {
  return (
    <View style={styles.barRow}>
      <Text style={styles.barLabel} numberOfLines={1}>{label}</Text>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${Math.max(8, (count / max) * 100)}%` }]} />
      </View>
      <Text style={styles.barCount}>{count}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  centred: { alignItems: "center", justifyContent: "center", padding: spacing.xl },
  content: { padding: spacing.lg, gap: spacing.xl },
  lede: { ...type.body, color: colors.textSecondary },
  body: { ...type.body, color: colors.textSecondary },

  row: { flexDirection: "row", gap: spacing.md },
  stat: {
    flex: 1,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: 2,
  },
  statValue: { ...type.display, color: colors.primary },
  statLabel: { ...type.label, color: colors.textMuted },

  section: { gap: spacing.sm },
  label: { ...type.label, color: colors.textMuted },

  unmetCard: {
    backgroundColor: colors.urgentWash,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  unmetText: { ...type.reason, color: colors.textPrimary },
  unmetScore: { ...type.meta, color: colors.urgentInk },

  barRow: { flexDirection: "row", alignItems: "center", gap: spacing.sm },
  barLabel: { ...type.meta, color: colors.textPrimary, flex: 1 },
  barTrack: { width: 110, height: 8, borderRadius: 4, backgroundColor: colors.primaryWash, overflow: "hidden" },
  barFill: { height: 8, backgroundColor: colors.primary },
  barCount: { ...type.meta, color: colors.textMuted, width: 22, textAlign: "right" },

  recRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing.md,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  recTimes: { ...type.cardTitle, color: colors.primary, width: 32 },
  recTitle: { ...type.meta, color: colors.textPrimary, flex: 1 },

  footnote: { ...type.meta, color: colors.textMuted },
});
