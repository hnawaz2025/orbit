import type {
  AskResponse,
  EventInsights,
  EventSummary,
  PassTier,
  RecommendedEntity,
} from "@orbit/shared";
import { getOrCreateDeviceId } from "./deviceId";

// Point at your machine's LAN IP (not localhost) when testing on a physical
// device through Expo Go -- the phone resolves localhost to itself.
export const API_BASE_URL = process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:4001";

/**
 * Whatever this returns is what the attendee reads.
 *
 * The server already decides what is safe and useful to show, so the job here
 * is to surface that sentence rather than wrap it in HTTP noise. Stringifying
 * the whole response is how a provider's internal model id ends up on someone's
 * screen in the middle of a conference.
 */
async function errorMessageFrom(response: Response): Promise<string> {
  const fallback = "Something went wrong. Please try again.";
  try {
    const body = await response.json();
    if (typeof body?.error === "string") return body.error;

    const fieldErrors = body?.error?.fieldErrors as Record<string, string[]> | undefined;
    const firstField = fieldErrors && Object.values(fieldErrors).flat()[0];
    if (typeof firstField === "string") return firstField;

    return fallback;
  } catch {
    return response.status >= 500
      ? "Orbit isn't responding right now. Please try again."
      : fallback;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const deviceId = await getOrCreateDeviceId();

  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      "x-device-id": deviceId,
      ...options.headers,
    },
  });

  if (!response.ok) throw new Error(await errorMessageFrom(response));
  return response.json() as Promise<T>;
}

export const api = {
  events: () => request<EventSummary[]>("/events"),

  entity: (eventSlug: string, id: string) =>
    request<RecommendedEntity & { timezone: string }>(
      `/events/${eventSlug}/entities/${encodeURIComponent(id)}`
    ),

  insights: (eventSlug: string, token: string) =>
    request<EventInsights>(`/events/${eventSlug}/insights`, {
      headers: { "x-organizer-token": token },
    }),

  ask: (eventSlug: string, text: string, pass?: PassTier) =>
    request<AskResponse>("/ask", {
      method: "POST",
      body: JSON.stringify({ eventSlug, text, pass }),
    }),

  transcribe: (base64Audio: string, mimeType: string) =>
    request<{ text: string }>("/speech/transcribe", {
      method: "POST",
      body: JSON.stringify({ audio: base64Audio, mimeType }),
    }),
};
