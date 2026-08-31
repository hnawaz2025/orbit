# server

Express + Prisma + Postgres. Owns the corpus, every model call, and both halves
of the product — the attendee's question and the organiser's aggregate.

```
src/
  app.ts            the Express instance, no listener
  index.ts          the listener, for running as a long-lived process
  env.ts            configuration, validated once at boot
  errors.ts         the error taxonomy, and what is safe to show a user
  ai/               model client and the JSON-retry wrapper
  ingest/           getting a conference into the database
  match/            turning a question into ranked recommendations
  routes/           ask · events · speech · insights
  middleware/       async handling, rate limits, device token, errors
scripts/            operational tools, run by hand
```

## The request path

`POST /ask` is the whole product in one handler.

1. **Facets** — prose becomes `{goal, domain, stack, blocker, seeking}`. Two
   attendees with the same problem describe it in vocabulary that shares no
   words; this is what makes them reach the same sessions.
2. **Affiliation** — companies named in the question are matched against
   employers the corpus knows. *"Who is here from Google"* is a lookup, not a
   search: embedding it puts "Google" near a great deal of AI content and
   nowhere near a person whose subtitle ends `@ Google`.
3. **Retrieve** — cosine similarity, brute-forced in memory. At a few hundred
   entities that is about a millisecond, and the bottleneck is the model call
   either side of it. `pgvector` earns its keep somewhere north of 100k
   vectors; swapping to it touches [`retrieve.ts`](src/match/retrieve.ts) and
   nothing else.
4. **Filter** — drop what has ended, what the attendee's pass does not admit,
   and what is far from their stated level. Everything removed is counted and
   reported.
5. **Rank** — similarity × durability × kind-fit × reachability, plus a capped
   link bonus and an affiliation bonus.
6. **Explain** — one call for all five results, so the reasons differentiate.
   Given each card alone a model writes five variations of one sentence.

## Ingestion

`npm run ingest -- <slug> [--refresh]`

Tier 1 (Sessionize) runs first where an event has an id; Tier 2 (a model
reading rendered page text) covers what it does not. Rendered pages are cached
to disk, so tuning a prompt never re-requests anyone's site — and `--refresh`
is how ingest sees a programme that changed, which it otherwise structurally
cannot.

**Reconciliation.** Re-ingesting retires what a source no longer lists, so a
cancelled session stops being recommended. Three guards, each earned:

- Only sources that **fetched successfully** can retire anything. Ingest
  continues past a failed source by design, so treating silence as removal
  would let one 404 empty the corpus.
- An entity must be missing **twice consecutively**. Model-tier extraction
  varies between runs; a single miss once retired 31 speakers who were still
  plainly on the page.
- A run may retire at most **30% of one source**. Above that it is a bad read,
  not a cancelled programme.

## Configuration

See [`.env.example`](.env.example). Only two are required:

| Variable | Required | Used for |
|---|---|---|
| `DATABASE_URL` | yes | Postgres. Use the pooled URL on a serverless host. |
| `OPENAI_API_KEY` | yes | facets, reasons, embeddings, Whisper |
| `ORGANIZER_TOKEN` | for `/insights` | gates the organiser view; absent fails closed |
| `FEATHERLESS_API_KEY` | ingest only | Tier 2 extraction |
| `SERPAPI_API_KEY` | ingest only | speaker profiles and enrichment |

Featherless is deliberately not required at boot. It serves only the extraction
path, which runs from a developer's machine — demanding it meant a working
deployment refused to start over a credential it would never use.

## Scripts

Operational, run by hand, all pointed at whatever `DATABASE_URL` says.

| Command | What it does |
|---|---|
| `npm run seed` | ingest, speaker subtitles, and LinkedIn profiles in one pass |
| `npm run inspect` | what is **actually** in the corpus, retired rows excluded |
| `npm run enrich -- <slug> --limit N` | SerpApi enrichment, metered and cached |
| `npm run verify:reconcile` | exercises retirement against a throwaway event |
| `npm run db:push` | apply the schema. Deliberately not run on boot. |

`inspect` exists because ingest reports what it *wrote*, which stops being the
same as what is *there* after a few runs — and because for several days it was
counting retired rows and quietly under-reporting the corpus.

## Tests

`npm test` — 148, all pure. No database, no API key, no network.

That is a deliberate boundary and an honest gap. Everything with real reasoning
in it — ranking, filtering, plan arithmetic, schema coercion, timezone
conversion, retirement — is covered and fast. The seam between that logic and
the screen is not, and that is precisely where every bug found by hand has
lived: a handler never passed, a hook after a conditional return, a fixed
height clipping a card.

`npm run typecheck` covers `src` **and** `scripts` **and** the tests. It did
not always: the build config excludes tests so they never reach `dist`, and
that exclusion silently removed them from typechecking too.
