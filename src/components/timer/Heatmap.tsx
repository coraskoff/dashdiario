import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { dailyTotals, dailyCounts, formatDuration, heatmapLevel, isoDate } from "@/modules/timer/stats";
import type { TimerSession } from "@/modules/timer/types";

const LEVEL_BG = [
  "bg-muted/40",
  "bg-[oklch(0.88_0.04_150)]",
  "bg-[oklch(0.74_0.10_150)]",
  "bg-[oklch(0.60_0.14_150)]",
  "bg-[oklch(0.46_0.18_150)]",
] as const;

const DOW_LABELS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

/** Month-based calendar heatmap with navigation. */
export function Heatmap({ sessions }: { sessions: TimerSession[] }) {
  const today = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }, []);

  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), 1));

  const totals = useMemo(() => dailyTotals(sessions), [sessions]);
  const counts = useMemo(() => dailyCounts(sessions), [sessions]);

  const { weeks, monthTotal, daysWithFocus } = useMemo(() => {
    const year = cursor.getFullYear();
    const month = cursor.getMonth();
    const firstDay = new Date(year, month, 1);
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    // Monday = 0 .. Sunday = 6
    const offset = (firstDay.getDay() + 6) % 7;

    type Cell = { date: Date | null; sec: number; count: number; inMonth: boolean; isFuture: boolean; isToday: boolean };
    const cells: Cell[] = [];
    for (let i = 0; i < offset; i++) cells.push({ date: null, sec: 0, count: 0, inMonth: false, isFuture: false, isToday: false });
    let total = 0;
    let withFocus = 0;
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(year, month, day);
      const k = isoDate(d);
      const sec = totals.get(k) ?? 0;
      total += sec;
      if (sec > 0) withFocus++;
      cells.push({
        date: d,
        sec,
        count: counts.get(k) ?? 0,
        inMonth: true,
        isFuture: d > today,
        isToday: d.getTime() === today.getTime(),
      });
    }
    while (cells.length % 7 !== 0) cells.push({ date: null, sec: 0, count: 0, inMonth: false, isFuture: false, isToday: false });

    const weeks: Cell[][] = [];
    for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
    return { weeks, monthTotal: total, daysWithFocus: withFocus };
  }, [cursor, totals, counts, today]);

  const monthLabel = cursor.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  const isCurrentMonth = cursor.getFullYear() === today.getFullYear() && cursor.getMonth() === today.getMonth();

  const goPrev = () => setCursor(new Date(cursor.getFullYear(), cursor.getMonth() - 1, 1));
  const goNext = () => {
    if (isCurrentMonth) return;
    setCursor(new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1));
  };

  return (
    <div>
      {/* nav */}
      <div className="mb-4 flex items-center justify-between">
        <button
          onClick={goPrev}
          aria-label="Mês anterior"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
        >
          <ChevronLeft size={16} strokeWidth={1.75} />
        </button>
        <p className="text-sm font-medium tracking-tight capitalize">{monthLabel}</p>
        <button
          onClick={goNext}
          disabled={isCurrentMonth}
          aria-label="Próximo mês"
          className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
        >
          <ChevronRight size={16} strokeWidth={1.75} />
        </button>
      </div>

      {/* day-of-week header */}
      <div className="mb-2 grid grid-cols-7 gap-1.5 text-center text-[10px] uppercase tracking-widest text-muted-foreground">
        {DOW_LABELS.map((d) => (
          <div key={d}>{d}</div>
        ))}
      </div>

      {/* grid */}
      <div className="space-y-1.5">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1.5">
            {week.map((cell, di) => {
              if (!cell.inMonth || !cell.date) {
                return <div key={di} className="aspect-square" />;
              }
              const lvl = heatmapLevel(cell.sec);
              const tooltip = `${cell.date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })} · ${formatDuration(cell.sec)}${cell.count ? ` · ${cell.count} ${cell.count === 1 ? "sessão" : "sessões"}` : ""}`;
              return (
                <div
                  key={di}
                  title={tooltip}
                  className={`relative aspect-square rounded-md ${cell.isFuture ? "border border-dashed border-border/40 bg-transparent" : LEVEL_BG[lvl]} ${cell.isToday ? "ring-1 ring-foreground ring-offset-1 ring-offset-background" : ""} transition-transform hover:scale-105`}
                >
                  <span className={`absolute left-1 top-0.5 text-[10px] tabular-nums ${lvl >= 3 ? "text-background/80" : "text-muted-foreground/70"}`}>
                    {cell.date.getDate()}
                  </span>
                </div>
              );
            })}
          </div>
        ))}
      </div>

      {/* footer: month summary + legend */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border/60 pt-3 text-[11px] uppercase tracking-widest text-muted-foreground">
        <div className="flex items-center gap-3">
          <span>{formatDuration(monthTotal)} no mês</span>
          <span className="text-muted-foreground/50">·</span>
          <span>{daysWithFocus} {daysWithFocus === 1 ? "dia" : "dias"}</span>
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