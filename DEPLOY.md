# Deploying Orbit

Two things ship separately: an API on Render, and a static web bundle anywhere
that serves files. The client is deliberately **web**, not an app store build —
a conference attendee will not install anything to try something a stranger
showed them, and Expo Go is a 100 MB download before they see a single screen.
A URL they can scan is the only distribution that survives contact with a
hallway.

## 1 · The API — Vercel + Neon, both free

Render's always-on tier costs money and its free tier sleeps, so the default
path is Vercel for the API and Neon for Postgres. `render.yaml` is kept as an
alternative if you ever want a long-lived process.

### Postgres

Create a free project at neon.tech and copy the **pooled** connection string —
the one with `-pooler` in the host. A serverless function opens a connection
per invocation, and an unpooled Postgres will refuse them under any real
traffic.

Neon's free tier scales to zero and wakes in about a second, which is the
difference that matters here: Render's free tier takes closer to fifty, and
that lands on the first person to scan your QR code.

### The function

`vercel.json` routes every request to `api/index.ts`, which is the whole
Express app behind one catch-all function. Same server, same routes, no
rewrite — it just does not call `listen()`.

Deploy with `vercel --prod` from the repo root, or connect the repo in the
dashboard.

`maxDuration` is 60s. A question takes 3–6s; the ceiling is there for a cold
start with a slow model call behind it. Hobby now permits up to 300s.

It will need these secrets:

| Key | Needed for | Optional? |
|---|---|---|
| `OPENAI_API_KEY` | facets, reasons, embeddings, Whisper | **no** |
| `FEATHERLESS_API_KEY` | batch extraction of the sponsors page | yes |
| `SERPAPI_API_KEY` | speaker enrichment | yes |
| `ORGANIZER_TOKEN` | the organiser view | **no** — absent fails closed |

**Nothing creates the schema for you**, on any host. `start` used to run
`prisma db push` on boot, which rewrites a production schema from whatever the
deployed code happens to contain — that is a migration, and a migration should
be a decision. Push it once from your machine, pointed at Neon:

```bash
cd server
DATABASE_URL="<neon-pooled-url>" npx prisma db push
```

The database then starts **empty**.

### Seed it

From a machine with `DATABASE_URL` pointed at the Render database:

```bash
cd server
npm run seed          # Sessionize + sponsors, then LinkedIn profiles from cache
npm run inspect       # confirm: ~194 talks, ~174 people, 100% times
```

Enrichment is separate and metered — `npm run enrich -- api-world-2026 --limit 40`.
Cached searches make re-runs free, but the cache is local, so a fresh machine
re-spends the budget.

### If you use Render instead

`render.yaml` sets `plan: starter` deliberately. Render's free tier spins down
after fifteen minutes idle and takes ~50 seconds to wake — landing on the first
person to scan the QR after a quiet spell. On the free plan, ping `/health`
every ten minutes from a free scheduler to keep it awake.

## 2 · The web client

```bash
cd app
EXPO_PUBLIC_API_BASE_URL=https://<your-api>.onrender.com npx expo export --platform web
```

Output is `app/dist` — about 7 MB, a 1 MB JS bundle. `app/vercel.json` builds
and serves it as a second Vercel project (free), rewriting every path to
index.html so deep links work. Netlify or any static host works identically;
nothing server-side is required.

**The API URL is baked in at build time**, not read at runtime. Changing it
means rebuilding.

### HTTPS is not optional

`getUserMedia` only works in a secure context, so voice input dies on an HTTP
page — and an HTTPS page calling an HTTP API is blocked outright as mixed
content. Both halves must be HTTPS. Render gives you that on both.

## 3 · Before handing out the QR

- [ ] Open the deployed URL **on a phone with wifi off**. Cellular is the
      closest simulation of a stranger scanning it, and conference wifi is
      worse than cellular.
- [ ] Ask a question end to end. First request after a deploy is slowest.
- [ ] Try the microphone. It is the one thing that fails silently on HTTP.
- [ ] Confirm a long voice clip still uploads. Serverless request bodies cap at
      4.5 MB, which is why the server's JSON limit is 4 MB — roughly a minute
      of speech. Anything longer fails on the platform and nowhere else.
- [ ] Set a spend cap on the OpenAI key. Each question is two model calls plus
      an embedding; a hundred people asking three questions each is ~600 calls.
      Cheap, not free, and not something to discover afterwards.
- [ ] Print the QR large. Table, laptop lid, badge — and include the URL as
      text, because some phones will not scan cleanly under conference lighting.

## Rate limits

Limits key on the device token first and fall back to IP. That matters at a
conference: everyone shares one NAT address, so IP-first limiting would have
throttled the entire room together. Each browser mints its own token on first
load.

`/ask` allows 40 requests per 15 minutes per device — no real person reaches
that, and it caps a runaway client quickly.
