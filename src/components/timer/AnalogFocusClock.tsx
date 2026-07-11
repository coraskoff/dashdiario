import { useEffect, useState } from "react";
import type { ActiveSession } from "@/modules/timer/types";

/**
 * Cronógrafo analógico que conta o foco pra cima.
 * Ponteiro de segundos varre suave (rAF próprio, isolado do resto da página).
 * Escala: segundos → 1 volta/min, minutos → 1 volta/hora, horas → 1 volta/12h.
 */
export function AnalogFocusClock({
  active,
  size = 340,
}: {
  active: ActiveSession;
  size?: number;
}) {
  const [ms, setMs] = useState(0);

  useEffect(() => {
    const compute = () => {
      const ref = active.pausedAt ?? Date.now();
      setMs(Math.max(0, ref - active.startedAt - active.pausedAccumMs));
    };
    compute();
    // 50ms → sweep suave (~20fps) sem depender de rAF, que o navegador
    // pausa em abas em segundo plano.
    const id = window.setInterval(compute, 50);
    return () => window.clearInterval(id);
  }, [active]);

  const totalSec = ms / 1000;
  const secAngle = ((totalSec % 60) / 60) * 360;
  const minAngle = (((totalSec / 60) % 60) / 60) * 360;
  const hourAngle = (((totalSec / 3600) % 12) / 12) * 360;

  const paused = active.pausedAt != null;

  // Paleta warm-sage, alinhada ao modo noturno existente do app.
  const tickMinor = "#31362b";
  const tickMajor = "#565d4b";
  const ring = "#242a1f";
  const hand = "#c3c8b4";
  const second = "#e7c9a0";
  const hub = "#c3c8b4";

  const ticks = Array.from({ length: 60 }, (_, i) => {
    const major = i % 5 === 0;
    const angle = i * 6;
    const outer = 96;
    const inner = major ? 84 : 89;
    return (
      <line
        key={i}
        x1={100}
        y1={100 - outer}
        x2={100}
        y2={100 - inner}
        stroke={major ? tickMajor : tickMinor}
        strokeWidth={major ? 1.6 : 0.8}
        strokeLinecap="round"
        transform={`rotate(${angle} 100 100)`}
      />
    );
  });

  return (
    <svg
      viewBox="0 0 200 200"
      width={size}
      height={size}
      style={{
        opacity: paused ? 0.4 : 1,
        transition: "opacity 300ms ease",
      }}
    >
      <circle cx={100} cy={100} r={98} fill="none" stroke={ring} strokeWidth={0.75} />
      {ticks}

      {/* Ponteiro de horas */}
      <line
        x1={100}
        y1={100}
        x2={100}
        y2={54}
        stroke={hand}
        strokeWidth={4}
        strokeLinecap="round"
        transform={`rotate(${hourAngle} 100 100)`}
      />
      {/* Ponteiro de minutos */}
      <line
        x1={100}
        y1={100}
        x2={100}
        y2={30}
        stroke={hand}
        strokeWidth={2.6}
        strokeLinecap="round"
        transform={`rotate(${minAngle} 100 100)`}
      />
      {/* Ponteiro de segundos */}
      <g transform={`rotate(${secAngle} 100 100)`}>
        <line
          x1={100}
          y1={112}
          x2={100}
          y2={20}
          stroke={second}
          strokeWidth={1}
          strokeLinecap="round"
        />
        <circle cx={100} cy={100} r={3.2} fill={second} />
      </g>

      <circle cx={100} cy={100} r={2} fill={hub} />
    </svg>
  );
}
