import { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import type { RecommendedEntity } from "@orbit/shared";
import { api } from "../api/client";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { NativeStackScreenProps } from "@react-navigation/native-stack";
import { Button } from "../components/Button";
import { KindBadge } from "../components/KindBadge";
import { LinkedInIcon } from "../components/TabIcons";
import { usePlan } from "../store/usePlan";
import { colors, radius, spacing, type } from "../theme";
import type { AskStackParamList } from "../navigation/types";

type Props = NativeStackScreenProps<AskStackParamList, "Detail">;

const RELATION_LABEL: Record<string, string> = {
  SPEAKS_AT: "Speaking",
  WORKS_FOR: "Works for",
  STAFFS_BOOTH: "At the booth",
  SPONSORS: "Sponsor",
};

export function DetailScreen({ navigation, route }: Props) {
  const insets = useSafeAreaInsets();
  const { item: passed, entityId, timeZone: passedZone } = route.params;

  // Opened either with a recommendation in hand (from results or the plan) or
  // with just an id (from a linked speaker), in which case it is fetched.
  const [fetched, setFetched] = useState<(RecommendedEntity & { timezone?: string }) | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  // Every hook is called before the early returns below. React identifies
  // hooks by call order, so a hook that runs only once the entity has loaded
  // changes that order between renders and crashes the screen -- which is
  // exactly what happened when Detail gained a loading state.
  const add = usePlan((s) => s.add);
  const remove = usePlan((s) => s.remove);
  const savedIds = usePlan((s) => s.saved);

  useEffect(() => {
    if (passed || !entityId) return;
    let live = true;
    api
      .entity("api-world-2026", entityId)
      .then((result) => live && setFetched(result))
      .catch((e) => live && setFailed(e instanceof Error ? e.message : "Couldn't load that."));
    return () => {
      live = false;
    };
  }, [passed, entityId]);

  const item = passed ?? fetched;
  const timeZone = passedZone ?? fetched?.timezone;

  if (failed) {
    return (
      <View style={[styles.flex, styles.centred]}>
        <Text style={styles.body}>{failed}</Text>
      </View>
    );
  }

  if (!item) {
    return (
      <View style={[styles.flex, styles.centred]}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  const saved = savedIds.some((entity) => entity.id === item.id);

  // Venue time, like everywhere else. A schedule read in the phone's zone is
  // wrong for anyone who has not landed yet.
  const when = item.startsAt
    ? new Date(item.startsAt).toLocaleString([], {
        weekday: "long",
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone,
      })
    : null;

  return (
    <ScrollView
      style={styles.flex}
      contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + spacing.xxl }]}
    >
      <KindBadge kind={item.kind} />
      <Text style={styles.title}>{item.title}</Text>
      {item.subtitle ? <Text style={styles.subtitle}>{item.subtitle}</Text> : null}

      {/* The two things you can do, together and above the fold. Connecting
          was previously below the biography, which put the point of a person's
          page behind a scroll. */}
      <View style={styles.actions}>
        <Button
          label={saved ? "Saved — remove" : "Save"}
          variant={saved ? "quiet" : "primary"}
          onPress={() => (saved ? remove(item.id) : add(item, timeZone))}
          style={{ flex: 1 }}
        />
        {item.profileUrl ? (
          <Pressable
            accessibilityRole="link"
            accessibilityLabel={`Connect with ${item.title} on LinkedIn`}
            onPress={() => Linking.openURL(item.profileUrl!).catch(() => {})}
            style={({ pressed }) => [styles.connect, pressed && { opacity: 0.85 }]}
          >
            <LinkedInIcon color={colors.white} />
          </Pressable>
        ) : null}
      </View>

      {item.reason ? (
        <View style={styles.reasonBox}>
          <Text style={styles.reasonLabel}>WHY THIS, FOR YOU</Text>
          <Text style={styles.reason}>{item.reason}</Text>
        </View>
      ) : null}

      {(item.locationName || when) && (
        <View style={styles.facts}>
          {item.locationName ? (
            <View style={styles.fact}>
              <Text style={styles.factLabel}>WHERE</Text>
              <Text style={styles.factValue}>{item.locationName}</Text>
            </View>
          ) : null}
          {when ? (
            <View style={styles.fact}>
              <Text style={styles.factLabel}>WHEN</Text>
              <Text style={styles.factValue}>{when}</Text>
            </View>
          ) : null}
        </View>
      )}

      {/* A reason is written for a question. Opened from a link there was no
          question, so the field is empty and the block is simply absent rather
          than showing a hollow one. */}
      {item.description ? <Text style={styles.body}>{item.description}</Text> : null}

      {/* The actionable other end. A matched talk surfaces the person you can
          actually walk up to, which is the half you cannot get from a schedule. */}
      {item.linked.length > 0 && (
        <View style={styles.linked}>
          <Text style={styles.linkedLabel}>ALSO HERE</Text>
          {item.linked.map((link) => (
            // Tappable. These rows were the product's central claim rendered
            // as a dead end -- a matched talk showed you the speaker and then
            // refused to open them.
            <Pressable
              key={link.id}
              accessibilityRole="button"
              accessibilityLabel={`Open ${link.title}`}
              onPress={() =>
                navigation.push("Detail", { entityId: link.id, timeZone })
              }
              style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.9 }]}
            >
              <Text style={styles.linkRelation}>{RELATION_LABEL[link.relation] ?? link.relation}</Text>
              <Text style={styles.linkTitle}>{link.title}</Text>
              {link.subtitle ? <Text style={styles.linkSub}>{link.subtitle}</Text> : null}
              {link.locationName ? <Text style={styles.linkSub}>{link.locationName}</Text> : null}
            </Pressable>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  centred: { alignItems: "center", justifyContent: "center", padding: spacing.xl },
  content: { padding: spacing.xl, gap: spacing.md },
  title: { ...type.display, color: colors.textPrimary },
  subtitle: { ...type.body, color: colors.textSecondary, marginTop: -spacing.sm },
  reasonBox: {
    backgroundColor: colors.primaryWash,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  reasonLabel: { ...type.label, color: colors.primary },
  reason: { ...type.reason, color: colors.textPrimary },
  facts: { flexDirection: "row", gap: spacing.xl, flexWrap: "wrap" },
  fact: { gap: 2 },
  factLabel: { ...type.label, color: colors.textMuted },
  factValue: { ...type.cardTitle, color: colors.textPrimary },
  body: { ...type.body, color: colors.textSecondary },
  actions: { flexDirection: "row", gap: spacing.md },
  connect: {
    // Square, matching the Button's 52pt height so the row reads as one
    // control rather than two mismatched ones. LinkedIn's mark is recognised
    // without a label; a word beside it would only cost the width.
    width: 52,
    height: 52,
    borderRadius: radius.input,
    backgroundColor: "#0A66C2",
    alignItems: "center",
    justifyContent: "center",
  },
  linked: { gap: spacing.sm, marginTop: spacing.sm },
  linkedLabel: { ...type.label, color: colors.textMuted },
  linkRow: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.card,
    padding: spacing.lg,
    gap: 2,
  },
  linkRelation: { ...type.label, color: colors.person },
  linkTitle: { ...type.cardTitle, color: colors.textPrimary },
  linkSub: { ...type.meta, color: colors.textSecondary },
});
