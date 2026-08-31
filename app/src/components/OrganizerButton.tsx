import { Pressable, StyleSheet } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { InsightsIcon } from "./TabIcons";
import { colors, radius } from "../theme";
import type { RootStackParamList } from "../navigation/types";

/**
 * The way in to the organizer's view.
 *
 * Drawn the way an admin affordance is drawn everywhere else: small, muted,
 * in the corner, carrying no label. An attendee who taps it finds a passcode
 * field and goes back; nothing about it invites the tap in the first place,
 * which is the point. It replaces a tab that took a permanent quarter of the
 * bar for three people out of a thousand.
 */
export function OrganizerButton() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  return (
    <Pressable
      onPress={() => navigation.navigate("Insights")}
      hitSlop={12}
      accessibilityRole="button"
      accessibilityLabel="Organiser dashboard"
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <InsightsIcon color={colors.textMuted} size={17} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 34,
    height: 34,
    borderRadius: radius.pill,
    alignItems: "center",
    justifyContent: "center",
  },
  // No border and no fill at rest. It is a mark, not a control the attendee
  // is being offered.
  pressed: { backgroundColor: colors.venueWash },
});
