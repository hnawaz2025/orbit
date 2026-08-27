import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// Rendering, separated from extraction on purpose.
//
// API World's agenda and speaker pages are client-rendered: a plain fetch
// returns navigation chrome and no sessions at all. That is not unusual for
// conference sites, so the generic path has to assume a browser is needed.

const CACHE_DIR = path.resolve(__dirname, "../../.cache/pages");

function cachePathFor(url: string): string {
  return path.join(CACHE_DIR, `${createHash("sha256").update(url).digest("hex")}.txt`);
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
export async function renderPageText(url: string, options: { refresh?: boolean } = {}): Promise<string> {
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
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle", timeout: 45_000 });

    // innerText rather than HTML: the extractor works better on what a human
    // would read than on markup, and it strips scripts and styling that would
    // otherwise eat most of the model's context window.
    const text = await page.locator("body").innerText();

    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cacheFile, text, "utf8");
    return text;
  } finally {
    await browser.close();
  }
}

/**
 * Split page text into overlapping chunks that fit comfortably in context.
 *
 * The overlap is what stops a session listing that straddles a chunk boundary
 * from losing its room or time to the split -- the failure mode there is not a
 * missing entity but a *partial* one, which is worse, since it looks complete.
 */
export function chunkText(text: string, chunkChars = 6000, overlapChars = 600): string[] {
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
