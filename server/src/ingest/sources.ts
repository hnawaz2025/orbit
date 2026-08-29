// Every event Orbit knows about, as data.
//
// This file is the scaling claim in its most literal form: adding a conference
// is an entry here, not a code change. Nothing below is API World-specific
// beyond the strings -- the same shape describes a university career fair or an
// internal engineering org, which is why the Entity model carries ROLE, PROJECT
// and TEAM kinds it does not yet use.

export interface EventDefinition {
  slug: string;
  name: string;
  venue?: string;
  timezone: string;
  startsAt: string;
  endsAt: string;

  /**
   * The event's Sessionize id, when it has one.
   *
   * This is the entire cost of onboarding a conference that runs on Sessionize,
   * and it is worth stating plainly because it is the product's scaling claim:
   * an id, not a scraping project. Sessions and speakers then come from the
   * organizer's own scheduling system as structured data -- no model, no
   * chunking, no confidence floor, nothing to vary between runs.
   */
  sessionizeId?: string;

  /**
   * Pages read by the model tier.
   *
   * Still needed alongside Sessionize rather than replaced by it: Sessionize
   * knows about sessions and speakers, and nothing at all about who is
   * exhibiting. Sponsors and booths only exist on the conference's own site.
   */
  sources: { url: string; hint?: string }[];
}

export const EVENTS: EventDefinition[] = [
  {
    slug: "api-world-2026",
    name: "API World 2026",
    venue: "Santa Clara Convention Center",
    timezone: "America/Los_Angeles",
    startsAt: "2026-09-01T08:00:00-07:00",
    endsAt: "2026-09-03T18:00:00-07:00",

    // Found by watching what the speakers page requests when you open a
    // speaker: the site is a front end over this. 205 sessions with 99%
    // descriptions and 100% times, against 191 with 8% and 10% from reading
    // the rendered pages.
    sessionizeId: "zctro3uq",
    // Only the exhibitor list now. Sessions and speakers come from Sessionize
    // above, which is both complete and structured -- reading them off the
    // rendered pages as well would spend a model call per chunk to produce a
    // worse copy of data we already have.
    //
    // This one stays because Sessionize knows about sessions and speakers and
    // nothing at all about who is exhibiting. Booths exist only on the
    // conference's own site, so the two tiers cover different ground rather
    // than one superseding the other.
    sources: [
      {
        url: "https://apiworld.co/sponsors/",
        hint: "sponsor and exhibitor listing with company descriptions; these staff the expo booths",
      },
    ],
  },
];

export function findEvent(slug: string): EventDefinition {
  const event = EVENTS.find((candidate) => candidate.slug === slug);
  if (!event) {
    throw new Error(
      `Unknown event "${slug}". Known events: ${EVENTS.map((e) => e.slug).join(", ")}`
    );
  }
  return event;
}
