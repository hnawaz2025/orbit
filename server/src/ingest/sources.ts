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
    // These URLs were verified by rendering them, not by reading the site
    // navigation. The pages the nav calls "Agenda" and "Expo" are shells --
    // ~2.5k characters of menu and no sessions. The four below are where the
    // conference actually publishes its content.
    sources: [
      {
        url: "https://apiworld.co/conference/schedule/",
        hint: "the full session schedule: talk titles, speaker names, tracks, room locations and pass tiers",
      },
      {
        url: "https://apiworld.co/conference/keynotes/",
        hint: "keynote sessions with speaker, room location, day and start time",
      },
      {
        url: "https://apiworld.co/speakers/",
        hint: "speaker listing, each entry formatted as 'Name Job Title @ Company'",
      },
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
