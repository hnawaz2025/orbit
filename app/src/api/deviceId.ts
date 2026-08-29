import { randomUUID } from "expo-crypto";
import { getItem, setItem } from "./storage";

const DEVICE_ID_KEY = "orbit_device_id";

/**
 * A device-scoped token, and the whole of Orbit's identity model.
 *
 * There is no account and no auth token. Leena mints one because knowing
 * someone's device id would otherwise let you read their practice history;
 * Orbit serves a public conference programme, so there is nothing private to
 * protect. What this is actually for is rate limiting an endpoint that spends
 * money, and the anonymous aggregate of what attendees needed.
 */
export async function getOrCreateDeviceId(): Promise<string> {
  const existing = await getItem(DEVICE_ID_KEY);
  if (existing) return existing;

  const id = randomUUID();
  await setItem(DEVICE_ID_KEY, id);
  return id;
}
