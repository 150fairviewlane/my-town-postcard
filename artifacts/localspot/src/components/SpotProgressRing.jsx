const TOTAL = 15;
const CX = 24;
const CY = 24;
const RADIUS = 18;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

function ringColor(paidSpots) {
  if (paidSpots >= 15) return "#991b1b";
  if (paidSpots >= 12) return "#ef4444";
  if (paidSpots >= 8)  return "#f97316";
  return "#fbbf24";
}

/**
 * SVG circular progress ring showing how many of 15 spots are sold.
 * Color escalates: yellow (0-7) → orange (8-11) → light red (12-14) → dark red (15).
 * Accepts an optional `size` prop (default 48px). Only call for active/draft campaigns.
 */
export default function SpotProgressRing({ paidSpots = 0, size = 48 }) {
  const capped = Math.min(Math.max(0, paidSpots), TOTAL);
  const dashOffset = CIRCUMFERENCE * (1 - capped / TOTAL);
  const color = ringColor(capped);

  return (
    <div
      title="12+ sold = ready to print. 15 = sold out."
      style={{ display: "inline-flex", alignItems: "center", justifyContent: "center" }}
    >
      <svg width={size} height={size} viewBox="0 0 48 48" aria-label={`${capped} of ${TOTAL} spots sold`}>
        <circle
          cx={CX} cy={CY} r={RADIUS}
          fill="none"
          stroke="#e5e7eb"
          strokeWidth={4}
        />
        <circle
          cx={CX} cy={CY} r={RADIUS}
          fill="none"
          stroke={color}
          strokeWidth={4}
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={dashOffset}
          transform="rotate(-90 24 24)"
          style={{ transition: "stroke-dashoffset 0.35s ease, stroke 0.35s ease" }}
        />
        <text
          x={CX} y={CY}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={9}
          fontWeight="700"
          fill={color}
          fontFamily="sans-serif"
        >
          {capped}/{TOTAL}
        </text>
      </svg>
    </div>
  );
}
