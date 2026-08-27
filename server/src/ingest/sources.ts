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
    sources: [
      { url: "https://apiworld.co/conference/agenda/", hint: "the conference agenda: sessions with times and tracks" },
      { url: "https://apiworld.co/speakers/", hint: "speaker listing: names, job titles, companies" },
      { url: "https://apiworld.co/expo/", hint: "the expo floor: sponsor and exhibitor booths" },
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
