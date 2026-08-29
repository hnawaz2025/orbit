import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { AskScreen } from "../screens/AskScreen";
import { DetailScreen } from "../screens/DetailScreen";
import { ResultsScreen } from "../screens/ResultsScreen";
import { colors, type } from "../theme";
import type { RootStackParamList } from "./types";

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: colors.background },
        headerShadowVisible: false,
        headerTintColor: colors.primary,
        headerTitleStyle: { ...type.cardTitle, color: colors.textPrimary },
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {/* Ask has no header: it is the whole screen, and a title bar above
          "What are you stuck on?" would just repeat it. */}
      <Stack.Screen name="Ask" component={AskScreen} options={{ headerShown: false }} />
      <Stack.Screen name="Results" component={ResultsScreen} options={{ title: "Worth your time" }} />
      <Stack.Screen name="Detail" component={DetailScreen} options={{ title: "" }} />
    </Stack.Navigator>
  );
}
