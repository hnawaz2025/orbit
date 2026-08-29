import { StyleSheet, Text, View } from "react-native";
import type { EntityKind } from "@orbit/shared";
import { colors, radius, spacing, type } from "../theme";

// A talk is somewhere you sit; a person is someone you walk up to. Encoding
// that difference in colour rather than only in a word is what lets the list be
// scanned at arm's length while walking.
const LOOK: Record<string, { label: string; fg: string; bg: string }> = {
  TALK: { label: "SESSION", fg: colors.primary, bg: colors.primaryWash },
  PERSON: { label: "PERSON", fg: colors.person, bg: colors.personWash },
  BOOTH: { label: "BOOTH", fg: colors.urgent, bg: colors.urgentWash },
  ORG: { label: "COMPANY", fg: colors.urgent, bg: colors.urgentWash },
};

export function KindBadge({ kind }: { kind: EntityKind }) {
  const look = LOOK[kind] ?? { label: kind, fg: colors.textMuted, bg: colors.background };
  return (
    <View style={[styles.badge, { backgroundColor: look.bg }]}>
      <Text style={[styles.text, { color: look.fg }]}>{look.label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: spacing.sm,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  text: { ...type.label },
});
