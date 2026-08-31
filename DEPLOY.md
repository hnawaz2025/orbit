# Deploying Orbit

Two things ship separately: an API on Render, and a static web bundle anywhere
that serves files. The client is deliberately **web**, not an app store build —
a conference attendee will not install anything to try something a stranger
showed them, and Expo Go is a 100 MB download before they see a single screen.
A URL they can scan is the only distribution that survives contact with a
hallway.

## 1 · The API

`render.yaml` is a Blueprint. In the Render dashboard: **New → Blueprint**,
point it at this repo, and it creates `orbit-server` and `orbit-db`.

It will prompt for three secrets:

| Key | Needed for | Optional? |
|---|---|---|
| `OPENAI_API_KEY` | facets, reasons, embeddings, Whisper | **no** |
| `FEATHERLESS_API_KEY` | batch extraction of the sponsors page | yes |
| `SERPAPI_API_KEY` | speaker enrichment | yes |

`npm run start` runs `prisma db push` before booting, so the schema is created
on first deploy. The database starts **empty**.

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

### Not the free tier

`plan: starter`, deliberately. Render's free tier spins down after fifteen
minutes idle and takes ~50 seconds to wake — landing on the first person to
scan the QR after a quiet spell, which is the worst possible moment for it.

## 2 · The web client

```bash
cd app
EXPO_PUBLIC_API_BASE_URL=https://<your-api>.onrender.com npx expo export --platform web
```

Output is `app/dist` — about 7 MB, a 1 MB JS bundle. Host it on Render as a
Static Site (publish directory `app/dist`), or Netlify, or Vercel. Nothing
server-side is required.

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
