import { useMemo } from "react";
import {
  dailyTotals,
  dailyCounts,
  formatDuration,
  heatmapLevel,
  isoDate,
} from "@/modules/timer/stats";
import type { TimerSession } from "@/modules/timer/types";

const LEVEL_BG = [
  "bg-muted/40",
  "bg-[oklch(0.88_0.04_150)]",
  "bg-[oklch(0.74_0.10_150)]",
  "bg-[oklch(0.60_0.14_150)]",
  "bg-[oklch(0.46_0.18_150)]",
] as const;

const WEEKS = 14;
const DOW_LABELS = ["seg", "", "qua", "", "sex", "", "dom"];

/** GitHub-style heatmap: columns = weeks, rows = days. Each cell = 1 day. */
export function Heatmap({ sessions }: { sessions: TimerSession[] }) {
  const totals = useMemo(() => dailyTotals(sessions), [sessions]);
  const counts = useMemo(() => dailyCounts(sessions), [sessions]);

  const { columns, rangeTotal, daysWithFocus } = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    // anchor: Monday of current week
    const dow = (today.getDay() + 6) % 7;
    const monday = new Date(today);
    monday.setDate(today.getDate() - dow);
    // start: WEEKS-1 weeks before that Monday
    const start = new Date(monday);
    start.setDate(monday.getDate() - (WEEKS - 1) * 7);

    type Cell = { date: Date; sec: number; count: number; isFuture: boolean; isToday: boolean };
    const columns: Cell[][] = [];
    let total = 0;
    let withFocus = 0;
    for (let w = 0; w < WEEKS; w++) {
      const col: Cell[] = [];
      for (let d = 0; d < 7; d++) {
        const date = new Date(start);
        date.setDate(start.getDate() + w * 7 + d);
        const k = isoDate(date);
        const sec = totals.get(k) ?? 0;
        const isFuture = date > today;
        if (!isFuture) {
          total += sec;
          if (sec > 0) withFocus++;
        }
        col.push({
          date,
          sec,
          count: counts.get(k) ?? 0,
          isFuture,
          isToday: date.getTime() === today.getTime(),
        });
      }
      columns.push(col);
    }
    return { columns, rangeTotal: total, daysWithFocus: withFocus };
  }, [totals, counts]);

  return (
    <div>
      <div className="flex w-max max-w-full gap-1.5 overflow-x-auto pb-1">
        {/* row labels */}
        <div className="flex flex-col gap-1.5 pr-1 text-[10px] uppercase tracking-widest text-muted-foreground">
          {DOW_LABELS.map((d, i) => (
            <div key={i} className="flex h-3.5 items-center">
              {d}
            </div>
          ))}
        </div>
        {/* week columns */}
        <div className="flex shrink-0 gap-1.5">
          {columns.map((col, wi) => (
            <div key={wi} className="flex shrink-0 flex-col gap-1.5">
              {col.map((cell, di) => {
                if (cell.isFuture) {
                  return (
                    <div
                      key={di}
                      className="h-3.5 w-3.5 rounded-[3px] border border-dashed border-border/30"
                    />
                  );
                }
                const lvl = heatmapLevel(cell.sec);
                const tooltip = `${cell.date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })} · ${formatDuration(cell.sec)}${cell.count ? ` · ${cell.count} ${cell.count === 1 ? "sessão" : "sessões"}` : ""}`;
                return (
                  <div
                    key={di}
                    title={tooltip}
                    className={`h-3.5 w-3.5 rounded-[3px] ${LEVEL_BG[lvl]} ${cell.isToday ? "ring-1 ring-foreground ring-offset-1 ring-offset-background" : ""} transition-transform hover:scale-110`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* footer */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3 text-[11px] uppercase tracking-widest text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>
            {formatDuration(rangeTotal)} nas últimas {WEEKS} semanas
          </span>
          <span className="text-muted-foreground/50">·</span>
          <span>
            {daysWithFocus} {daysWithFocus === 1 ? "dia" : "dias"}
          </span>
        </div>
        <div className="flex items-center gap-1.5">
          <span>menos</span>
          {LEVEL_BG.map((c, i) => (
            <span key={i} className={`h-2.5 w-2.5 rounded-[3px] ${c}`} />
          ))}
          <span>mais</span>
        </div>
      </div>
    </div>
  );
}
