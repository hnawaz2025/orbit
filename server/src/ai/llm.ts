import OpenAI from "openai";
import { loadEnv } from "../env";

// A thin chat client, not a domain interface. Leena wrapped its provider in a
// method-per-feature interface because it had seven distinct AI features; Orbit
// has two (extract entities, explain a match), and both want the same thing:
// send a system + user prompt, get raw text back, hand it to callForJson.
//
// Keys stay server-side and the client never talks to a provider directly, so
// swapping vendors touches this file and nothing else.

const env = loadEnv();

// The SDK defaults to a ten-minute timeout with two retries, so one stuck call
// could occupy a request for half an hour. Ingestion is a batch job where that
// is merely slow, but the same client serves /ask, where a conference attendee
// is standing in a hallway watching a spinner -- 60s bounds the worst case near
// two minutes instead of thirty.
const client = new OpenAI({
  apiKey: env.FEATHERLESS_API_KEY,
  baseURL: "https://api.featherless.ai/v1",
  timeout: 60_000,
  maxRetries: 1,
});

export interface CompleteInput {
  system: string;
  user: string;
  /** Appended by callForJson when re-asking after a malformed response. */
  correctionNote?: string;
  /**
   * Extraction wants near-zero temperature (it is transcription, not writing);
   * the recommendation call wants a little warmth so the opening line a person
   * is meant to say out loud doesn't read like a form letter.
   */
  temperature?: number;
}

export async function complete({
  system,
  user,
  correctionNote,
  temperature = 0.2,
}: CompleteInput): Promise<string> {
  const response = await client.chat.completions.create({
    model: env.FEATHERLESS_MODEL!,
    temperature,
    messages: [
      { role: "system", content: system },
      { role: "user", content: correctionNote ? `${user}\n\n${correctionNote}` : user },
    ],
  });

  return response.choices[0]?.message?.content ?? "";
}

// Embeddings come from OpenAI rather than Featherless: the corpus is a few
// hundred rows, so cost is negligible, and text-embedding-3-small is a known
// quantity where an open-weight embedding model's quality would be one more
// unvalidated thing during a week where nothing else can slip.
const embeddingClient = new OpenAI({ apiKey: env.OPENAI_API_KEY, timeout: 60_000 });

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const response = await embeddingClient.embeddings.create({
    model: env.EMBEDDING_MODEL,
    input: texts,
  });
  // The API preserves input order, but it also returns an explicit index --
  // sorting by it costs nothing and removes a silent corruption mode where
  // every entity in the corpus gets someone else's vector.
  return response.data.sort((a, b) => a.index - b.index).map((d) => d.embedding);
}

export const EMBEDDING_MODEL_ID = env.EMBEDDING_MODEL;
