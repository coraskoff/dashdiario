import { buildHeatmap, formatDuration, heatmapLevel } from "@/modules/timer/stats";
import type { TimerSession } from "@/modules/timer/types";

const LEVEL_BG = [
  "bg-muted/40",
  "bg-[oklch(0.88_0.04_150)]",
  "bg-[oklch(0.74_0.10_150)]",
  "bg-[oklch(0.60_0.14_150)]",
  "bg-[oklch(0.46_0.18_150)]",
] as const;

const DOW_LABELS = ["seg", "", "qua", "", "sex", "", "dom"];
const MONTH_LABELS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];

export function Heatmap({ sessions, weeks = 14 }: { sessions: TimerSession[]; weeks?: number }) {
  const { columns } = buildHeatmap(sessions, weeks);

  // month labels: print month label at the column where month changes
  const monthHeader: (string | null)[] = columns.map((c, i) => {
    if (i === 0) return MONTH_LABELS[c.weekStart.getMonth()];
    const prev = columns[i - 1].weekStart;
    if (prev.getMonth() !== c.weekStart.getMonth()) return MONTH_LABELS[c.weekStart.getMonth()];
    return null;
  });

  return (
    <div className="flex gap-2 overflow-x-auto pb-1">
      {/* day labels */}
      <div className="flex flex-col justify-between pr-1 pt-5 text-[10px] uppercase tracking-widest text-muted-foreground">
        {DOW_LABELS.map((d, i) => (
          <div key={i} className="h-3 leading-3">{d}</div>
        ))}
      </div>
      <div>
        {/* month header */}
        <div className="flex gap-1 mb-1 text-[10px] uppercase tracking-widest text-muted-foreground">
          {monthHeader.map((m, i) => (
            <div key={i} className="w-3">{m}</div>
          ))}
        </div>
        <div className="flex gap-1">
          {columns.map((col, ci) => (
            <div key={ci} className="flex flex-col gap-1">
              {col.days.map((d, di) => {
                const lvl = heatmapLevel(d.sec);
                const isFuture = d.date > new Date();
                const tooltip = `${d.date.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" })} · ${formatDuration(d.sec)}${d.count ? ` · ${d.count} ${d.count === 1 ? "sessão" : "sessões"}` : ""}`;
                return (
                  <div
                    key={di}
                    title={tooltip}
                    className={`h-3 w-3 rounded-[3px] ${isFuture ? "bg-transparent border border-border/40" : LEVEL_BG[lvl]} transition-transform hover:scale-110`}
                  />
                );
              })}
            </div>
          ))}
        </div>
        {/* legend */}
        <div className="mt-3 flex items-center gap-2 text-[10px] uppercase tracking-widest text-muted-foreground">
          <span>menos</span>
          {LEVEL_BG.map((c, i) => (
            <span key={i} className={`h-3 w-3 rounded-[3px] ${c}`} />
          ))}
          <span>mais</span>
        </div>
      </div>
    </div>
  );
}