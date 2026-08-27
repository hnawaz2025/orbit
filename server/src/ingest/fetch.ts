import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Rendering, separated from extraction on purpose.
//
// API World's pages are client-rendered: a plain fetch returns navigation
// chrome and no sessions at all. That is not unusual for conference sites, so
// the generic path has to assume a browser is needed.

const CACHE_DIR = path.resolve(__dirname, "../../.cache/pages");

function cachePathFor(url: string): string {
  return path.join(CACHE_DIR, `${createHash("sha256").update(url).digest("hex")}.txt`);
}

/**
 * Wait until the page stops growing, then give up.
 *
 * The obvious choice here is `waitUntil: "networkidle"`, and it is wrong on
 * exactly the sites this has to work on. API World embeds a Cloudflare
 * Turnstile widget, which polls indefinitely -- the network is never idle, so
 * every page timed out at 45s despite having finished rendering in under two.
 *
 * Measuring the thing we actually care about instead: body text length. The
 * speakers page more than sextupled (1.7k -> 10.5k chars) between DOM-ready and
 * fully loaded, so a fixed sleep would either truncate that page or waste time
 * on the ones that were done immediately. This polls until two consecutive
 * samples match, which handles both without tuning per site.
 */
async function settleText(page: import("playwright").Page): Promise<string> {
  const POLL_MS = 500;
  const MAX_WAIT_MS = 12_000;

  let previous = "";
  const deadline = Date.now() + MAX_WAIT_MS;

  while (Date.now() < deadline) {
    const current = await page.locator("body").innerText();
    if (current.length > 0 && current === previous) return current;
    previous = current;
    await page.waitForTimeout(POLL_MS);
  }

  return previous;
}

/**
 * Fetch a page's rendered text, caching it to disk.
 *
 * The cache is not an optimisation. Tuning the extraction prompt means running
 * it twenty or thirty times against the same pages, and re-rendering someone's
 * site on every iteration would be both slow and rude -- this way each URL is
 * requested exactly once, ever. It also means ingestion stays reproducible
 * after the conference site changes or goes offline, which matters when the
 * demo is a week after the pages were captured.
 *
 * Delete `.cache/pages` to force a refresh.
 */
export async function renderPageText(
  url: string,
  options: { refresh?: boolean } = {}
): Promise<string> {
  const cacheFile = cachePathFor(url);

  if (!options.refresh) {
    try {
      return await readFile(cacheFile, "utf8");
    } catch {
      // Cache miss is the normal first-run path, not an error.
    }
  }

  // Imported lazily so the API server never loads Playwright. It is a
  // devDependency used by the ingest CLI, and requiring it at module scope
  // would make the deployed server fail to boot over a browser it never uses.
  const { chromium } = await import("playwright");
  const browser = await chromium.launch();

  // Two attempts. A conference site is a single point of failure for a whole
  // corpus, and the observed failures here are transient (a slow CDN, a
  // challenge widget that needs a second pass), not structural -- so one retry
  // converts a lost page into a slow one. More than one retry just makes a
  // genuinely broken source take four times as long to report itself.
  const ATTEMPTS = 2;
  let lastError: unknown;

  try {
    for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
      const page = await browser.newPage();
      try {
        // "load" rather than "networkidle" -- see settleText above.
        await page.goto(url, { waitUntil: "load", timeout: 30_000 });

        // innerText rather than HTML: the extractor works better on what a
        // human would read than on markup, and it strips scripts and styling
        // that would otherwise eat most of the model's context window.
        const text = await settleText(page);
        if (text.trim().length === 0) throw new Error("rendered page was empty");

        await mkdir(CACHE_DIR, { recursive: true });
        await writeFile(cacheFile, text, "utf8");
        return text;
      } catch (error) {
        lastError = error;
        if (attempt < ATTEMPTS) {
          console.warn(
            `  render failed (attempt ${attempt}/${ATTEMPTS}), retrying: ${
              error instanceof Error ? error.message.split("\n")[0] : String(error)
            }`
          );
        }
      } finally {
        await page.close();
      }
    }
  } finally {
    await browser.close();
  }

  throw new Error(
    `Could not render ${url} after ${ATTEMPTS} attempts: ${
      lastError instanceof Error ? lastError.message.split("\n")[0] : String(lastError)
    }`,
    { cause: lastError }
  );
}

/**
 * Split page text into overlapping chunks that fit comfortably in context.
 *
 * The overlap is what stops a session listing that straddles a chunk boundary
 * from losing its room or time to the split -- the failure mode there is not a
 * missing entity but a *partial* one, which is worse, since it looks complete.
 */
// 3000 rather than 6000. The schedule page packs roughly 27 sessions into
// 6000 characters, which asks a 7B model for ~2000 tokens of JSON in a single
// answer -- and observed behaviour at that size is not truncation but
// surrender: it returns an empty list. Halving the chunk halves the entities
// per call, and with three chunks in flight the extra calls cost no wall-clock.
export function chunkText(text: string, chunkChars = 3000, overlapChars = 400): string[] {
  const cleaned = text.replace(/\n{3,}/g, "\n\n").trim();
  if (cleaned.length <= chunkChars) return cleaned.length > 0 ? [cleaned] : [];

  const chunks: string[] = [];
  let start = 0;
  while (start < cleaned.length) {
    chunks.push(cleaned.slice(start, start + chunkChars));
    start += chunkChars - overlapChars;
  }
  return chunks;
}
