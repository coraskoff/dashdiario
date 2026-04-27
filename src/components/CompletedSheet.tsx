import { useMemo } from "react";
import { Check, CheckCheck, RotateCcw, Trash2 } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import { projectColor } from "@/modules/projects/api";
import { todayIso } from "@/modules/tasks/buckets";
import type { Task } from "@/modules/tasks/types";

interface Props {
  tasks: Task[];
  projectsById: Record<string, { id: string; name: string; color: string | null }>;
  showProjectDot: boolean;
  onReopen: (t: Task) => void;
  onDelete: (t: Task) => void;
}

export function CompletedSheet({
  tasks,
  projectsById,
  showProjectDot,
  onReopen,
  onDelete,
}: Props) {
  const groups = useMemo(() => {
    const map = new Map<string, Task[]>();
    for (const t of tasks) {
      const stamp = t.completed_at ?? t.updated_at;
      const d = new Date(stamp);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(t);
    }
    return Array.from(map.entries());
  }, [tasks]);

  const total = tasks.length;

  return (
    <Sheet>
      <SheetTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 text-muted-foreground hover:text-foreground"
          aria-label={`Concluídas (${total})`}
          title="Concluídas"
        >
          <CheckCheck className="h-4 w-4" />
          {total > 0 && (
            <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-foreground px-1 text-[10px] font-medium tabular-nums text-background">
              {total > 99 ? "99+" : total}
            </span>
          )}
        </Button>
      </SheetTrigger>
      <SheetContent side="right" className="flex w-full flex-col gap-0 p-0 sm:max-w-md">
        <SheetHeader className="border-b px-6 py-5 text-left">
          <SheetTitle className="text-2xl font-semibold tracking-tight">Concluídas</SheetTitle>
          <SheetDescription>
            {total === 0
              ? "Ainda nada por aqui. Marque uma tarefa como feita."
              : `${total} ${total === 1 ? "tarefa arquivada" : "tarefas arquivadas"}.`}
          </SheetDescription>
        </SheetHeader>

        <ScrollArea className="flex-1">
          {total === 0 ? (
            <div className="px-6 py-16 text-center text-sm text-muted-foreground">
              Cada coisa concluída pousa aqui — para que o presente respire.
            </div>
          ) : (
            <div className="divide-y">
              {groups.map(([dayIso, items]) => (
                <section key={dayIso} className="px-6 py-4">
                  <h3 className="mb-2 text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                    {formatGroupDate(dayIso)}
                  </h3>
                  <ul className="space-y-1">
                    {items.map((t) => {
                      const project = t.project_id ? projectsById[t.project_id] : null;
                      return (
                        <li
                          key={t.id}
                          className="group flex items-start gap-2 rounded-md px-2 py-2 hover:bg-secondary/60"
                        >
                          <Check className="mt-1 h-3 w-3 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              {showProjectDot && project && (
                                <span
                                  aria-hidden
                                  className="h-1.5 w-1.5 shrink-0 rounded-full"
                                  style={{ background: projectColor(project) }}
                                  title={project.name}
                                />
                              )}
                              <p className="truncate text-sm text-muted-foreground line-through">
                                {t.title}
                              </p>
                            </div>
                            {t.completed_at && (
                              <p className="mt-0.5 text-[10px] tabular-nums text-muted-foreground/60">
                                {formatTime(t.completed_at)}
                              </p>
                            )}
                          </div>
                          <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                            <button
                              onClick={() => onReopen(t)}
                              className="rounded p-1 text-muted-foreground hover:bg-card hover:text-foreground"
                              aria-label="Reabrir"
                              title="Reabrir"
                            >
                              <RotateCcw className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => onDelete(t)}
                              className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                              aria-label="Excluir"
                              title="Excluir"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                </section>
              ))}
            </div>
          )}
        </ScrollArea>
      </SheetContent>
    </Sheet>
  );
}

function formatGroupDate(iso: string): string {
  const today = todayIso();
  const yest = (() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  })();
  if (iso === today) return "Hoje";
  if (iso === yest) return "Ontem";
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", {
    weekday: "short",
    day: "2-digit",
    month: "short",
  }).format(new Date(y, m - 1, d));
}

function formatTime(stamp: string): string {
  const d = new Date(stamp);
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}