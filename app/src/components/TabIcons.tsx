import Svg, { Circle, Ellipse, Line, Path, Rect } from "react-native-svg";

// Two icons, drawn rather than imported: the app has no icon library, and
// pulling one in for two glyphs is weight the bundle does not need.

/** An orbit: the thing you are looking for, and the path that reaches it. */
export function AskIcon({ color, size = 24 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Ellipse cx="12" cy="12" rx="10" ry="5.5" stroke={color} strokeWidth="1.8" />
      <Circle cx="12" cy="12" r="3" fill={color} />
    </Svg>
  );
}

/** A day with something on it. */
export function PlanIcon({ color, size = 24 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
      <Rect x="3" y="5" width="18" height="16" rx="2.5" stroke={color} strokeWidth="1.8" />
      <Line x1="3" y1="10" x2="21" y2="10" stroke={color} strokeWidth="1.8" />
      <Path d="M7 3v3M17 3v3" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
      <Rect x="6.5" y="13" width="7" height="2.6" rx="1.3" fill={color} />
    </Svg>
  );
}

/** The LinkedIn mark, drawn rather than imported. */
export function LinkedInIcon({ color, size = 22 }: { color: string; size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Path d="M4.98 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zM3 9h4v12H3z" />
      <Path d="M10 9h3.8v1.7h.05c.53-.95 1.83-1.95 3.76-1.95 4.02 0 4.76 2.5 4.76 5.75V21h-4v-5.6c0-1.34-.03-3.06-1.9-3.06-1.9 0-2.19 1.45-2.19 2.96V21h-4z" />
    </Svg>
  );
}
