import { FlatList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RecommendationCard } from "../components/RecommendationCard";
import { colors, radius, spacing, type } from "../theme";
import type { AskStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<AskStackParamList, "Results">;

/**
 * What was removed, said out loud.
 *
 * A short list late in the day looks like a thin corpus unless you say that
 * eleven sessions had already ended. Naming it is also the honest version of
 * the level filter: Orbit never tells anyone to skip a named talk, so when it
 * filters by audience level it reports that it did.
 */
function diagnosticsLine(d: Props["route"]["params"]["result"]["diagnostics"]): string | null {
  const parts: string[] = [];
  if (d.endedCount > 0) parts.push(`${d.endedCount} had already ended`);
  // Named as the ticket rather than as our judgement, because that is what it
  // is -- and so an attendee who upgraded knows what changes.
  if (d.passFilteredCount > 0) parts.push(`${d.passFilteredCount} need a different pass`);
  if (d.levelFilteredCount > 0) parts.push(`${d.levelFilteredCount} were a different level`);
  return parts.length > 0 ? `Not shown: ${parts.join(", ")}.` : null;
}

export function ResultsScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { question, result } = route.params;
  const note = diagnosticsLine(result.diagnostics);
  const { weakMatch } = result.diagnostics;

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      data={result.recommendations}
      keyExtractor={(item) => item.id}
      ListHeaderComponent={
        <View style={styles.header}>
          <Text style={styles.label}>YOU ASKED</Text>
          <Text style={styles.question}>{question}</Text>

          {/* Said before the list rather than after it. An attendee who reads
              five confident cards and only then learns none of them are really
              about their problem has already spent the trust. */}
          {weakMatch ? (
            <View style={styles.caveat}>
              <Text style={styles.caveatText}>
                Nothing here is squarely about that. These are the closest the programme gets —
                worth a look, but not what you asked for.
              </Text>
            </View>
          ) : null}
        </View>
      }
      renderItem={({ item }) => (
        <RecommendationCard
          item={item}
          timeZone={result.timezone}
          onPress={() => navigation.navigate("Detail", { item, timeZone: result.timezone })}
        />
      )}
      ItemSeparatorComponent={() => <View style={{ height: spacing.md }} />}
      ListEmptyComponent={
        <View style={styles.empty}>
          <Text style={styles.emptyTitle}>Nothing here matches that.</Text>
          <Text style={styles.emptyBody}>
            This conference doesn't cover it. That's a real answer, and a more useful one than
            five sessions that nearly fit — you'd have walked to one of them. Try a different
            part of the problem, or ask who might know rather than what to attend.
          </Text>
        </View>
      }
      ListFooterComponent={note ? <Text style={styles.note}>{note}</Text> : null}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing.lg },
  header: { marginBottom: spacing.lg, gap: spacing.xs },
  label: { ...type.label, color: colors.textMuted },
  question: { ...type.title, color: colors.textPrimary },
  caveat: {
    marginTop: spacing.sm,
    backgroundColor: colors.urgentWash,
    borderRadius: radius.card,
    padding: spacing.md,
  },
  caveatText: { ...type.meta, color: colors.urgentInk },
  empty: { paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTitle: { ...type.title, color: colors.textPrimary },
  emptyBody: { ...type.body, color: colors.textSecondary },
  note: { ...type.meta, color: colors.textMuted, marginTop: spacing.lg, textAlign: "center" },
});
