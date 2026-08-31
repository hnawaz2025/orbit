# @orbit/shared

The wire contract, and the logic both sides of it need.

## Why logic lives here

A DTO package would be types only. This holds functions because several
questions are **claims about the world** rather than rendering choices, and the
server will need them the moment a plan is something it reasons about rather
than something it stores:

| | |
|---|---|
| `findConflicts` | do two saved sessions actually collide, and is a room change reachable |
| `buildTimeline` | how a day lays out: block heights, collapsed gaps, clusters |
| `railState` | what the when-and-where block should say, in the venue's clock |
| `selectNowNext` | what to do next, given what is under way and what was skipped |
| `decisionsToMake` | which clashes are still open |
| `toPlanItem` | where a speaker sits, given they have no time of their own |
| `admits` | whether a pass tier opens a session's door |
| `countLabels` | grouping free-text facets for the organiser view |

The second reason is testability. None of it needs a database, an API key or a
simulator, so it is the best-covered code in the project — 148 tests run in
under a second — and it is where the rules that matter are enforced.

## It compiles to JavaScript

`main` points at `dist/index.js`, not at the TypeScript source. That is not
tidiness: a serverless runtime without native type stripping cannot `require` a
`.ts` file, so a `main` pointing at source fails at **runtime, in production,
after a completely green build**.

The cost is that editing this package requires rebuilding it before anything
else resolves the change. `npm run dev` and `npm run typecheck` in the server
both do that first, so the common paths are covered; a stale `dist` otherwise
shows up as *"has no exported member"* on a symbol that plainly exists.

## Conventions

**Timestamps cross the wire as ISO 8601 strings**, never as `Date`. Venue-local
day boundaries come from `venueDayKey`, so "which day" follows the conference
floor rather than the reader's phone.

**Absence is a fact, not a gap.** A person has no start time because they are
not scheduled; a booth is open all day. Nothing here treats a missing time as
unknown, and nothing invents one — except `toPlanItem`, which places a speaker
at the session they are speaking at, because that is where they will actually
be.
