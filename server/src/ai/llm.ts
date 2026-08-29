import OpenAI, { toFile } from "openai";
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
  /**
   * Override the configured model for this one call.
   *
   * Extraction and explanation are different jobs with different constraints --
   * and on Featherless the choice is not only about quality, it is about
   * concurrency: a model's `concurrency_cost` is charged against a plan-wide
   * ceiling, so a large model can mean the whole app serves one request at a
   * time. Being able to name a model per call site is what makes that tunable.
   */
  model?: string;
  /**
   * Cap on generated tokens. Left generous rather than tight: extraction emits
   * a JSON array whose length scales with how many sessions were on the page,
   * and truncating that mid-object produces unparseable output rather than a
   * short answer.
   */
  maxTokens?: number;
}

export async function complete({
  system,
  user,
  correctionNote,
  temperature = 0.2,
  model,
  maxTokens = 4096,
}: CompleteInput): Promise<string> {
  const response = await client.chat.completions.create({
    model: model ?? env.FEATHERLESS_MODEL!,
    temperature,
    max_tokens: maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: correctionNote ? `${user}\n\n${correctionNote}` : user },
    ],
  });

  const choice = response.choices[0]?.message as
    | { content?: string | null; reasoning?: string | null }
    | undefined;
  const content = choice?.content ?? "";

  // Reasoning models return their chain of thought in a separate `reasoning`
  // field and leave `content` empty until they have finished thinking -- so on
  // a long extraction they spend the entire token budget reasoning and return
  // nothing at all. Caught here rather than downstream because the symptom
  // otherwise is callForJson reporting "expected JSON, got:" with an empty
  // string, retrying, and failing identically: a configuration mistake wearing
  // the costume of a flaky model.
  if (content.trim().length === 0 && (choice?.reasoning ?? "").trim().length > 0) {
    throw new Error(
      `Model ${model ?? env.FEATHERLESS_MODEL} returned reasoning but no content ` +
        "(finish_reason=" + (response.choices[0]?.finish_reason ?? "?") + "). " +
        "This is a reasoning model; Orbit's prompts expect a direct answer. Use an instruct model."
    );
  }

  return content;
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

export interface TranscribeInput {
  audio: Buffer;
  /** e.g. "audio/m4a" on a device, "audio/webm" in a browser. */
  mimeType: string;
}

/**
 * Speech to text, for the ask box.
 *
 * Voice is not a convenience feature here, it is the premise. The context of
 * use is a hallway between sessions: standing, moving, ninety seconds, one hand
 * holding a coffee. Typing a paragraph describing a technical problem in that
 * situation is the friction the product exists to remove, so this sits on the
 * critical path rather than beside it.
 */
export async function transcribe({ audio, mimeType }: TranscribeInput): Promise<string> {
  const extension = mimeType.split("/")[1]?.split(";")[0] ?? "m4a";
  const file = await toFile(audio, `speech.${extension}`);

  const result = await embeddingClient.audio.transcriptions.create({
    file,
    model: "whisper-1",
    // Biases the decoder toward the vocabulary an attendee will actually use.
    // Without it Whisper renders spoken tech terms phonetically -- "MCP" as
    // "em see pee", "Kubernetes" as "kubernetties" -- and the facet extractor
    // then matches on a word that is not in the corpus.
    prompt:
      "A software engineer at a developer conference describing a technical problem. Likely terms: API, MCP, LLM, agent, Kubernetes, observability, OAuth, webhook, latency, schema, SDK, gRPC, Postgres.",
  });

  return result.text;
}
