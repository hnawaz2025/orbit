import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// expo-secure-store wraps the native keychain and has no web implementation,
// which throws when this renders through react-native-web. Fall back to
// localStorage there; real devices keep using SecureStore.
export async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") return window.localStorage.getItem(key);
  return SecureStore.getItemAsync(key);
}

export async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    window.localStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}
