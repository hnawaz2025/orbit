import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { StyleSheet, Text, View } from "react-native";
import { findConflicts, sortPlan } from "@orbit/shared";
import { AskIcon, PlanIcon } from "../components/TabIcons";
import { AskScreen } from "../screens/AskScreen";
import { DetailScreen } from "../screens/DetailScreen";
import { InsightsScreen } from "../screens/InsightsScreen";
import { PlanScreen } from "../screens/PlanScreen";
import { ResultsScreen } from "../screens/ResultsScreen";
import { usePlan } from "../store/usePlan";
import { colors, type } from "../theme";
import type {
  AskStackParamList,
  PlanStackParamList,
  RootStackParamList,
  RootTabParamList,
} from "./types";

const AskStack = createNativeStackNavigator<AskStackParamList>();
const PlanStack = createNativeStackNavigator<PlanStackParamList>();
const Tabs = createBottomTabNavigator<RootTabParamList>();
const Root = createNativeStackNavigator<RootStackParamList>();

const screenOptions = {
  headerStyle: { backgroundColor: colors.background },
  headerShadowVisible: false,
  headerTintColor: colors.primary,
  headerTitleStyle: { ...type.cardTitle, color: colors.textPrimary },
  contentStyle: { backgroundColor: colors.background },
} as const;

function AskFlow() {
  return (
    <AskStack.Navigator screenOptions={screenOptions}>
      {/* No header: the screen is one question, and a title bar above
          "What are you stuck on?" would only repeat it. */}
      <AskStack.Screen name="Ask" component={AskScreen} options={{ headerShown: false }} />
      <AskStack.Screen name="Results" component={ResultsScreen} options={{ title: "Worth your time" }} />
      <AskStack.Screen name="Detail" component={DetailScreen} options={{ title: "" }} />
    </AskStack.Navigator>
  );
}

function PlanFlow() {
  return (
    <PlanStack.Navigator screenOptions={screenOptions}>
      <PlanStack.Screen name="Plan" component={PlanScreen} options={{ title: "My day" }} />
      <PlanStack.Screen name="Detail" component={DetailScreen} options={{ title: "" }} />
    </PlanStack.Navigator>
  );
}

/**
 * The only badge in the app.
 *
 * It turns orange when the plan contains an unresolved overlap, which inherits
 * the urgent rule honestly: an overlap is a decision the attendee has not made
 * yet, and it is the one thing in the plan that will cost them something if
 * they never look.
 */
function PlanBadge() {
  const items = usePlan((s) => s.items);
  if (items.length === 0) return null;

  const ordered = sortPlan(items);
  const clashing = ordered.some((item) =>
    findConflicts(item, ordered).some((c) => c.kind === "overlap")
  );

  return (
    <View style={[styles.badge, clashing && styles.badgeClash]}>
      <Text style={styles.badgeText}>{items.length}</Text>
    </View>
  );
}

function TabNavigator() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarStyle: styles.bar,
        // Labels are not optional. Two unlabelled icons in a hallway is a
        // guessing game, and this is read while walking.
        tabBarLabelStyle: styles.label,
      }}
    >
      <Tabs.Screen
        name="AskTab"
        component={AskFlow}
        options={{
          title: "Ask",
          tabBarIcon: ({ color }) => <AskIcon color={color} />,
        }}
      />
      <Tabs.Screen
        name="PlanTab"
        component={PlanFlow}
        options={{
          title: "My day",
          tabBarIcon: ({ color }) => (
            <View>
              <PlanIcon color={color} />
              <PlanBadge />
            </View>
          ),
        }}
      />
    </Tabs.Navigator>
  );
}

/**
 * The organizer's view is a modal over the whole app rather than a tab in it.
 *
 * Presented rather than pushed because it is a different job, not a deeper
 * level of the current one: it opens over the attendee's day and closes back
 * onto exactly where they were.
 */
export function RootNavigator() {
  return (
    <Root.Navigator>
      <Root.Screen name="Tabs" component={TabNavigator} options={{ headerShown: false }} />
      <Root.Screen
        name="Insights"
        component={InsightsScreen}
        options={{
          ...screenOptions,
          presentation: "modal",
          title: "Organisers",
        }}
      />
    </Root.Navigator>
  );
}

const styles = StyleSheet.create({
  bar: {
    // No fixed height. 56pt left the labels sitting under the home indicator
    // on a notched phone, clipped to "Mv dav". React Navigation adds the
    // bottom inset itself as long as it is not overridden.
    backgroundColor: colors.surface,
    borderTopWidth: 1,
    borderTopColor: colors.hairline,
    elevation: 0,
    paddingTop: 6,
  },
  label: { ...type.label, marginBottom: 2 },
  badge: {
    position: "absolute",
    top: -5,
    right: -10,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 5,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  badgeClash: { backgroundColor: colors.urgent },
  badgeText: { ...type.label, color: colors.white, letterSpacing: 0 },
});
