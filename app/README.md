# app

Expo React Native — iOS, Android and web from one bundle. The web build is the
one that matters for distribution: a conference attendee will not install
anything to try what a stranger showed them, and Expo Go is a 100 MB download
before they see a screen.

```
src/
  api/          client, device token, storage
  components/   TimeRail · RecommendationCard · NowNext · DecisionCard · MicButton
  screens/      Ask · Results · Detail · Plan · Insights
  navigation/   two stacks under a tab shell
  store/        plan and pass, persisted per device
  theme/        tokens
  utils/        shared formatting
```

## Screens

**Ask** — one question, spoken or typed, plus the pass tier. Hold-to-talk
rather than tap-to-toggle: a tap that misses leaves the microphone open with no
way to tell at a glance, which is exactly the failure mode for someone
half-attending in a corridor.

**Results** — split into *people to meet* and *sessions*, because those are
different actions and a mixed list makes the reader do the sorting. Every card
leads with a **time rail**: day, clock, end, duration. The absolute time is
always shown and relative time is *added*, never substituted — an earlier
version replaced the clock with "in 34 min" inside an hour, which is nearly
every session worth showing during the conference itself.

**Detail** — the reason, where and when, the bio, and the two things you can do:
save, and connect. Linked entities are tappable, so a matched talk opens its
speaker.

**My day** — a shortlist, not a schedule. *Now/Next*, then the clashes still to
resolve, then people to find, then the timeline. Each zone disappears when
empty rather than showing a placeholder.

**Organisers** — passcode-gated. What attendees asked, and what the programme
had no answer for.

## Things that will surprise you

**`EXPO_PUBLIC_API_BASE_URL` is inlined at build time**, not read at runtime,
and Metro caches it. Export with `--clear` or a rebuild silently ships whichever
URL was baked in first — which once meant a bundle pointing at a host that had
never been deployed, with no error anywhere.

**`babel.config.js` exists for one reason.** Something in the dependency graph
emits `import.meta`, Metro leaves it alone by default, and Expo loads the web
bundle as a classic script — so the page rendered white, `#root` empty, before
React mounted. Native was never affected, which is why every other check passed.

**Times render in the venue's timezone, not the device's.** A schedule is
written in the conference's wall clock, and the people most likely to be in
another zone are the ones checking their plan the night before they fly.

**The plan stores whole recommendations**, not just their timings. It once kept
six fields, which is why a saved item could not show its reason, could not be
opened, and — if it was a person — had nowhere to sit on the axis.

## No tests here

Deliberate, and a real gap. The logic worth testing lives in
[`packages/shared`](../packages/shared) where it runs without a simulator:
conflicts, timeline geometry, rail state, plan selection. What remains in this
package is composition and layout, and the bugs that have actually appeared in
it — a hook after a conditional return, a fixed height clipping a card footer,
a handler never passed — are found by opening the app, not by a unit test.
