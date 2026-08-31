<h1 align="center">Orbit</h1>

<p align="center">
  You are standing in a convention centre with two hundred sessions and eighty
  booths in front of you. Orbit answers the question the programme cannot:
  <em>who should I actually meet?</em>
</p>

---

Describe what you are stuck on — typed, or spoken into a phone in a hallway —
and Orbit returns the sessions, people and companies worth your time, each with
a sentence saying why it is for **you**, and where and when to get there.

> *"Ask him how Google's AI infrastructure team thinks about compute
> accelerator development for AI workloads, since that is the part of Google he
> works on directly."*

That sentence is the product. A ranked list without it asks the attendee to
re-derive the relevance the system already computed.

## What makes it different

**People are first-class, not a field on a session.** Talks, people, booths and
companies are one uniform entity type wired together with typed links, so a
matched talk surfaces the speaker you can walk up to, and a matched speaker
surfaces the session where you will find them. Most conference tools model the
schedule and treat humans as metadata.

**Perishability beats relevance.** A recorded talk is deliberately down-ranked.
The recording will exist next month; the chance to ask that speaker your
specific question will not. This is arithmetic in [`rank.ts`](server/src/match/rank.ts),
not a claim in a pitch.

**It says when it has nothing.** Thresholds are calibrated against questions the
conference genuinely covers (0.44–0.61) and questions it does not (0.23–0.35).
Ask about espresso machines and Orbit says so, rather than returning five
sessions that nearly fit.

**Saving is a shortlist, not a commitment.** Nobody at a conference commits —
they hold three plausible things at 14:00 and decide at 13:55. Overlaps are the
raw material, and the plan's job is to convert a shortlist into a next action.

**There is a second user.** Every question is retained anonymously, because the
aggregate is a product of its own: what the people who turned up actually
needed, against what was programmed six months earlier.

## Infrastructure

```
                 ┌──────────────────────────────────────────┐
                 │  Expo app  ·  iOS · Android · Web         │
                 │  Ask (voice/text) → Results → Detail      │
                 │  My day (shortlist) · Organisers (gated)  │
                 └───────────────────┬──────────────────────┘
                                     │  HTTPS, anonymous device token
                                     ▼
                 ┌──────────────────────────────────────────┐
                 │  Express API  ·  one serverless function  │
                 │  /ask  /events  /speech  /insights        │
                 └──┬───────────────┬──────────────────┬────┘
                    │               │                  │
            ┌───────▼──────┐  ┌─────▼────────┐  ┌──────▼───────┐
            │  Postgres    │  │  OpenAI      │  │  (ingest CLI │
            │  Neon        │  │  facets ·    │  │   only)      │
            │  entities,   │  │  reasons ·   │  │  Featherless │
            │  links,      │  │  embeddings ·│  │  SerpApi     │
            │  questions   │  │  Whisper     │  │  Playwright  │
            └──────────────┘  └──────────────┘  └──────────────┘
```

The ingest side runs from a developer's machine, never from the server. The
deployed API answers questions and nothing else.

### Getting a corpus in

Three tiers, tried in order. A conference is onboarded at the highest tier it
supports.

| Tier | Source | Cost to onboard | Quality |
|---|---|---|---|
| **1** | Platform JSON — Sessionize | an event id | 205 sessions, 99% descriptions, 100% times |
| **2** | Any public page, read by a model | a URL | 191 sessions, 8% descriptions, 10% times |
| **3** | Organiser's own export | a conversation | — |

Those numbers are the same conference. Tier 1 is not a marginal improvement —
every failure class that cost days on the model path (chunks returning empty, a
hallucinated date discarding a batch, run-to-run variance retiring speakers who
were still listed) is structurally absent when there is no model.

Tier 2 still earns its place: it served API World before we knew Sessionize
existed, it covers the exhibitor list Sessionize knows nothing about, and it
found sessions the API does not list. It is also the answer when an organiser
has not enabled their public feed — which is a permission, not a technical
limit, and the reason Tier 1 cannot be a hard dependency.

## Repo layout

An npm workspace, three packages, one shared contract.

```
server/            Express + Prisma + Postgres. Owns every model call.
app/               Expo React Native client — iOS, Android and web.
packages/shared/   The wire contract, and the logic both sides need.
api/index.ts       Serverless entry point: the Express app, no listener.
```

Each has its own README with the engineering detail:
[`server/README.md`](server/README.md) ·
[`app/README.md`](app/README.md) ·
[`packages/shared/README.md`](packages/shared/README.md).
Deployment lives in [`DEPLOY.md`](DEPLOY.md).

**Why `packages/shared` holds logic and not just types.** Whether two sessions
collide, what a time rail should say, which day something falls on at the venue
— these are claims about the world, not rendering choices, and the server will
need them the moment a plan is something it reasons about. Keeping them there
also makes them testable without a database or an API key, which is why they
are the best-covered code in the project.

## Running it

```bash
npm install                      # from the repo root; installs all workspaces

cd server
cp .env.example .env             # fill in OPENAI_API_KEY at minimum
npx prisma db push               # point DATABASE_URL at a Postgres first
npm run seed                     # Sessionize + sponsors + profiles, ~10 min
npm run dev                      # localhost:4001

cd ../app
npm start                        # scan the QR with Expo Go, or press w for web
```

The client reads `EXPO_PUBLIC_API_BASE_URL` **at build time**, not at runtime.
A phone on the same wifi needs your machine's LAN address, not `localhost`.

```bash
npm run check                    # typecheck (server, app, tests, scripts) + tests
npm run inspect                  # what is actually in the corpus, not what ingest claimed
```

## Decisions worth knowing before reading the code

**No accounts.** Identity is a device-scoped random token. There is no private
corpus to protect — everything Orbit serves is a public conference programme —
so an auth token would add an onboarding step and defend nothing. It exists for
rate limiting and for the anonymous organiser aggregate.

**Two models, two jobs.** Extraction is transcription over a batch, where a
small open-weight model is sufficient and cost is what matters. Reading a
question and writing the reasons happens once per request in front of a waiting
person, and produces the two things the product is made of. They are not the
same job and no longer share a model.

**Every discard is loud or narrow.** A thin corpus looks exactly like a
thorough one from the outside. Extraction refuses a whole chunk only for
disagreements about facts, never vocabulary; filtered results are counted and
reported; a run that would retire an implausible share of a source treats
itself as the broken thing.

**The plan lives on the device.** It has to work with no signal in a basement
hall, and there is no account to hang it on. A lost phone loses the plan; that
trade is better than asking someone to register before they can save a session.
