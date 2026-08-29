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
