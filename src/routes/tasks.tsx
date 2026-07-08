import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useMemo, useRef, useState } from "react";
import { useMobileFab } from "@/routes/__root";
import { toast } from "sonner";
import { ArrowRight, Calendar as CalendarIcon, Check, CheckCheck, ChevronLeft, ChevronRight, FolderInput, GripVertical, Pencil, Plus, RotateCcw, Timer as TimerIcon, Trash2, X } from "lucide-react";
import { StartFocusDialog } from "@/components/timer/StartFocusDialog";
import { Pulse } from "@/components/Pulse";
import {
  createTask,
  deleteTask,
  fetchTasks,
  reorderTasks,
  setTaskDueDate,
  setTaskProject,
  setTaskStatus,
  updateTask,
} from "@/modules/tasks/api";
import type { Bucket, Task, TaskStatus } from "@/modules/tasks/types";
import {
  bucketDueDate,
  groupByBucket,
  toIsoDate,
  todayIso,
  tomorrowIso,
} from "@/modules/tasks/buckets";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
} from "@/components/ui/drawer";
import { useIsMobile } from "@/hooks/use-mobile";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import {
  createProject,
  deleteProject,
  fetchProjects,
  projectColor,
} from "@/modules/projects/api";
import type { Project } from "@/modules/projects/types";
import { ProjectTabs, type ActiveProject } from "@/components/ProjectTabs";
import { CompletedSheet } from "@/components/CompletedSheet";

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tarefas — Foco" },
      {
        name: "description",
        content: "Kanban semanal: Hoje, Amanhã e Depois.",
      },
    ],
  }),
  component: TasksPage,
});

/* ----------------------------- Page ----------------------------- */

function TasksPage() {
  const qc = useQueryClient();
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: fetchTasks,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const [activeProject, setActiveProject] = useState<ActiveProject>("all");
  const [view, setView] = useState<"backlog" | "week">("week");
  React.useEffect(() => {
    const saved = localStorage.getItem("tasks:view");
    // "day" era o nome antigo do modo focado; hoje ele vive dentro de "week".
    if (saved === "backlog" || saved === "week") setView(saved);
  }, []);
  const changeView = (v: "backlog" | "week") => {
    setView(v);
    localStorage.setItem("tasks:view", v);
  };
  // Dia selecionado no card de foco (Hoje) — permite navegar entre dias.
  const [selectedIso, setSelectedIso] = useState(todayIso());
  const todayQuickAddRef = useRef<HTMLInputElement>(null);
  useMobileFab(() => todayQuickAddRef.current?.focus());

  // Filter tasks by active project tab
  const visibleTasks = useMemo(() => {
    if (activeProject === "all") return tasks;
    return tasks.filter((t) => t.project_id === activeProject);
  }, [tasks, activeProject]);

  const buckets = useMemo(() => groupByBucket(visibleTasks), [visibleTasks]);

  // Bento: linha 2 mostra os 3 dias após amanhã (hoje+2 … hoje+4).
  const next3Isos = useMemo(
    () => [2, 3, 4].map((n) => addDaysIso(todayIso(), n)),
    [],
  );
  // Backlog = tudo que é pendente e não tem data.
  const backlogItems = useMemo(
    () => visibleTasks.filter((t) => t.status === "pending" && !t.due_date),
    [visibleTasks],
  );
  const tasksByDate = useMemo(() => {
    const set = new Set(next3Isos);
    const map: Record<string, Task[]> = {};
    for (const t of visibleTasks) {
      if (t.status === "pending" && t.due_date && set.has(t.due_date)) {
        (map[t.due_date] ??= []).push(t);
      }
    }
    return map;
  }, [visibleTasks, next3Isos]);
  // Tudo que está marcado para depois desses 3 dias, em ordem cronológica.
  const laterTasks = useMemo(
    () =>
      visibleTasks
        .filter(
          (t) => t.status === "pending" && !!t.due_date && t.due_date > next3Isos[2],
        )
        .sort((a, b) => a.due_date!.localeCompare(b.due_date!)),
    [visibleTasks, next3Isos],
  );

  // Counts per project (pending only — that's what matters for scanning)
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0 };
    for (const t of tasks) {
      if (t.status !== "pending") continue;
      c.all += 1;
      if (t.project_id) c[t.project_id] = (c[t.project_id] ?? 0) + 1;
    }
    return c;
  }, [tasks]);

  // When creating a task, attach to active project (null when "all")
  const newTaskProjectId = activeProject === "all" ? null : activeProject;

  const projectsById = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p])),
    [projects],
  );

  const create = useMutation({
    mutationFn: createTask,
    onMutate: async (input) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const prev = qc.getQueryData<Task[]>(["tasks"]);
      const now = new Date().toISOString();
      const optimistic: Task = {
        id: `tmp-${Math.random().toString(36).slice(2)}`,
        title: input.title.trim(),
        description: input.description?.trim() || null,
        status: "pending",
        due_date: input.due_date ?? null,
        project_id: input.project_id ?? null,
        completed_at: null,
        created_at: now,
        updated_at: now,
        position: null,
      };
      qc.setQueryData<Task[]>(["tasks"], (old) => [optimistic, ...(old ?? [])]);
      return { prev, tmpId: optimistic.id };
    },
    onSuccess: (created, _input, ctx) => {
      qc.setQueryData<Task[]>(["tasks"], (old) =>
        (old ?? []).map((t) => (t.id === ctx?.tmpId ? created : t)),
      );
    },
    onError: (e: Error, _input, ctx) => {
      if (ctx?.prev) qc.setQueryData(["tasks"], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const createProj = useMutation({
    mutationFn: createProject,
    onSuccess: (p) => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      setActiveProject(p.id);
      toast.success(`Projeto “${p.name}” criado`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const removeProj = useMutation({
    mutationFn: deleteProject,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["projects"] });
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setActiveProject("all");
      toast.success("Projeto removido");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const move = useMutation({
    mutationFn: ({ id, bucket }: { id: string; bucket: Bucket }) =>
      setTaskDueDate(id, bucketDueDate(bucket)),
    onMutate: async ({ id, bucket }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const prev = qc.getQueryData<Task[]>(["tasks"]);
      qc.setQueryData<Task[]>(["tasks"], (old) =>
        (old ?? []).map((t) =>
          t.id === id ? { ...t, due_date: bucketDueDate(bucket) } : t,
        ),
      );
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["tasks"], ctx.prev);
      toast.error(e.message);
    },
  });

  const toggle = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      setTaskStatus(id, status),
    onMutate: async ({ id, status }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const prev = qc.getQueryData<Task[]>(["tasks"]);
      const stamp = status === "completed" ? new Date().toISOString() : null;
      qc.setQueryData<Task[]>(["tasks"], (old) =>
        (old ?? []).map((t) =>
          t.id === id ? { ...t, status, completed_at: stamp } : t,
        ),
      );
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["tasks"], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const remove = useMutation({
    mutationFn: deleteTask,
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const prev = qc.getQueryData<Task[]>(["tasks"]);
      qc.setQueryData<Task[]>(["tasks"], (old) =>
        (old ?? []).filter((t) => t.id !== id),
      );
      return { prev };
    },
    onSuccess: () => toast.success("Tarefa removida"),
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["tasks"], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const update = useMutation({
    mutationFn: ({ id, title, description, due_date, project_id }: { id: string; title: string; description: string; due_date: string | null; project_id: string | null }) =>
      updateTask(id, { title, description, due_date, project_id }),
    onMutate: async ({ id, title, description }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const prev = qc.getQueryData<Task[]>(["tasks"]);
      qc.setQueryData<Task[]>(["tasks"], (old) =>
        (old ?? []).map((t) =>
          t.id === id ? { ...t, title: title.trim(), description: description.trim() || null } : t,
        ),
      );
      return { prev };
    },
    onSuccess: () => toast.success("Tarefa atualizada"),
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["tasks"], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const setProject = useMutation({
    mutationFn: ({ id, projectId }: { id: string; projectId: string | null }) =>
      setTaskProject(id, projectId),
    onMutate: async ({ id, projectId }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const prev = qc.getQueryData<Task[]>(["tasks"]);
      qc.setQueryData<Task[]>(["tasks"], (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, project_id: projectId } : t)),
      );
      return { prev };
    },
    onSuccess: () => toast.success("Projeto atualizado"),
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["tasks"], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const setDate = useMutation({
    mutationFn: ({ id, date }: { id: string; date: string | null }) =>
      setTaskDueDate(id, date),
    onMutate: async ({ id, date }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const prev = qc.getQueryData<Task[]>(["tasks"]);
      qc.setQueryData<Task[]>(["tasks"], (old) =>
        (old ?? []).map((t) => (t.id === id ? { ...t, due_date: date } : t)),
      );
      return { prev };
    },
    onError: (e: Error, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["tasks"], ctx.prev);
      toast.error(e.message);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const reorder = useMutation({
    mutationFn: ({ ids }: { ids: string[] }) => reorderTasks(ids),
    onMutate: async ({ ids }) => {
      await qc.cancelQueries({ queryKey: ["tasks"] });
      const prev = qc.getQueryData<Task[]>(["tasks"]);
      const posMap = new Map(ids.map((id, i) => [id, i * 10]));
      qc.setQueryData<Task[]>(["tasks"], (old) =>
        (old ?? []).map((t) =>
          posMap.has(t.id) ? { ...t, position: posMap.get(t.id)! } : t,
        ),
      );
      return { prev };
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(["tasks"], ctx.prev);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const pendingTotal = visibleTasks.filter((t) => t.status === "pending").length;
  const completedTasks = useMemo(
    () =>
      visibleTasks
        .filter((t) => t.status === "completed")
        .sort((a, b) =>
          (b.completed_at ?? b.updated_at).localeCompare(a.completed_at ?? a.updated_at),
        ),
    [visibleTasks],
  );
  // Modo Hoje — tarefas do dia selecionado (pendentes por vencimento,
  // concluídas pelo dia em que foram feitas, estilo diário de papel)
  const dayPending = useMemo(() => {
    if (selectedIso === todayIso()) {
      // Hoje também acumula o que ficou atrasado — não existe uma seção
      // separada de "atrasadas", tudo que já venceu aparece junto no dia.
      return visibleTasks.filter(
        (t) => t.status === "pending" && !!t.due_date && t.due_date <= selectedIso,
      );
    }
    return visibleTasks.filter(
      (t) => t.status === "pending" && t.due_date === selectedIso,
    );
  }, [visibleTasks, selectedIso]);
  const completedOnDay = useMemo(
    () =>
      completedTasks.filter(
        (t) => t.completed_at && toIsoDate(new Date(t.completed_at)) === selectedIso,
      ),
    [completedTasks, selectedIso],
  );

  const columnHandlers = {
    onToggle: (t: Task) =>
      toggle.mutate({
        id: t.id,
        status: t.status === "pending" ? "completed" : "pending",
      }),
    onEdit: (t: Task) => setEditingId(t.id),
    onOpen: (t: Task) => setDetailId(t.id),
    onDelete: (t: Task) => remove.mutate(t.id),
    onMove: (id: string, bucket: Bucket) => move.mutate({ id, bucket }),
    onReorder: (ids: string[]) => reorder.mutate({ ids }),
    onSetDate: (id: string, date: string | null) => setDate.mutate({ id, date }),
    onSetProject: (id: string, projectId: string | null) =>
      setProject.mutate({ id, projectId }),
    editingId,
    onSaveEdit: (id: string, title: string, description: string) => {
      const task = tasks.find((t) => t.id === id);
      update.mutate({ id, title, description, due_date: task?.due_date ?? null, project_id: task?.project_id ?? null });
      setEditingId(null);
    },
    onCancelEdit: () => setEditingId(null),
    projectsById,
    projects,
    showProjectDot: activeProject === "all",
  };

  const detailTask = useMemo(
    () => (detailId ? tasks.find((t) => t.id === detailId) ?? null : null),
    [detailId, tasks],
  );

  return (
    <div className="space-y-10">
      {/* Header — typographic anchor, not a card */}
      <header className="flex items-end justify-between gap-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {view === "backlog" ? "Sem data definida" : weekRangeLabel()}
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">
            {view === "backlog" ? "Backlog." : "Sua semana."}
          </h1>
        </div>
        <div className="flex items-center gap-4">
          <div className="inline-flex items-center gap-0.5 rounded-lg bg-muted/70 p-0.5">
            <button
              onClick={() => changeView("backlog")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-all",
                view === "backlog"
                  ? "bg-card font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Backlog
            </button>
            <button
              onClick={() => changeView("week")}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm transition-all",
                view === "week"
                  ? "bg-card font-medium text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Geral
            </button>
          </div>
          <div className="hidden text-right text-sm text-muted-foreground md:block">
            <span className="tabular-nums text-foreground">{pendingTotal}</span>{" "}
            {pendingTotal === 1 ? "tarefa pendente" : "tarefas pendentes"}
          </div>
          <CompletedSheet
            tasks={completedTasks}
            projectsById={projectsById}
            showProjectDot={activeProject === "all"}
            onReopen={(t) => toggle.mutate({ id: t.id, status: "pending" })}
            onDelete={(t) => remove.mutate(t.id)}
          />
        </div>
      </header>

      {/* Project tabs — keyboard navigable: Tab to focus, ←/→ to switch */}
      <ProjectTabs
        projects={projects}
        active={activeProject}
        onChange={setActiveProject}
        onCreate={(name) => createProj.mutate(name)}
        onDelete={(id) => removeProj.mutate(id)}
        counts={counts}
      />

      {/* Modo Backlog — itens sem data, no formato do card de foco */}
      {view === "backlog" && (
        <BacklogCard
          tasks={backlogItems}
          onAdd={(title) =>
            create.mutate(
              { title, due_date: null, project_id: newTaskProjectId },
              { onSuccess: () => toast.success("Guardada sem data") },
            )
          }
          loading={isLoading}
          quickAddRef={todayQuickAddRef}
          {...columnHandlers}
        />
      )}

      {view === "week" && (
      <>
      {/* Bento linha 1 — Hoje dominante + Amanhã estreito */}
      <div className="grid items-stretch gap-5 md:grid-cols-[1.8fr_1fr]">
        <DayFocus
          iso={selectedIso}
          tasks={dayPending}
          completedOnDay={completedOnDay}
          onNavigate={setSelectedIso}
          onAdd={(title) =>
            create.mutate({ title, due_date: selectedIso, project_id: newTaskProjectId })
          }
          loading={isLoading}
          quickAddRef={todayQuickAddRef}
          {...columnHandlers}
        />
        <DayColumn
          dayNumber={dayNumber(tomorrowIso())}
          weekday={weekdayLabel(tomorrowIso())}
          label="Amanhã"
          tasks={buckets.tomorrow}
          bucket="tomorrow"
          onAdd={(title) =>
            create.mutate({ title, due_date: tomorrowIso(), project_id: newTaskProjectId })
          }
          loading={isLoading}
          {...columnHandlers}
          emptyText="Nada agendado."
        />
      </div>

      {/* Bento linha 2 — os 3 dias seguintes */}
      <div className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:grid md:snap-none md:grid-cols-3 md:overflow-visible md:px-0 md:pb-0">
        {next3Isos.map((iso) => (
          <MiniDayCard
            key={iso}
            iso={iso}
            tasks={tasksByDate[iso] ?? []}
            onAdd={(title: string) =>
              create.mutate({ title, due_date: iso, project_id: newTaskProjectId })
            }
            {...columnHandlers}
          />
        ))}
      </div>

      {/* Linha 3 — tudo que está marcado para depois desses dias */}
      {laterTasks.length > 0 && (
        <section className="pt-2">
          <div className="flex items-center gap-3 pb-4">
            <div className="h-px flex-1 bg-border/70" />
            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Mais adiante
            </span>
            <div className="h-px flex-1 bg-border/70" />
          </div>
          <div className="flex flex-wrap gap-2">
            {laterTasks.map((t) => (
              <LaterChip key={t.id} task={t} {...columnHandlers} />
            ))}
          </div>
        </section>
      )}
      </>
      )}

      <TaskDetailPanel
        task={detailTask}
        open={!!detailTask}
        onOpenChange={(o) => !o && setDetailId(null)}
        projectsById={projectsById}
        projects={projects}
        onToggle={(t) =>
          toggle.mutate({ id: t.id, status: t.status === "pending" ? "completed" : "pending" })
        }
        onEdit={(t) => {
          setDetailId(null);
          setEditingId(t.id);
        }}
        onDelete={(t) => {
          setDetailId(null);
          remove.mutate(t.id);
        }}
        onMove={(id, bucket) => move.mutate({ id, bucket })}
        onSetDate={(id, date) => setDate.mutate({ id, date })}
        onSetProject={(id, projectId) => setProject.mutate({ id, projectId })}
      />
    </div>
  );
}

/* ---------------------- Week strip (top row) ---------------------- */

interface ColumnHandlers {
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
  onOpen: (t: Task) => void;
  onDelete: (t: Task) => void;
  onMove: (id: string, bucket: Bucket) => void;
  onReorder: (ids: string[]) => void;
  onSetDate: (id: string, date: string | null) => void;
  onSetProject: (id: string, projectId: string | null) => void;
  editingId: string | null;
  onSaveEdit: (id: string, title: string, description: string) => void;
  onCancelEdit: () => void;
  projectsById: Record<string, { id: string; name: string; color: string | null }>;
  projects: Project[];
  showProjectDot: boolean;
}

/* ---------------------- Backlog card (itens sem data) ---------------------- */

function BacklogCard({
  tasks,
  onAdd,
  loading,
  quickAddRef,
  ...handlers
}: ColumnHandlers & {
  tasks: Task[];
  onAdd: (title: string) => void;
  loading: boolean;
  quickAddRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [drag, setDrag] = useState(false);
  const pending = tasks.filter((t) => t.status === "pending");

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const id = e.dataTransfer.getData("text/task-id");
        if (id) handlers.onMove(id, "week"); // solta no backlog = remove a data
      }}
      className={`mx-auto flex w-full max-w-2xl flex-col rounded-2xl border bg-card transition-colors ${
        drag ? "border-foreground/40 bg-secondary/60" : "border-border"
      }`}
    >
      <header className="flex items-center justify-between gap-4 px-6 pt-6">
        <div className="flex flex-col">
          <span className="text-sm font-semibold text-foreground">Backlog</span>
          <span className="text-xs text-muted-foreground">o que vem sem hora</span>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {pending.length}
        </span>
      </header>

      <div className="px-6 pt-4">
        <QuickAdd
          placeholder="Anotar uma ideia, meta ou recado…"
          onAdd={onAdd}
          inputRef={quickAddRef}
        />
      </div>

      <ul className="flex-1 px-3 pb-4 pt-2">
        {loading && (
          <li className="flex items-center justify-center px-3 py-8">
            <Pulse size={10} />
          </li>
        )}
        {!loading && pending.length === 0 && (
          <li className="px-3 py-10 text-sm text-muted-foreground">
            Tudo já tem dia. Use aqui para guardar o que vem sem hora.
          </li>
        )}
        {pending.map((t) =>
          handlers.editingId === t.id ? (
            <EditRow
              key={t.id}
              task={t}
              onSave={(title, desc) => handlers.onSaveEdit(t.id, title, desc)}
              onCancel={handlers.onCancelEdit}
            />
          ) : (
            <TaskRow key={t.id} task={t} accent {...handlers} />
          ),
        )}
      </ul>
    </section>
  );
}

/* ---------------------- Day focus (modo Hoje) ---------------------- */

function DayFocus({
  iso,
  tasks,
  completedOnDay,
  onNavigate,
  onAdd,
  loading,
  quickAddRef,
  ...handlers
}: ColumnHandlers & {
  iso: string;
  tasks: Task[];
  completedOnDay: Task[];
  onNavigate: (iso: string) => void;
  onAdd: (title: string) => void;
  loading: boolean;
  quickAddRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [drag, setDrag] = useState(false);
  const pending = tasks.filter((t) => t.status === "pending");
  const isToday = iso === todayIso();

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setDrag(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const id = e.dataTransfer.getData("text/task-id");
        if (id) handlers.onSetDate(id, iso);
      }}
      className={`flex h-full min-h-[420px] w-full flex-col rounded-2xl border bg-card transition-colors ${
        drag ? "border-foreground/40 bg-secondary/60" : "border-border"
      }`}
    >
      <header className="flex items-center justify-between gap-4 px-6 pt-6">
        <div className="group/nav flex items-baseline gap-1">
          <button
            onClick={() => onNavigate(addDaysIso(iso, -1))}
            aria-label="Dia anterior"
            className="self-center rounded p-1 text-muted-foreground/0 transition-colors group-hover/nav:text-muted-foreground/60 hover:!text-foreground"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span
            className={`text-5xl font-semibold tabular-nums leading-none ${
              isToday ? "text-foreground" : "text-muted-foreground"
            }`}
          >
            {dayNumber(iso)}
          </span>
          <div className="ml-2 flex flex-col">
            <span className="text-sm font-semibold text-foreground">
              {relDayName(iso)}
            </span>
            <span className="text-xs text-muted-foreground">
              {weekdayLabel(iso)}
            </span>
          </div>
          <button
            onClick={() => onNavigate(addDaysIso(iso, 1))}
            aria-label="Próximo dia"
            className="self-center rounded p-1 text-muted-foreground/0 transition-colors group-hover/nav:text-muted-foreground/60 hover:!text-foreground"
          >
            <ChevronRight className="h-4 w-4" />
          </button>
          {!isToday && (
            <button
              onClick={() => onNavigate(todayIso())}
              className="ml-2 text-xs text-muted-foreground underline decoration-dotted underline-offset-4 transition-colors hover:text-foreground"
            >
              voltar a hoje
            </button>
          )}
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {pending.length}
        </span>
      </header>

      <div className="px-6 pt-4">
        <QuickAdd
          placeholder={isToday ? "O que move o dia?" : "Adicionar neste dia…"}
          onAdd={onAdd}
          inputRef={quickAddRef}
        />
      </div>

      <ul className="flex-1 px-3 pb-4 pt-2">
        {loading && (
          <li className="flex items-center justify-center px-3 py-8">
            <Pulse size={10} />
          </li>
        )}
        {!loading && pending.length === 0 && completedOnDay.length === 0 && (
          <li className="px-3 py-10 text-sm text-muted-foreground">
            {isToday
              ? "Dia limpo. Capriche em uma coisa só."
              : iso < todayIso()
                ? "Nada registrado neste dia."
                : "Nada agendado."}
          </li>
        )}
        {pending.map((t) =>
          handlers.editingId === t.id ? (
            <EditRow
              key={t.id}
              task={t}
              onSave={(title, desc) => handlers.onSaveEdit(t.id, title, desc)}
              onCancel={handlers.onCancelEdit}
            />
          ) : (
            <TaskRow key={t.id} task={t} accent {...handlers} />
          ),
        )}
        {completedOnDay.length > 0 && (
          <>
            {pending.length > 0 && (
              <li aria-hidden className="mx-3 my-2 h-px bg-border/70" />
            )}
            {completedOnDay.map((t) => (
              <TaskRow key={t.id} task={t} {...handlers} />
            ))}
          </>
        )}
      </ul>
    </section>
  );
}

/* ---------------------- Day column ---------------------- */

function DayColumn({
  dayNumber,
  weekday,
  label,
  accent,
  tasks,
  bucket,
  onAdd,
  loading,
  emptyText,
  quickAddRef,
  ...handlers
}: ColumnHandlers & {
  dayNumber: number | null;
  weekday: string;
  label: string;
  accent?: boolean;
  tasks: Task[];
  bucket: Bucket;
  onAdd: (title: string) => void;
  loading: boolean;
  emptyText: string;
  quickAddRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [drag, setDrag] = useState(false);
  const [insertAt, setInsertAt] = useState<number | null>(null);
  const pending = tasks.filter((t) => t.status === "pending");

  function handleDrop(e: React.DragEvent) {
    e.preventDefault();
    setDrag(false);
    const id = e.dataTransfer.getData("text/task-id");
    if (!id) { setInsertAt(null); return; }
    const currentIdx = pending.findIndex((t) => t.id === id);
    if (currentIdx >= 0) {
      // Same column — reorder
      const target = insertAt ?? pending.length;
      const without = pending.map((t) => t.id).filter((tid) => tid !== id);
      const adjusted = target > currentIdx ? target - 1 : target;
      without.splice(Math.max(0, adjusted), 0, id);
      handlers.onReorder(without);
    } else {
      handlers.onMove(id, bucket);
    }
    setInsertAt(null);
  }

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
        // If hovering over the column background (not a task row), insert at end
        if (!(e.target as HTMLElement).closest("[data-task-row]")) {
          setInsertAt(pending.length);
        }
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) {
          setDrag(false);
          setInsertAt(null);
        }
      }}
      onDrop={handleDrop}
      className={`flex h-full min-h-[420px] w-full flex-col rounded-2xl border bg-card transition-colors ${
        drag
          ? "border-foreground/40 bg-secondary/60"
          : accent
            ? "border-border"
            : "border-border/70"
      }`}
    >
      {/* Column header */}
      <header className="flex items-baseline justify-between gap-4 px-5 pt-5">
        <div className="flex items-baseline gap-3">
          {dayNumber !== null && (
            <span
              className={`tabular-nums leading-none ${
                accent ? "text-5xl font-semibold" : "text-3xl font-medium text-muted-foreground"
              }`}
            >
              {dayNumber}
            </span>
          )}
          <div className="flex flex-col">
            <span
              className={`text-sm font-semibold ${
                accent ? "text-foreground" : "text-foreground/80"
              }`}
            >
              {label}
            </span>
            <span className="text-xs text-muted-foreground">{weekday}</span>
          </div>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {pending.length}
        </span>
      </header>

      <div className="px-5 pt-4">
        <QuickAdd
          placeholder={accent ? "O que move o dia?" : "Adicionar…"}
          onAdd={onAdd}
          inputRef={quickAddRef}
        />
      </div>

      {/* Task list */}
      <ul className="flex-1 px-2 pb-3 pt-2">
        {loading && (
          <li className="flex items-center justify-center px-3 py-8">
            <Pulse size={10} />
          </li>
        )}
        {!loading && pending.length === 0 && (
          <li className="px-3 py-10 text-sm text-muted-foreground">{emptyText}</li>
        )}
        {pending.map((t, idx) =>
          handlers.editingId === t.id ? (
            <EditRow
              key={t.id}
              task={t}
              onSave={(title, desc) => handlers.onSaveEdit(t.id, title, desc)}
              onCancel={handlers.onCancelEdit}
            />
          ) : (
            <React.Fragment key={t.id}>
              {insertAt === idx && (
                <li aria-hidden className="mx-3 my-0.5 h-0.5 rounded-full bg-primary/70" />
              )}
              <TaskRow
                task={t}
                accent={accent}
                onDragOverHint={(isBottom) => setInsertAt(isBottom ? idx + 1 : idx)}
                {...handlers}
              />
            </React.Fragment>
          ),
        )}
        {insertAt === pending.length && pending.length > 0 && (
          <li aria-hidden className="mx-3 my-0.5 h-0.5 rounded-full bg-primary/70" />
        )}
      </ul>
    </section>
  );
}

/* ---------------------- Atoms ---------------------- */

function QuickAdd({
  placeholder,
  onAdd,
  inputRef,
}: {
  placeholder: string;
  onAdd: (title: string) => void;
  inputRef?: React.RefObject<HTMLInputElement | null>;
}) {
  const [v, setV] = useState("");
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const title = v.trim();
    if (!title) {
      toast.error("Informe um título.");
      return;
    }
    onAdd(title);
    setV("");
  }
  return (
    <form
      onSubmit={submit}
      className="flex items-center gap-2 rounded-lg border border-dashed border-border/70 bg-secondary/30 px-3 py-2 transition-colors focus-within:border-foreground/40 focus-within:bg-card"
    >
      <Plus className="h-3.5 w-3.5 text-muted-foreground" />
      <Input
        ref={inputRef}
        value={v}
        onChange={(e) => setV(e.target.value)}
        placeholder={placeholder}
        className="h-7 border-0 bg-transparent px-0 text-sm shadow-none focus-visible:ring-0"
      />
    </form>
  );
}

function TaskRow({
  task,
  accent,
  onToggle,
  onOpen,
  projectsById,
  showProjectDot,
  onDragOverHint,
  ...handlers
}: ColumnHandlers & {
  task: Task;
  accent?: boolean;
  onDragOverHint?: (isBottomHalf: boolean) => void;
}) {
  const done = task.status === "completed";
  const project = task.project_id ? projectsById[task.project_id] : null;
  const overdue = !done && !!task.due_date && task.due_date < todayIso();
  return (
    <li
      data-task-row
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/task-id", task.id)}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (onDragOverHint) {
          const rect = e.currentTarget.getBoundingClientRect();
          onDragOverHint(e.clientY > rect.top + rect.height / 2);
        }
      }}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button, a, [role='menuitem']")) return;
        onOpen(task);
      }}
      className="group relative flex cursor-pointer items-start gap-2 rounded-lg px-2 py-2.5 transition-colors hover:bg-secondary/60"
    >
      <GripVertical className="mt-0.5 h-4 w-4 shrink-0 cursor-grab text-muted-foreground/25 opacity-0 transition-opacity group-hover:opacity-100 active:cursor-grabbing" />
      <button
        onClick={() => onToggle(task)}
        aria-label={done ? "Reabrir" : "Concluir"}
        className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border transition-colors ${
          done
            ? "border-foreground bg-foreground text-background"
            : "border-border hover:border-foreground"
        }`}
      >
        {done && <Check className="h-2.5 w-2.5" strokeWidth={3} />}
      </button>
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
          <p
            className={`text-sm leading-snug ${
              done
                ? "text-muted-foreground line-through"
                : accent
                  ? "font-medium text-foreground"
                  : "text-foreground"
            }`}
          >
            {task.title}
          </p>
        </div>
        {task.description && !done && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {task.description}
          </p>
        )}
        {overdue ? (
          <p className="mt-0.5 text-xs font-medium text-rose-500">
            {new Intl.DateTimeFormat("pt-BR", { day: "numeric", month: "short" }).format(parseIsoDate(task.due_date!))}
          </p>
        ) : (
          <p className="mt-0.5 text-xs text-muted-foreground/40 opacity-0 transition-opacity group-hover:opacity-100">
            {new Date(task.created_at).toLocaleDateString("pt-BR", { day: "numeric", month: "short" })}
          </p>
        )}
      </div>
      <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100">
        <TaskActionsMenu
          task={task}
          projectsById={projectsById}
          {...handlers}
          onOpen={onOpen}
          onToggle={onToggle}
          showProjectDot={showProjectDot}
        />
      </div>
    </li>
  );
}

/* ---------------------- Later chip (mais adiante) ---------------------- */

function LaterChip({
  task,
  onToggle,
  onOpen,
  projectsById,
  showProjectDot,
  ...handlers
}: ColumnHandlers & { task: Task }) {
  const project = task.project_id ? projectsById[task.project_id] : null;
  const [, m, d] = task.due_date!.split("-");
  return (
    <div
      draggable
      onDragStart={(e) => e.dataTransfer.setData("text/task-id", task.id)}
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest("button, a, [role='menuitem']")) return;
        onOpen(task);
      }}
      className="group flex max-w-full cursor-pointer items-center gap-2 rounded-full border border-border bg-card py-1 pl-1 pr-1 text-sm transition-all hover:border-foreground/30 hover:shadow-sm"
    >
      <button
        onClick={() => onToggle(task)}
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border border-border hover:border-foreground"
        aria-label="Concluir"
      />
      {showProjectDot && project && (
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full"
          style={{ background: projectColor(project) }}
          title={project.name}
        />
      )}
      <span className="truncate px-0.5">{task.title}</span>
      <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
        {d}/{m}
      </span>
      <TaskActionsMenu
        task={task}
        projectsById={projectsById}
        {...handlers}
        onOpen={onOpen}
        onToggle={onToggle}
        showProjectDot={showProjectDot}
      />
    </div>
  );
}

/* ---------------------- Mini day card (rest of the week) ---------------------- */

function MiniDayCard({
  iso,
  tasks,
  onAdd,
  onToggle,
  onOpen,
  onMove,
  projectsById,
  showProjectDot,
  ...handlers
}: ColumnHandlers & {
  iso: string;
  tasks: Task[];
  onAdd: (title: string) => void;
}) {
  const [drag, setDrag] = useState(false);
  const pending = tasks.filter((t) => t.status === "pending");
  const num = dayNumber(iso);
  const wd = weekdayLabel(iso);
  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const id = e.dataTransfer.getData("text/task-id");
        if (id) handlers.onSetDate(id, iso);
      }}
      className={`w-[60vw] shrink-0 snap-start rounded-xl border bg-card/60 px-3 py-3 transition-colors md:w-auto ${
        drag ? "border-foreground/40 bg-secondary/60" : "border-border/60"
      }`}
    >
      <div className="flex items-baseline gap-2">
        <span className="text-xl font-medium tabular-nums leading-none text-foreground/80">
          {num}
        </span>
        <span className="text-[11px] text-muted-foreground">{wd}</span>
        {pending.length > 0 && (
          <span className="ml-auto text-[11px] tabular-nums text-muted-foreground">
            {pending.length}
          </span>
        )}
      </div>
      <div className="mt-2">
        <QuickAdd placeholder="Adicionar…" onAdd={onAdd} />
      </div>
      {pending.length > 0 && (
        <ul className="mt-2 space-y-1">
          {pending.map((t) => {
            const project = t.project_id ? projectsById[t.project_id] : null;
            return (
              <li
                key={t.id}
                draggable
                onDragStart={(e) => e.dataTransfer.setData("text/task-id", t.id)}
                onClick={(e) => {
                  const target = e.target as HTMLElement;
                  if (target.closest("button, a, [role='menuitem']")) return;
                  onOpen(t);
                }}
                className="group flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-xs text-foreground/80 hover:bg-secondary/60"
              >
                <button
                  onClick={() => onToggle(t)}
                  aria-label="Concluir"
                  className="h-3 w-3 shrink-0 rounded-full border border-border hover:border-foreground"
                />
                {showProjectDot && project && (
                  <span
                    aria-hidden
                    className="h-1 w-1 shrink-0 rounded-full"
                    style={{ background: projectColor(project) }}
                  />
                )}
                <span className="truncate">{t.title}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function EditRow({
  task,
  onSave,
  onCancel,
}: {
  task: Task;
  onSave: (title: string, description: string) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  return (
    <li className="rounded-lg border border-foreground/30 bg-card p-3 shadow-sm">
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        autoFocus
        className="h-8 text-sm"
      />
      <Input
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Descrição"
        className="mt-2 h-8 text-sm"
      />
      <div className="mt-2 flex justify-end gap-1">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" onClick={() => onSave(title, description)}>
          <Check className="mr-1 h-3.5 w-3.5" />
          Salvar
        </Button>
      </div>
    </li>
  );
}

/* ---------------------- Date helpers ---------------------- */

function dayNumber(iso: string): number {
  return Number(iso.split("-")[2]);
}

/* ---------------------- Hover preview + Actions menu ---------------------- */

function TaskActionsMenu({
  task,
  onEdit,
  onDelete,
  onMove,
  onSetDate,
  onSetProject,
  projects,
}: ColumnHandlers & { task: Task }) {
  const [datePickerOpen, setDatePickerOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            onClick={(e) => e.stopPropagation()}
            className="rounded p-1 text-muted-foreground hover:bg-card hover:text-foreground focus:outline-none focus-visible:text-foreground"
            aria-label="Ações"
          >
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onSelect={() => onEdit(task)}>
            <Pencil className="mr-2 h-3.5 w-3.5" />
            Editar
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setFocusOpen(true)}>
            <TimerIcon className="mr-2 h-3.5 w-3.5" />
            Foco
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setDatePickerOpen(true)}>
            <CalendarIcon className="mr-2 h-3.5 w-3.5" />
            Escolher data…
          </DropdownMenuItem>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ArrowRight className="mr-2 h-3.5 w-3.5" />
              Mover para
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem onSelect={() => onMove(task.id, "week")}>
                Sem data
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onMove(task.id, "today")}>
                Hoje
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onMove(task.id, "tomorrow")}>
                Amanhã
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onMove(task.id, "later")}>
                Depois
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <FolderInput className="mr-2 h-3.5 w-3.5" />
              Projeto
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
              <DropdownMenuItem onSelect={() => onSetProject(task.id, null)}>
                <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                Sem projeto
                {!task.project_id && <Check className="ml-auto h-3.5 w-3.5" />}
              </DropdownMenuItem>
              {projects.length > 0 && <DropdownMenuSeparator />}
              {projects.map((p) => (
                <DropdownMenuItem
                  key={p.id}
                  onSelect={() => onSetProject(task.id, p.id)}
                >
                  <span
                    aria-hidden
                    className="mr-2 inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: projectColor(p) }}
                  />
                  {p.name}
                  {task.project_id === p.id && <Check className="ml-auto h-3.5 w-3.5" />}
                </DropdownMenuItem>
              ))}
              {projects.length === 0 && (
                <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
                  Nenhum projeto criado.
                </DropdownMenuLabel>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSeparator />
          <DropdownMenuItem
            onSelect={() => onDelete(task)}
            className="text-destructive focus:text-destructive"
          >
            <Trash2 className="mr-2 h-3.5 w-3.5" />
            Excluir
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Standalone popover for the calendar so it survives the menu closing */}
      <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
        <PopoverTrigger asChild>
          <span className="sr-only" aria-hidden />
        </PopoverTrigger>
        <PopoverContent align="end" className="w-auto p-0">
          <Calendar
            mode="single"
            selected={task.due_date ? parseIsoDate(task.due_date) : undefined}
            onSelect={(d) => {
              if (d) onSetDate(task.id, toIsoLocal(d));
              setDatePickerOpen(false);
            }}
            initialFocus
            className={cn("p-3 pointer-events-auto")}
          />
        </PopoverContent>
      </Popover>
      <StartFocusDialog
        open={focusOpen}
        onOpenChange={setFocusOpen}
        initialProjectId={task.project_id ?? null}
        initialTag={task.title}
      />
    </>
  );
}

function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function toIsoLocal(d: Date): string {
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function weekdayLabel(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Intl.DateTimeFormat("pt-BR", { weekday: "long" })
    .format(new Date(y, m - 1, d))
    .toLowerCase();
}

function addDaysIso(iso: string, delta: number): string {
  const d = parseIsoDate(iso);
  d.setDate(d.getDate() + delta);
  return toIsoLocal(d);
}

function relDayName(iso: string): string {
  const today = todayIso();
  if (iso === today) return "Hoje";
  if (iso === addDaysIso(today, -1)) return "Ontem";
  if (iso === addDaysIso(today, 1)) return "Amanhã";
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

function weekRangeLabel(): string {
  const now = new Date();
  const day = now.getDay(); // 0 = sun
  const monday = new Date(now);
  monday.setDate(now.getDate() - ((day + 6) % 7));
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const fmt = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });
  return `Semana de ${fmt.format(monday)} – ${fmt.format(sunday)}`;
}

/* ---------------------- Task detail panel ---------------------- */

interface TaskDetailPanelProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectsById: Record<string, { id: string; name: string; color: string | null }>;
  projects: Project[];
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
  onMove: (id: string, bucket: Bucket) => void;
  onSetDate: (id: string, date: string | null) => void;
  onSetProject: (id: string, projectId: string | null) => void;
}

function TaskDetailPanel(props: TaskDetailPanelProps) {
  const isMobile = useIsMobile();
  const { task, open, onOpenChange } = props;

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={onOpenChange}>
        <DrawerContent className="max-h-[88vh]">
          {task && (
            <>
              <DrawerHeader className="text-left">
                <DrawerTitle className="sr-only">{task.title}</DrawerTitle>
                <DrawerDescription className="sr-only">Detalhes da tarefa</DrawerDescription>
              </DrawerHeader>
              <div className="overflow-y-auto px-4 pb-8">
                <TaskDetailBody {...props} task={task} />
              </div>
            </>
          )}
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full p-0 sm:max-w-md">
        {task && (
          <>
            <SheetHeader className="sr-only">
              <SheetTitle>{task.title}</SheetTitle>
              <SheetDescription>Detalhes da tarefa</SheetDescription>
            </SheetHeader>
            <ScrollArea className="h-full">
              <div className="px-6 py-8">
                <TaskDetailBody {...props} task={task} />
              </div>
            </ScrollArea>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}

function TaskDetailBody({
  task,
  projectsById,
  projects,
  onToggle,
  onEdit,
  onDelete,
  onMove,
  onSetDate,
  onSetProject,
}: TaskDetailPanelProps & { task: Task }) {
  const done = task.status === "completed";
  const project = task.project_id ? projectsById[task.project_id] : null;
  const [datePickerOpen, setDatePickerOpen] = useState(false);

  const dueLabel = task.due_date
    ? new Intl.DateTimeFormat("pt-BR", {
        weekday: "long",
        day: "2-digit",
        month: "long",
      }).format(parseIsoDate(task.due_date))
    : "Sem data";

  return (
    <div className="space-y-6">
      {/* Status + título */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => onToggle(task)}
          aria-label={done ? "Reabrir" : "Concluir"}
          className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
            done
              ? "border-foreground bg-foreground text-background"
              : "border-border hover:border-foreground"
          }`}
        >
          {done && <Check className="h-3 w-3" strokeWidth={3} />}
        </button>
        <h2
          className={`text-xl font-semibold leading-tight tracking-tight ${
            done ? "text-muted-foreground line-through" : "text-foreground"
          }`}
        >
          {task.title}
        </h2>
      </div>

      {/* Metadados */}
      <dl className="grid grid-cols-[88px_1fr] gap-y-3 text-sm">
        <dt className="text-muted-foreground">Quando</dt>
        <dd>
          <Popover open={datePickerOpen} onOpenChange={setDatePickerOpen}>
            <PopoverTrigger asChild>
              <button className="inline-flex items-center gap-2 rounded-md border border-transparent px-2 py-1 -mx-2 text-foreground hover:border-border hover:bg-secondary/60">
                <CalendarIcon className="h-3.5 w-3.5 text-muted-foreground" />
                <span className="capitalize">{dueLabel}</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-auto p-0">
              <Calendar
                mode="single"
                selected={task.due_date ? parseIsoDate(task.due_date) : undefined}
                onSelect={(d) => {
                  if (d) onSetDate(task.id, toIsoLocal(d));
                  setDatePickerOpen(false);
                }}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
              />
              {task.due_date && (
                <div className="border-t p-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full justify-start text-xs"
                    onClick={() => {
                      onSetDate(task.id, null);
                      setDatePickerOpen(false);
                    }}
                  >
                    Remover data
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </dd>

        <dt className="text-muted-foreground">Projeto</dt>
        <dd>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="inline-flex items-center gap-2 rounded-md border border-transparent px-2 py-1 -mx-2 text-foreground hover:border-border hover:bg-secondary/60">
                {project ? (
                  <>
                    <span
                      aria-hidden
                      className="h-1.5 w-1.5 rounded-full"
                      style={{ background: projectColor(project) }}
                    />
                    <span>{project.name}</span>
                  </>
                ) : (
                  <span className="text-muted-foreground">Sem projeto</span>
                )}
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="max-h-72 w-56 overflow-y-auto">
              <DropdownMenuItem onSelect={() => onSetProject(task.id, null)}>
                <span className="mr-2 inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground/40" />
                Sem projeto
                {!task.project_id && <Check className="ml-auto h-3.5 w-3.5" />}
              </DropdownMenuItem>
              {projects.length > 0 && <DropdownMenuSeparator />}
              {projects.map((p) => (
                <DropdownMenuItem key={p.id} onSelect={() => onSetProject(task.id, p.id)}>
                  <span
                    aria-hidden
                    className="mr-2 inline-block h-1.5 w-1.5 rounded-full"
                    style={{ background: projectColor(p) }}
                  />
                  {p.name}
                  {task.project_id === p.id && <Check className="ml-auto h-3.5 w-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        </dd>
      </dl>

      {/* Descrição */}
      <div>
        <h3 className="pb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
          Descrição
        </h3>
        {task.description ? (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {task.description}
          </p>
        ) : (
          <p className="text-sm italic text-muted-foreground/70">Sem descrição.</p>
        )}
      </div>

      {/* Ações */}
      <div className="flex items-center justify-between gap-2 border-t pt-4">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={() => onEdit(task)}>
            <Pencil className="mr-1.5 h-3.5 w-3.5" />
            Editar
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button size="sm" variant="ghost">
                <ArrowRight className="mr-1.5 h-3.5 w-3.5" />
                Mover
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              <DropdownMenuItem onSelect={() => onMove(task.id, "week")}>
                Sem data
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onMove(task.id, "today")}>Hoje</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onMove(task.id, "tomorrow")}>
                Amanhã
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onMove(task.id, "later")}>Depois</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
        <Button
          size="sm"
          variant="ghost"
          onClick={() => onDelete(task)}
          className="text-destructive hover:text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

/* ---------------------- Completed archive sheet ---------------------- */

