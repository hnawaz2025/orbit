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

  // A person you can actually go and meet, as opposed to a session you attend.
  // The distinction is the product, so it gets its own colour.
  person: "#0F766E",
  personWash: "#E3F1EF",

  background: "#F6F8FA",
  surface: "#FFFFFF",
  border: "#DDE3EA",
  hairline: "#C3CDD7",

  textPrimary: "#10161D",
  textSecondary: "#4E5C6A",
  textMuted: "#6C7A88",

  white: "#FFFFFF",
  error: "#B3261E",
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
};

export const radius = {
  card: 12,
  input: 12,
  pill: 999,
};

export const type = {
  display: { fontFamily: "Inter_700Bold", fontSize: 28, lineHeight: 34 },
  title: { fontFamily: "Inter_600SemiBold", fontSize: 20, lineHeight: 26 },
  cardTitle: { fontFamily: "Inter_600SemiBold", fontSize: 17, lineHeight: 23 },
  body: { fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 22 },
  reason: { fontFamily: "Inter_400Regular", fontSize: 15, lineHeight: 22 },
  meta: { fontFamily: "Inter_500Medium", fontSize: 13, lineHeight: 18 },
  label: { fontFamily: "Inter_600SemiBold", fontSize: 11, lineHeight: 14, letterSpacing: 0.8 },
};
