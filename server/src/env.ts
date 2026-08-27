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
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required (embeddings + Whisper)"),
  EMBEDDING_MODEL: z.string().default("text-embedding-3-small"),

  // Optional on purpose. Enrichment makes thin speaker entries matchable, but
  // the corpus is still servable without it -- a speaker's own talk abstract
  // is the richer signal anyway. Absent key means enrichment is skipped, not
  // that ingestion fails.
  SERPAPI_API_KEY: z.string().optional(),
});

const envSchema = baseSchema.superRefine((env, ctx) => {
  if (env.AI_LLM_PROVIDER === "featherless") {
    if (!env.FEATHERLESS_API_KEY) {
      ctx.addIssue({
        code: "custom",
        path: ["FEATHERLESS_API_KEY"],
        message: "FEATHERLESS_API_KEY is required when AI_LLM_PROVIDER=featherless",
      });
    }
    if (!env.FEATHERLESS_MODEL) {
      ctx.addIssue({
        code: "custom",
        path: ["FEATHERLESS_MODEL"],
        message:
          "FEATHERLESS_MODEL is required when AI_LLM_PROVIDER=featherless. Check that model's concurrency-unit cost before using it in a live demo.",
      });
    }
  }
});

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
