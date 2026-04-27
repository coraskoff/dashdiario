import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Calendar as CalendarIcon, Check, CheckCheck, FolderInput, Pencil, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Pulse } from "@/components/Pulse";
import {
  createTask,
  deleteTask,
  fetchTasks,
  setTaskDueDate,
  setTaskProject,
  setTaskStatus,
  updateTask,
} from "@/modules/tasks/api";
import type { Bucket, Task, TaskStatus } from "@/modules/tasks/types";
import {
  bucketDueDate,
  groupByBucket,
  todayIso,
  tomorrowIso,
  dayAfterTomorrowIso,
  restOfWeekIsos,
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
  });
  const { data: projects = [] } = useQuery({
    queryKey: ["projects"],
    queryFn: fetchProjects,
  });

  const [activeProject, setActiveProject] = useState<ActiveProject>("all");

  // Filter tasks by active project tab
  const visibleTasks = useMemo(() => {
    if (activeProject === "all") return tasks;
    return tasks.filter((t) => t.project_id === activeProject);
  }, [tasks, activeProject]);

  const buckets = useMemo(() => groupByBucket(visibleTasks), [visibleTasks]);

  // "Semana" no topo = só tarefas sem data. Tarefas com data futura (>= hoje+3)
  // que ainda caem na semana corrente vão para o rodapé "Resto da semana".
  const restIsos = useMemo(() => restOfWeekIsos(), []);
  const restIsoSet = useMemo(() => new Set(restIsos), [restIsos]);
  const weekNoDate = useMemo(
    () => buckets.week.filter((t) => !t.due_date),
    [buckets.week],
  );
  const tasksByDate = useMemo(() => {
    const map: Record<string, Task[]> = {};
    for (const t of buckets.week) {
      if (t.due_date && restIsoSet.has(t.due_date)) {
        (map[t.due_date] ??= []).push(t);
      }
    }
    return map;
  }, [buckets.week, restIsoSet]);

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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (e: Error) => toast.error(e.message),
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
    onSettled: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });

  const toggle = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      setTaskStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const remove = useMutation({
    mutationFn: deleteTask,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Tarefa removida");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, title, description }: { id: string; title: string; description: string }) =>
      updateTask(id, { title, description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Tarefa atualizada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setProject = useMutation({
    mutationFn: ({ id, projectId }: { id: string; projectId: string | null }) =>
      setTaskProject(id, projectId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Projeto atualizado");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const setDate = useMutation({
    mutationFn: ({ id, date }: { id: string; date: string | null }) =>
      setTaskDueDate(id, date),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const [editingId, setEditingId] = useState<string | null>(null);
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

  const columnHandlers = {
    onToggle: (t: Task) =>
      toggle.mutate({
        id: t.id,
        status: t.status === "pending" ? "completed" : "pending",
      }),
    onEdit: (t: Task) => setEditingId(t.id),
    onDelete: (t: Task) => remove.mutate(t.id),
    onMove: (id: string, bucket: Bucket) => move.mutate({ id, bucket }),
    onSetDate: (id: string, date: string | null) => setDate.mutate({ id, date }),
    onSetProject: (id: string, projectId: string | null) =>
      setProject.mutate({ id, projectId }),
    editingId,
    onSaveEdit: (id: string, title: string, description: string) => {
      update.mutate({ id, title, description });
      setEditingId(null);
    },
    onCancelEdit: () => setEditingId(null),
    projectsById,
    projects,
    showProjectDot: activeProject === "all",
  };

  return (
    <div className="space-y-10">
      {/* Header — typographic anchor, not a card */}
      <header className="flex items-end justify-between gap-6">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
            {weekRangeLabel()}
          </p>
          <h1 className="mt-2 text-4xl font-semibold tracking-tight md:text-5xl">
            Sua semana.
          </h1>
        </div>
        <div className="flex items-center gap-4">
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

      {/* "Semana" — horizontal strip on top: macro plan, distinct from daily focus */}
      <WeekStrip
        tasks={weekNoDate}
        onAdd={(title) =>
          create.mutate(
            { title, due_date: null, project_id: newTaskProjectId },
            { onSuccess: () => toast.success("Adicionada à Semana") },
          )
        }
        loading={isLoading}
        {...columnHandlers}
      />

      {/* Day columns — desktop: asymmetric grid (Today dominant). Mobile: snap-scroll carousel. */}
      <div
        className="-mx-4 flex snap-x snap-mandatory gap-4 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:grid md:snap-none md:gap-5 md:overflow-visible md:px-0 md:pb-0 md:grid-cols-[1.6fr_1fr_1fr]"
      >
        <div className="w-[88vw] shrink-0 snap-start md:w-auto">
        <DayColumn
          dayNumber={dayNumber(todayIso())}
          weekday={weekdayLabel(todayIso())}
          label="Hoje"
          accent
          tasks={buckets.today}
          bucket="today"
          onAdd={(title) =>
            create.mutate({ title, due_date: todayIso(), project_id: newTaskProjectId })
          }
          loading={isLoading}
          {...columnHandlers}
          emptyText="Dia limpo. Capriche em uma coisa só."
        />
        </div>
        <div className="w-[88vw] shrink-0 snap-start md:w-auto">
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
        <div className="w-[88vw] shrink-0 snap-start md:w-auto">
        <DayColumn
          dayNumber={dayNumber(dayAfterTomorrowIso())}
          weekday={weekdayLabel(dayAfterTomorrowIso())}
          label="Depois"
          tasks={buckets.later}
          bucket="later"
          onAdd={(title) =>
            create.mutate({ title, due_date: bucketDueDate("later"), project_id: newTaskProjectId })
          }
          loading={isLoading}
          {...columnHandlers}
          emptyText="Sem compromissos."
        />
        </div>
      </div>

      {/* Resto da semana — hierarquia menor: linha separadora + grade densa */}
      {restIsos.length > 0 && (
        <section className="pt-2">
          <div className="flex items-center gap-3 pb-3">
            <div className="h-px flex-1 bg-border/70" />
            <span className="text-[11px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Resto da semana
            </span>
            <div className="h-px flex-1 bg-border/70" />
          </div>
          <div
            className="-mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:grid md:snap-none md:overflow-visible md:px-0 md:pb-0"
            style={{
              ["--rest-cols" as string]: restIsos.length,
              gridTemplateColumns: `repeat(${restIsos.length}, minmax(0, 1fr))`,
            }}
          >
            {restIsos.map((iso) => (
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
        </section>
      )}
    </div>
  );
}

/* ---------------------- Week strip (top row) ---------------------- */

interface ColumnHandlers {
  onToggle: (t: Task) => void;
  onEdit: (t: Task) => void;
  onDelete: (t: Task) => void;
  onMove: (id: string, bucket: Bucket) => void;
  onSetDate: (id: string, date: string | null) => void;
  onSetProject: (id: string, projectId: string | null) => void;
  editingId: string | null;
  onSaveEdit: (id: string, title: string, description: string) => void;
  onCancelEdit: () => void;
  projectsById: Record<string, { id: string; name: string; color: string | null }>;
  projects: Project[];
  showProjectDot: boolean;
}

function WeekStrip({
  tasks,
  onAdd,
  loading,
  ...handlers
}: ColumnHandlers & {
  tasks: Task[];
  onAdd: (title: string) => void;
  loading: boolean;
}) {
  const [drag, setDrag] = useState(false);
  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const id = e.dataTransfer.getData("text/task-id");
        if (id) handlers.onMove(id, "week");
      }}
      className={`rounded-2xl border bg-card/60 p-5 transition-colors ${
        drag ? "border-foreground/40 bg-secondary/60" : "border-border"
      }`}
    >
      <div className="flex items-baseline justify-between gap-4 pb-4">
        <div className="flex items-baseline gap-3">
          <h2 className="text-base font-semibold">Semana</h2>
          <span className="text-xs text-muted-foreground">
            ideias e metas sem dia definido
          </span>
        </div>
        <span className="text-xs tabular-nums text-muted-foreground">
          {tasks.filter((t) => t.status === "pending").length}
        </span>
      </div>

      <QuickAdd placeholder="Algo para esta semana…" onAdd={onAdd} />

      {/* Horizontal flowing chips — pending only; completed live in the archive sheet */}
      <div className="mt-4 flex flex-wrap gap-2">
        {loading && <Pulse size={10} className="ml-1" />}
        {!loading && tasks.filter((t) => t.status === "pending").length === 0 && (
          <span className="text-sm text-muted-foreground">
            Use este espaço para o que quer fazer “em algum momento”.
          </span>
        )}
        {tasks
          .filter((t) => t.status === "pending")
          .map((t) => (
            <WeekChip key={t.id} task={t} {...handlers} />
          ))}
      </div>
    </section>
  );
}

function WeekChip({
  task,
  onToggle,
  projectsById,
  showProjectDot,
  ...handlers
}: ColumnHandlers & { task: Task }) {
  const done = task.status === "completed";
  const project = task.project_id ? projectsById[task.project_id] : null;
  return (
    <div
          draggable
          onDragStart={(e) => e.dataTransfer.setData("text/task-id", task.id)}
          className={`group flex max-w-full items-center gap-2 rounded-full border border-border bg-card pl-1 pr-1 py-1 text-sm transition-all hover:border-foreground/30 hover:shadow-sm ${
            done ? "opacity-50" : ""
          }`}
        >
          <button
            onClick={() => onToggle(task)}
            className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${
              done
                ? "border-foreground bg-foreground text-background"
                : "border-border hover:border-foreground"
            }`}
            aria-label={done ? "Reabrir" : "Concluir"}
          >
            {done && <Check className="h-3 w-3" />}
          </button>
          {showProjectDot && project && (
            <span
              aria-hidden
              className="h-1.5 w-1.5 shrink-0 rounded-full"
              style={{ background: projectColor(project) }}
              title={project.name}
            />
          )}
          <span className={`truncate px-1 ${done ? "line-through" : ""}`}>{task.title}</span>
          <TaskActionsMenu
            task={task}
            projectsById={projectsById}
            {...handlers}
            onToggle={onToggle}
            showProjectDot={showProjectDot}
          />
    </div>
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
}) {
  const [drag, setDrag] = useState(false);
  // Completed tasks are archived in the side sheet — only pending shows here.
  const pending = tasks.filter((t) => t.status === "pending");

  return (
    <section
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        const id = e.dataTransfer.getData("text/task-id");
        if (id) handlers.onMove(id, bucket);
      }}
      className={`flex h-full min-h-[420px] w-full flex-col rounded-2xl border bg-card transition-colors ${
        drag
          ? "border-foreground/40 bg-secondary/60"
          : accent
            ? "border-border"
            : "border-border/70"
      }`}
    >
      {/* Column header — big numeral as visual anchor */}
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
        />
      </div>

      {/* Task list — flat, separated by hairline only (no card-in-card) */}
      <ul className="flex-1 px-2 pb-3 pt-2">
        {loading && (
          <li className="flex items-center justify-center px-3 py-8">
            <Pulse size={10} />
          </li>
        )}
        {!loading && pending.length === 0 && (
          <li className="px-3 py-10 text-sm text-muted-foreground">{emptyText}</li>
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
            <TaskRow key={t.id} task={t} accent={accent} {...handlers} />
          ),
        )}
      </ul>
    </section>
  );
}

/* ---------------------- Atoms ---------------------- */

function QuickAdd({
  placeholder,
  onAdd,
}: {
  placeholder: string;
  onAdd: (title: string) => void;
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
  projectsById,
  showProjectDot,
  ...handlers
}: ColumnHandlers & { task: Task; accent?: boolean }) {
  const done = task.status === "completed";
  const project = task.project_id ? projectsById[task.project_id] : null;
  const [expanded, setExpanded] = useState(false);
  return (
    <li
          draggable
          onDragStart={(e) => e.dataTransfer.setData("text/task-id", task.id)}
          onClick={(e) => {
            // Don't toggle when clicking interactive children
            const target = e.target as HTMLElement;
            if (target.closest("button, a, [role='menuitem']")) return;
            setExpanded((v) => !v);
          }}
          className={`group relative flex cursor-pointer items-start gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-secondary/60 ${
            expanded ? "bg-secondary/40" : ""
          }`}
        >
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
        {task.description && !done && !expanded && (
          <p className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">
            {task.description}
          </p>
        )}
        {expanded && (
          <div className="mt-2 space-y-2">
            {task.description ? (
              <p className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground">
                {task.description}
              </p>
            ) : (
              <p className="text-xs italic text-muted-foreground/60">Sem descrição.</p>
            )}
            <div className="flex items-center gap-2 pt-1">
              <Button
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                onClick={(e) => {
                  e.stopPropagation();
                  handlers.onEdit(task);
                }}
              >
                <Pencil className="mr-1 h-3 w-3" />
                Editar
              </Button>
            </div>
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center opacity-0 transition-opacity group-hover:opacity-100 data-[state=open]:opacity-100">
        <TaskActionsMenu
          task={task}
          projectsById={projectsById}
          {...handlers}
          onToggle={onToggle}
          showProjectDot={showProjectDot}
        />
      </div>
    </li>
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
                Semana
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

/* ---------------------- Completed archive sheet ---------------------- */

