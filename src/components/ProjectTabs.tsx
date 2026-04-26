import { useEffect, useRef } from "react";
import { Plus, X } from "lucide-react";
import type { Project } from "@/modules/projects/types";
import { projectColor } from "@/modules/projects/api";

export type ActiveProject = "all" | string; // "all" or project.id

interface Props {
  projects: Project[];
  active: ActiveProject;
  onChange: (next: ActiveProject) => void;
  onCreate: (name: string) => void;
  onDelete?: (id: string) => void;
  counts: Record<string, number>; // key: "all" or project.id
}

/**
 * Typographic tablist. Underline indicator (1px), color dot per project.
 * Keyboard: Tab focuses; ←/→ move active tab; Home/End jump to ends.
 * Implements WAI-ARIA tabs pattern (manual activation).
 */
export function ProjectTabs({
  projects,
  active,
  onChange,
  onCreate,
  onDelete,
  counts,
}: Props) {
  const items: { key: ActiveProject; label: string; color?: string }[] = [
    { key: "all", label: "Todos" },
    ...projects.map((p) => ({
      key: p.id,
      label: p.name,
      color: projectColor(p),
    })),
  ];

  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const activeIndex = items.findIndex((it) => it.key === active);

  function handleKey(e: React.KeyboardEvent, idx: number) {
    let next: number | null = null;
    if (e.key === "ArrowRight") next = (idx + 1) % items.length;
    else if (e.key === "ArrowLeft") next = (idx - 1 + items.length) % items.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = items.length - 1;
    if (next !== null) {
      e.preventDefault();
      onChange(items[next].key);
      refs.current[next]?.focus();
    }
  }

  // Keep focus visible target in sync if active changes externally
  useEffect(() => {
    refs.current = refs.current.slice(0, items.length);
  }, [items.length]);

  return (
    <div
      role="tablist"
      aria-label="Projetos"
      className="flex flex-wrap items-end gap-1 border-b border-border/70"
    >
      {items.map((it, idx) => {
        const isActive = it.key === active;
        const count = counts[it.key as string] ?? 0;
        const isProject = it.key !== "all";
        return (
          <div key={it.key} className="group relative flex items-center">
            <button
              ref={(el) => {
                refs.current[idx] = el;
              }}
              role="tab"
              aria-selected={isActive}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onChange(it.key)}
              onKeyDown={(e) => handleKey(e, idx)}
              className={`relative flex items-center gap-2 px-3 pb-2.5 pt-1 text-sm transition-colors ${
                isActive
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {it.color && (
                <span
                  aria-hidden
                  className="h-1.5 w-1.5 rounded-full"
                  style={{ background: it.color }}
                />
              )}
              <span className="font-medium">{it.label}</span>
              {count > 0 && (
                <span
                  className={`tabular-nums text-xs ${
                    isActive ? "text-muted-foreground" : "text-muted-foreground/70"
                  }`}
                >
                  {count}
                </span>
              )}
              {/* Underline indicator: 1px, no pill background */}
              <span
                aria-hidden
                className={`absolute inset-x-2 -bottom-px h-px transition-opacity ${
                  isActive ? "bg-foreground opacity-100" : "opacity-0"
                }`}
              />
            </button>
            {isProject && onDelete && isActive && (
              <button
                onClick={() => {
                  if (confirm("Remover este projeto? Tarefas ficarão sem projeto.")) {
                    onDelete(it.key as string);
                  }
                }}
                className="mb-2 rounded p-1 text-muted-foreground/60 hover:bg-secondary hover:text-destructive"
                aria-label="Remover projeto"
                title="Remover projeto"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        );
      })}
      <NewProjectInline onCreate={onCreate} />
      {/* Spacer to keep underline going */}
      <div className="flex-1" aria-hidden />
      {activeIndex < 0 && null}
    </div>
  );
}

function NewProjectInline({ onCreate }: { onCreate: (name: string) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = inputRef.current?.value.trim() ?? "";
    if (!v) return;
    onCreate(v);
    if (inputRef.current) inputRef.current.value = "";
    inputRef.current?.blur();
  }
  return (
    <form
      onSubmit={submit}
      className="group/new flex items-center gap-1 px-2 pb-2.5 pt-1"
    >
      <Plus className="h-3 w-3 text-muted-foreground" />
      <input
        ref={inputRef}
        placeholder="Novo projeto"
        className="w-28 border-0 bg-transparent text-sm text-muted-foreground placeholder:text-muted-foreground/60 focus:text-foreground focus:outline-none focus:placeholder:text-muted-foreground/40"
      />
    </form>
  );
}
