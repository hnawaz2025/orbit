import { z } from "zod";

// Environment validation, run once at boot from index.ts.
//
// The point is to fail on deploy rather than on a user's first request: a
// missing API key otherwise looks like a perfectly healthy server that 500s
// the moment someone asks their first question -- which, at a conference,
// means it fails in front of the person you just handed your phone to.
const baseSchema = z.object({
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  PORT: z.string().optional(),

  AI_LLM_PROVIDER: z.enum(["featherless"]).default("featherless"),
  FEATHERLESS_API_KEY: z.string().optional(),
  FEATHERLESS_MODEL: z.string().optional(),

  // OpenAI covers two unrelated jobs: embeddings for retrieval, and Whisper
  // for the voice input. Both are required -- typing a paragraph one-handed
  // in a conference hallway is exactly the friction voice exists to remove.
  /**
   * Absent means the asking half of Orbit is closed.
   *
   * Every model call Orbit makes costs money against this key, and the /ask
   * endpoint is necessarily unauthenticated -- the whole product is "open it
   * in a hallway and ask something". Once an event is over, that is an open
   * meter attached to a page anyone can still load.
   *
   * So absence is a supported state rather than a misconfiguration: /ask and
   * /speech decline politely, and everything that costs nothing -- browsing
   * the programme, the organiser aggregate -- keeps working. Taking the key
   * out of the environment is the off switch, and it needs no deploy.
   */
  OPENAI_API_KEY: z.string().optional(),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),

  /**
   * The model that reads a question and writes the reasons.
   *
   * Separate from the extraction model because the jobs are not alike.
   * Extraction is transcription over a batch, where a small model is
   * sufficient and its cost is what matters. This runs once per question, in
   * front of a person, and produces the two things the product is actually
   * made of: what they meant, and why each result is for them.
   *
   * A 7B model was doing both. Asked "tell me people i want to meet from
   * Google and OpenAI" it returned facets of {"stack": ["Google", "OpenAI"]} --
   * no goal, no seeking -- so the preference for people never fired. The same
   * question here returns seeking: "an expert to talk to".
   */
  REASONING_MODEL: z.string().default("gpt-5.4-mini"),

  /**
   * Gate on the organizer view.
   *
   * Required rather than optional, and the endpoint refuses without it. The
   * aggregate is anonymous but it is still every question real attendees
   * typed, and "we forgot to set the variable" should fail closed rather than
   * publish the lot.
   */
  ORGANIZER_TOKEN: z.string().optional(),

  // Optional on purpose. Enrichment makes thin speaker entries matchable, but
  // the corpus is still servable without it -- a speaker's own talk abstract
  // is the richer signal anyway. Absent key means enrichment is skipped, not
  // that ingestion fails.
  SERPAPI_API_KEY: z.string().optional(),
});

// Featherless is deliberately not required.
//
// It used to be, because it answered every model call. It now serves only the
// Tier 2 extraction path, which runs from the ingest CLI on a developer's
// machine -- the deployed server does facets and reasons through OpenAI and
// never touches it. Demanding the key at boot meant a perfectly functional
// deployment refused to start over a credential it would never use, and in a
// serverless runtime that is a crash on every cold start rather than a
// readable message.
//
// The key is checked where it is used instead. See featherlessClient().
const envSchema = baseSchema;

export type Env = z.infer<typeof envSchema>;

export function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error("Invalid environment configuration:");
    for (const issue of parsed.error.issues) {
      console.error(`  - ${issue.path.join(".")}: ${issue.message}`);
    }
    process.exit(1);
  }
  return parsed.data;
}
