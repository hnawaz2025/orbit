// Orbit reads on a phone held at arm's length, in a convention centre, under
// bright overhead light, by someone walking. That constrains everything here:
// high contrast over subtlety, large tap targets, and colour used to encode
// urgency rather than decorate.

export const colors = {
  // Wayfinding blue. The colour of every "you are here" sign in every
  // convention centre, which is exactly the job.
  primary: "#12557F",
  primaryDark: "#0C3D5C",
  primaryWash: "#E7F0F6",

  // Reserved for time pressure -- a session starting inside the walk buffer,
  // a conflict in your plan. Nothing decorative is ever this colour, so it
  // always means "this is about to matter".
  urgent: "#C2410C",
  urgentWash: "#FDEDE4",
  // urgent on urgentWash measures 4.54:1, which is marginal at the 11pt the
  // day chip is set in. This is the same hue carried far enough to clear AA
  // properly (6.46:1) for text sitting on the wash.
  urgentInk: "#9A330A",

  // A person you can actually go and meet, as opposed to a session you attend.
  // The distinction is the product, so it gets its own colour.
  person: "#0F766E",
  personWash: "#E3F1EF",

  // A booth is open all day, so it is the least perishable thing in the corpus.
  // It was painted `urgent`, which broke the rule directly above -- spending
  // the alarm colour on the calmest content, on 25 exhibitors, regardless of
  // time. Slate says "recede" instead.
  venue: "#3F4C59",
  venueWash: "#E8ECF0",

  background: "#F6F8FA",
  surface: "#FFFFFF",
  border: "#DDE3EA",
  hairline: "#C3CDD7",

  textPrimary: "#10161D",
  textSecondary: "#4E5C6A",
  // Was #6C7A88, which measures 4.13:1 on the background -- under AA, in the
  // brightest environment this app will ever be used in. This is 5.45:1.
  textMuted: "#5A6773",

  white: "#FFFFFF",
  error: "#B3261E",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  // The gap between 16 and 24 is where card internals kept wanting to land.
  md2: 20,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  card: 12,
  input: 12,
  pill: 999,
};

// Time is a first-class visual element now, so digits are set differently from
// prose: anything showing a clock carries tabular figures, or the numbers
// jitter as the minute advances.
const TABULAR = { fontVariant: ["tabular-nums" as const] };

export const type = {
  display: { fontFamily: "Inter_700Bold", fontSize: 28, lineHeight: 34 },
  /** The clock on a results card. The largest glyphs on it. */
  timeHero: { fontFamily: "Inter_700Bold", fontSize: 22, lineHeight: 24, ...TABULAR },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 20, lineHeight: 26 },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 17, lineHeight: 23 },
  /**
   * The generated sentence. Raised from 15/22 because it is the product and
   * should not share a size with body copy.
   */
  reason: { fontFamily: "Inter_400Regular", fontSize: 16, lineHeight: 24 },
  body: { fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 22 },
  /** Room names. Heavier than meta, so place outranks metadata. */
  place: { fontFamily: "Inter_600SemiBold", fontSize: 14, lineHeight: 19 },
  meta: { fontFamily: "Inter_500Medium", fontSize: 13, lineHeight: 18 },
  timeSmall: { fontFamily: "Inter_600SemiBold", fontSize: 13, lineHeight: 16, ...TABULAR },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 11, lineHeight: 14, letterSpacing: 0.8 },
};
