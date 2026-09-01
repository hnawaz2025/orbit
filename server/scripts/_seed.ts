import "dotenv/config";
import { readFileSync } from "node:fs";

type Seed = { device: string; pass: string; role: string; text: string };
const BASE = process.env.SEED_BASE_URL ?? "http://localhost:4001";

async function main() {
  const seeds: Seed[] = JSON.parse(readFileSync("seed/demo-questions.json", "utf8"));
  const only = process.argv[2] ? new Set(process.argv[2].split(",").map(Number)) : null;
  let ok = 0;
  for (const [i, s] of seeds.entries()) {
    if (only && !only.has(i)) continue;
    // Neon's free tier drops the pool mid-run; a dropped connection is not a
    // reason to lose the seed, so each question gets three attempts.
    let res!: Response;
    for (let attempt = 0; attempt < 3; attempt++) {
      res = await fetch(`${BASE}/ask`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-device-id": `demo-${s.device}` },
        body: JSON.stringify({ eventSlug: "api-world-2026", text: s.text, pass: s.pass }),
      });
      if (res.ok) break;
      await new Promise(r => setTimeout(r, 6000));
    }
    if (!res.ok) {
      console.log(`FAIL ${i} ${res.status} ${(await res.text()).slice(0, 90)}`);
      continue;
    }
    const body = (await res.json()) as { recommendations?: unknown[]; weakMatch?: boolean };
    ok++;
    console.log(`ok ${String(i).padStart(2)} ${s.device.padEnd(7)} recs=${body.recommendations?.length ?? 0} weak=${body.weakMatch ?? false}`);
  }
  console.log(`\nseeded ${ok}/${seeds.length}`);
}
main();
