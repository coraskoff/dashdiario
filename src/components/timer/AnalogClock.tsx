import { useMemo } from "react";

interface Props {
  /** elapsed seconds (count-up) or remaining seconds shown to user */
  elapsedSeconds: number;
  /** total planned seconds; when set we render a remaining-arc */
  plannedSeconds?: number | null;
  size?: number;
}

/**
 * Minimal analog clock face. No numerals; 12 ticks (4 emphasized).
 * - count-up: minute + second hands rotating from 12 by elapsed time
 * - count-down: same hands + a thin remaining arc
 * Pure SVG, deterministic, no animation libs.
 */
export function AnalogClock({ elapsedSeconds, plannedSeconds, size = 360 }: Props) {
  const r = size / 2;
  const cx = r;
  const cy = r;
  const faceR = r - 2;

  const isCountdown = !!plannedSeconds && plannedSeconds > 0;
  const remaining = isCountdown
    ? Math.max(0, (plannedSeconds as number) - elapsedSeconds)
    : elapsedSeconds;

  // Hand angles. Minute hand makes a full revolution per 60 minutes.
  // Second hand: full revolution per 60s.
  const minutes = remaining / 60;
  const seconds = remaining % 60;
  const minuteAngle = (minutes % 60) * 6; // deg
  const secondAngle = seconds * 6;

  const ticks = useMemo(() => {
    const arr: { x1: number; y1: number; x2: number; y2: number; emphasis: boolean }[] = [];
    for (let i = 0; i < 12; i++) {
      const a = (i * 30 - 90) * (Math.PI / 180);
      const inner = i % 3 === 0 ? faceR - 14 : faceR - 8;
      const outer = faceR - 2;
      arr.push({
        x1: cx + Math.cos(a) * inner,
        y1: cy + Math.sin(a) * inner,
        x2: cx + Math.cos(a) * outer,
        y2: cy + Math.sin(a) * outer,
        emphasis: i % 3 === 0,
      });
    }
    return arr;
  }, [cx, cy, faceR]);

  // Remaining arc (for countdown only)
  const arcPath = useMemo(() => {
    if (!isCountdown) return null;
    const fraction = Math.min(1, Math.max(0, remaining / (plannedSeconds as number)));
    if (fraction <= 0) return "";
    const angle = fraction * 360;
    const endA = (angle - 90) * (Math.PI / 180);
    const startA = (-90) * (Math.PI / 180);
    const arcR = faceR - 22;
    const x1 = cx + Math.cos(startA) * arcR;
    const y1 = cy + Math.sin(startA) * arcR;
    const x2 = cx + Math.cos(endA) * arcR;
    const y2 = cy + Math.sin(endA) * arcR;
    const large = angle > 180 ? 1 : 0;
    return `M ${x1} ${y1} A ${arcR} ${arcR} 0 ${large} 1 ${x2} ${y2}`;
  }, [cx, cy, faceR, isCountdown, remaining, plannedSeconds]);

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className="select-none"
      role="img"
      aria-label="Relógio de foco"
    >
      {/* face */}
      <circle cx={cx} cy={cy} r={faceR} fill="none" stroke="currentColor" strokeOpacity={0.08} />

      {/* ticks */}
      {ticks.map((t, i) => (
        <line
          key={i}
          x1={t.x1}
          y1={t.y1}
          x2={t.x2}
          y2={t.y2}
          stroke="currentColor"
          strokeOpacity={t.emphasis ? 0.6 : 0.25}
          strokeWidth={t.emphasis ? 1.5 : 1}
          strokeLinecap="round"
        />
      ))}

      {/* remaining arc */}
      {arcPath && (
        <path
          d={arcPath}
          fill="none"
          stroke="currentColor"
          strokeOpacity={0.85}
          strokeWidth={1.25}
          strokeLinecap="round"
        />
      )}

      {/* minute hand */}
      <line
        x1={cx}
        y1={cy}
        x2={cx}
        y2={cy - faceR + 50}
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
        transform={`rotate(${minuteAngle} ${cx} ${cy})`}
      />
      {/* second hand */}
      <line
        x1={cx}
        y1={cy + 8}
        x2={cx}
        y2={cy - faceR + 28}
        stroke="currentColor"
        strokeOpacity={0.55}
        strokeWidth={1}
        strokeLinecap="round"
        transform={`rotate(${secondAngle} ${cx} ${cy})`}
      />
      <circle cx={cx} cy={cy} r={3.5} fill="currentColor" />
    </svg>
  );
}