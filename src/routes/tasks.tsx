import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Check, Pencil, Plus, Trash2, X } from "lucide-react";
import {
  createTask,
  deleteTask,
  fetchTasks,
  setTaskStatus,
  updateTask,
} from "@/modules/tasks/api";
import type { Task, TaskStatus } from "@/modules/tasks/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Filter = "all" | TaskStatus;

export const Route = createFileRoute("/tasks")({
  head: () => ({
    meta: [
      { title: "Tarefas — Foco" },
      { name: "description", content: "Gerencie suas tarefas pessoais." },
    ],
  }),
  component: TasksPage,
});

function TasksPage() {
  const qc = useQueryClient();
  const { data: tasks = [], isLoading } = useQuery({
    queryKey: ["tasks"],
    queryFn: fetchTasks,
  });

  const [filter, setFilter] = useState<Filter>("all");
  const [editingId, setEditingId] = useState<string | null>(null);

  const create = useMutation({
    mutationFn: createTask,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      toast.success("Tarefa criada");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const updateStatus = useMutation({
    mutationFn: ({ id, status }: { id: string; status: TaskStatus }) =>
      setTaskStatus(id, status),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
    onError: (e: Error) => toast.error(e.message),
  });

  const update = useMutation({
    mutationFn: ({ id, ...input }: { id: string; title: string; description: string }) =>
      updateTask(id, { title: input.title, description: input.description }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["tasks"] });
      setEditingId(null);
      toast.success("Tarefa atualizada");
    },
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

  const filtered = tasks.filter((t) => filter === "all" || t.status === filter);

  return (
    <div className="space-y-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Tarefas</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {tasks.filter((t) => t.status === "pending").length} pendentes ·{" "}
            {tasks.filter((t) => t.status === "completed").length} concluídas
          </p>
        </div>
        <FilterTabs value={filter} onChange={setFilter} />
      </header>

      <NewTaskForm onSubmit={(input) => create.mutate(input)} pending={create.isPending} />

      <ul className="space-y-2">
        {isLoading && <EmptyState text="Carregando…" />}
        {!isLoading && filtered.length === 0 && (
          <EmptyState text="Nenhuma tarefa por aqui." />
        )}
        {filtered.map((task) =>
          editingId === task.id ? (
            <EditTaskRow
              key={task.id}
              task={task}
              onCancel={() => setEditingId(null)}
              onSave={(input) => update.mutate({ id: task.id, ...input })}
              pending={update.isPending}
            />
          ) : (
            <TaskRow
              key={task.id}
              task={task}
              onToggle={() =>
                updateStatus.mutate({
                  id: task.id,
                  status: task.status === "pending" ? "completed" : "pending",
                })
              }
              onEdit={() => setEditingId(task.id)}
              onDelete={() => remove.mutate(task.id)}
            />
          ),
        )}
      </ul>
    </div>
  );
}

function FilterTabs({ value, onChange }: { value: Filter; onChange: (v: Filter) => void }) {
  const opts: { v: Filter; label: string }[] = [
    { v: "all", label: "Todas" },
    { v: "pending", label: "Pendentes" },
    { v: "completed", label: "Concluídas" },
  ];
  return (
    <div className="inline-flex rounded-lg border border-border bg-secondary/50 p-0.5 text-sm">
      {opts.map((o) => (
        <button
          key={o.v}
          onClick={() => onChange(o.v)}
          className={`rounded-md px-3 py-1.5 transition-colors ${
            value === o.v
              ? "bg-card text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function NewTaskForm({
  onSubmit,
  pending,
}: {
  onSubmit: (input: { title: string; description: string }) => void;
  pending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [showDesc, setShowDesc] = useState(false);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) {
      toast.error("Informe um título.");
      return;
    }
    onSubmit({ title, description });
    setTitle("");
    setDescription("");
    setShowDesc(false);
  }

  return (
    <form
      onSubmit={submit}
      className="rounded-2xl border border-border bg-card p-4 shadow-sm"
    >
      <div className="flex items-center gap-2">
        <Plus className="h-4 w-4 text-muted-foreground" />
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Adicionar nova tarefa…"
          className="border-0 bg-transparent shadow-none focus-visible:ring-0 focus-visible:border-transparent px-0"
          onFocus={() => setShowDesc(true)}
        />
        <Button type="submit" disabled={pending} size="sm">
          Adicionar
        </Button>
      </div>
      {showDesc && (
        <Textarea
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Descrição (opcional)"
          rows={2}
          className="mt-3 resize-none"
        />
      )}
    </form>
  );
}

function TaskRow({
  task,
  onToggle,
  onEdit,
  onDelete,
}: {
  task: Task;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const done = task.status === "completed";
  return (
    <li className="group flex items-start gap-3 rounded-xl border border-border bg-card p-4 transition-colors hover:border-foreground/15">
      <button
        onClick={onToggle}
        aria-label={done ? "Marcar como pendente" : "Concluir"}
        className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors ${
          done
            ? "border-success bg-success text-success-foreground"
            : "border-border hover:border-foreground"
        }`}
      >
        {done && <Check className="h-3 w-3" />}
      </button>
      <div className="min-w-0 flex-1">
        <p
          className={`text-sm font-medium ${done ? "text-muted-foreground line-through" : ""}`}
        >
          {task.title}
        </p>
        {task.description && (
          <p className="mt-1 text-sm text-muted-foreground">{task.description}</p>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          onClick={onEdit}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Editar"
        >
          <Pencil className="h-3.5 w-3.5" />
        </button>
        <button
          onClick={onDelete}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label="Remover"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </li>
  );
}

function EditTaskRow({
  task,
  onCancel,
  onSave,
  pending,
}: {
  task: Task;
  onCancel: () => void;
  onSave: (input: { title: string; description: string }) => void;
  pending: boolean;
}) {
  const [title, setTitle] = useState(task.title);
  const [description, setDescription] = useState(task.description ?? "");
  return (
    <li className="rounded-xl border border-foreground/20 bg-card p-4 shadow-sm">
      <Input value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
      <Textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Descrição (opcional)"
        rows={2}
        className="mt-2 resize-none"
      />
      <div className="mt-3 flex justify-end gap-2">
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="mr-1 h-4 w-4" />
          Cancelar
        </Button>
        <Button size="sm" disabled={pending} onClick={() => onSave({ title, description })}>
          <Check className="mr-1 h-4 w-4" />
          Salvar
        </Button>
      </div>
    </li>
  );
}

function EmptyState({ text }: { text: string }) {
  return (
    <li className="rounded-xl border border-dashed border-border p-10 text-center text-sm text-muted-foreground">
      {text}
    </li>
  );
}
