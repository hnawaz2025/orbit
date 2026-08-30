import { SectionList, StyleSheet, Text, View } from "react-native";
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

  // Split rather than interleaved. A person is someone you walk up to and a
  // session is somewhere you sit -- different actions, different timing, and a
  // mixed list makes the reader do the sorting. Order follows rank, so
  // whichever the question was really about leads.
  const people = result.recommendations.filter((r) => r.kind === "PERSON");
  const rest = result.recommendations.filter((r) => r.kind !== "PERSON");
  const peopleFirst = (people[0]?.rank ?? Infinity) < (rest[0]?.rank ?? Infinity);

  const sections = [
    { key: "people", title: "PEOPLE TO MEET", data: people },
    { key: "sessions", title: "SESSIONS", data: rest },
  ]
    .filter((section) => section.data.length > 0)
    .sort((a, b) => (a.key === "people" ? (peopleFirst ? -1 : 1) : peopleFirst ? 1 : -1));

  return (
    <SectionList
      style={styles.list}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
      sections={sections}
      keyExtractor={(item) => item.id}
      stickySectionHeadersEnabled={false}
      renderSectionHeader={({ section }) =>
        // Only worth a heading when both kinds are present; a lone heading
        // above a single list is noise.
        sections.length > 1 ? <Text style={styles.sectionHeader}>{section.title}</Text> : null
      }
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
      SectionSeparatorComponent={() => <View style={{ height: spacing.sm }} />}
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
  sectionHeader: {
    ...type.label,
    color: colors.textMuted,
    marginTop: spacing.md,
    marginBottom: spacing.sm,
  },
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
