import { FlatList, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { RecommendationCard } from "../components/RecommendationCard";
import { colors, spacing, type } from "../theme";
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
  if (d.levelFilteredCount > 0) parts.push(`${d.levelFilteredCount} were a different level`);
  return parts.length > 0 ? `Not shown: ${parts.join(", ")}.` : null;
}

export function ResultsScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { question, result } = route.params;
  const note = diagnosticsLine(result.diagnostics);

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
            This conference does not seem to cover it. That is a real answer — better than five
            sessions that nearly fit. Try describing the problem a different way, or a narrower
            part of it.
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
  empty: { paddingVertical: spacing.xxl, gap: spacing.sm },
  emptyTitle: { ...type.title, color: colors.textPrimary },
  emptyBody: { ...type.body, color: colors.textSecondary },
  note: { ...type.meta, color: colors.textMuted, marginTop: spacing.lg, textAlign: "center" },
});
