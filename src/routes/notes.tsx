import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMobileFab } from "@/routes/__root";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Folder,
  FolderPlus,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  Pencil,
  Plus,
  Search,
  Trash2,
} from "lucide-react";

import { cn } from "@/lib/utils";
import { Input } from "@/components/ui/input";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

import {
  createFolder,
  createNote,
  deleteFolder,
  deleteNote,
  fetchFolders,
  fetchNotes,
  renameFolder,
  updateNote,
} from "@/modules/notes/api";
import type { Note, NoteFolder } from "@/modules/notes/types";
import {
  downloadNoteAsTxt,
  downloadNotesAsZip,
  formatRelative,
  stripMarkdown,
} from "@/modules/notes/utils";

type SearchParams = { folder?: string; note?: string; focus?: boolean };

export const Route = createFileRoute("/notes")({
  validateSearch: (s: Record<string, unknown>): SearchParams => ({
    folder: typeof s.folder === "string" ? s.folder : undefined,
    note: typeof s.note === "string" ? s.note : undefined,
    focus: s.focus === true || s.focus === "true" ? true : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Notas — Foco" },
      { name: "description", content: "Notas em markdown organizadas por pastas." },
    ],
  }),
  component: NotesPage,
});

const ALL = "__all__";

function NotesPage() {
  const isMobile = useIsMobile();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: Route.fullPath });
  const qc = useQueryClient();

  const [focusMode, setFocusMode] = useState(search.focus ?? false);

  // Ao chegar de um atalho externo (ex.: "Nova nota" em Tarefas) com ?focus,
  // abre já expandido e limpa o parâmetro para não reativar em navegações.
  useEffect(() => {
    if (search.focus) {
      setFocusMode(true);
      navigate({ search: (prev: SearchParams) => ({ ...prev, focus: undefined }), replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search.focus]);

  const foldersQ = useQuery({ queryKey: ["note_folders"], queryFn: fetchFolders });
  const notesQ = useQuery({ queryKey: ["notes"], queryFn: fetchNotes });

  const folders = foldersQ.data ?? [];
  const notes = notesQ.data ?? [];

  const folderId = search.folder ?? ALL;
  const selectedNoteId = search.note;

  const visibleNotes = useMemo(() => {
    if (folderId === ALL) return notes;
    return notes.filter((n) => n.folder_id === folderId);
  }, [notes, folderId]);

  const selectedNote = useMemo(
    () => notes.find((n) => n.id === selectedNoteId) ?? null,
    [notes, selectedNoteId],
  );

  const setFolder = (id: string) =>
    navigate({ search: { folder: id === ALL ? undefined : id, note: undefined } });
  const setNote = (id: string | undefined) =>
    navigate({ search: (prev: SearchParams) => ({ ...prev, note: id }) });

  const newNoteMut = useMutation({
    mutationFn: () => createNote(folderId === ALL ? null : folderId),
    onSuccess: (n) => {
      qc.setQueryData<Note[]>(["notes"], (old) => [n, ...(old ?? [])]);
      setNote(n.id);
      setFocusMode(true);
    },
  });

  useMobileFab(() => newNoteMut.mutate());

  const deleteNoteMut = useMutation({
    mutationFn: (id: string) => deleteNote(id),
    onSuccess: (_, id) => {
      qc.setQueryData<Note[]>(["notes"], (old) => (old ?? []).filter((n) => n.id !== id));
      if (selectedNoteId === id) setNote(undefined);
    },
  });

  const folderName =
    folderId === ALL
      ? "Todas as notas"
      : folders.find((f) => f.id === folderId)?.name ?? "Pasta";

  if (isMobile) {
    return (
      <MobileShell
        folders={folders}
        notes={notes}
        visibleNotes={visibleNotes}
        folderId={folderId}
        folderName={folderName}
        selectedNote={selectedNote}
        setFolder={setFolder}
        setNote={setNote}
        onNewNote={() => newNoteMut.mutate()}
        onDeleteNote={(id) => deleteNoteMut.mutate(id)}
      />
    );
  }

  const ease = "cubic-bezier(0.4,0,0.2,1)";

  return (
    <div className="-mx-6 -my-10 flex h-[calc(100dvh-3.5rem)] border-t border-border/60">
      <div
        className="shrink-0 overflow-hidden"
        style={{
          width: focusMode ? "0px" : "220px",
          transition: `width 300ms ${ease}`,
        }}
      >
        <FoldersSidebar
          folders={folders}
          notes={notes}
          activeId={folderId}
          onSelect={setFolder}
        />
      </div>
      <div
        className="shrink-0 overflow-hidden"
        style={{
          width: focusMode ? "0px" : "320px",
          transition: `width 300ms ${ease}`,
        }}
      >
        <NotesList
          notes={visibleNotes}
          folderName={folderName}
          selectedId={selectedNoteId}
          onSelect={(id) => setNote(id)}
          onNew={() => newNoteMut.mutate()}
          onExportFolder={() =>
            downloadNotesAsZip(visibleNotes, folderName).then(() =>
              toast.success("Pasta exportada"),
            )
          }
        />
      </div>
      <div className="min-w-0 flex-1">
        <Editor
          note={selectedNote}
          folders={folders}
          onDelete={(id) => deleteNoteMut.mutate(id)}
          focusMode={focusMode}
          onEnterFocusMode={() => setFocusMode(true)}
          onExitFocusMode={() => setFocusMode(false)}
        />
      </div>
    </div>
  );
}

/* ============ Folders ============ */

function FoldersSidebar({
  folders,
  notes,
  activeId,
  onSelect,
}: {
  folders: NoteFolder[];
  notes: Note[];
  activeId: string;
  onSelect: (id: string) => void;
}) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (creating) inputRef.current?.focus();
  }, [creating]);

  const createMut = useMutation({
    mutationFn: (n: string) => createFolder(n.trim()),
    onSuccess: (f) => {
      qc.setQueryData<NoteFolder[]>(["note_folders"], (old) =>
        [...(old ?? []), f].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setName("");
      setCreating(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteFolder(id),
    onSuccess: (_, id) => {
      qc.setQueryData<NoteFolder[]>(["note_folders"], (old) =>
        (old ?? []).filter((f) => f.id !== id),
      );
      qc.invalidateQueries({ queryKey: ["notes"] });
    },
  });

  const submit = () => {
    if (name.trim()) createMut.mutate(name);
    else setCreating(false);
  };

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notes) {
      const k = n.folder_id ?? ALL;
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [notes]);

  return (
    <aside className="flex h-full w-full flex-col border-r border-border/60 bg-background">
      <div className="flex h-12 items-center justify-between px-4 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
        Pastas
        <button
          onClick={() => setCreating(true)}
          className="rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Nova pasta"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto px-2 pb-3">
        <FolderRow
          label="Todas as notas"
          count={notes.length}
          active={activeId === ALL}
          onClick={() => onSelect(ALL)}
        />
        <div className="my-2 h-px bg-border/60" />
        {folders.map((f) => (
          <FolderRow
            key={f.id}
            label={f.name}
            count={counts.get(f.id) ?? 0}
            active={activeId === f.id}
            onClick={() => onSelect(f.id)}
            onDelete={() => {
              if (confirm(`Excluir pasta "${f.name}"? As notas serão movidas para "Todas".`))
                deleteMut.mutate(f.id);
            }}
          />
        ))}
        {creating && (
          <div className="mt-1 px-2">
            <Input
              ref={inputRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={submit}
              onKeyDown={(e) => {
                if (e.key === "Enter") submit();
                if (e.key === "Escape") {
                  setName("");
                  setCreating(false);
                }
              }}
              placeholder="Nome da pasta"
              className="h-7 text-[13px]"
            />
          </div>
        )}
      </div>
    </aside>
  );
}

function FolderRow({
  label,
  count,
  active,
  onClick,
  onDelete,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      className={cn(
        "group flex items-center justify-between rounded-md px-2 py-1.5 text-[13px] cursor-pointer",
        active ? "bg-secondary text-foreground" : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-2 truncate">
        <Folder className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{label}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-[11px] tabular-nums text-muted-foreground">{count}</span>
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
            className="opacity-0 group-hover:opacity-100 rounded p-0.5 hover:bg-background"
            aria-label="Excluir pasta"
          >
            <Trash2 className="h-3 w-3" />
          </button>
        )}
      </div>
    </div>
  );
}

/* ============ Notes List ============ */

function NotesList({
  notes,
  folderName,
  selectedId,
  onSelect,
  onNew,
  onExportFolder,
}: {
  notes: Note[];
  folderName: string;
  selectedId: string | undefined;
  onSelect: (id: string) => void;
  onNew: () => void;
  onExportFolder: () => void;
}) {
  const [q, setQ] = useState("");
  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return notes;
    return notes.filter(
      (n) =>
        n.title.toLowerCase().includes(t) || n.content.toLowerCase().includes(t),
    );
  }, [notes, q]);

  return (
    <div className="flex h-full w-full flex-col border-r border-border/60">
      <div className="flex h-12 items-center justify-between px-4">
        <div className="truncate text-[13px] font-medium">{folderName}</div>
        <div className="flex items-center gap-1">
          <button
            onClick={onExportFolder}
            className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Exportar pasta"
            disabled={notes.length === 0}
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button
            onClick={onNew}
            className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
            aria-label="Nova nota"
          >
            <Pencil className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="px-3 pb-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar"
            className="h-8 pl-7 text-[13px]"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto">
        {filtered.length === 0 ? (
          <EmptyList onNew={onNew} hasQuery={q.length > 0} />
        ) : (
          filtered.map((n) => (
            <NoteRow
              key={n.id}
              note={n}
              active={n.id === selectedId}
              onClick={() => onSelect(n.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

function NoteRow({
  note,
  active,
  onClick,
}: {
  note: Note;
  active: boolean;
  onClick: () => void;
}) {
  const snippet = stripMarkdown(note.content).slice(0, 80) || "Sem conteúdo adicional";
  const title = note.title.trim() || "Sem título";
  return (
    <button
      onClick={onClick}
      className={cn(
        "block w-full border-b border-border/60 px-4 py-3 text-left transition-colors",
        active ? "bg-secondary" : "hover:bg-secondary/50",
      )}
    >
      <div className="truncate text-[14px] font-medium text-foreground">{title}</div>
      <div className="mt-1 flex items-center gap-2 text-[11px] text-muted-foreground">
        <span className="tabular-nums">{formatRelative(note.updated_at)}</span>
        <span className="truncate">{snippet}</span>
      </div>
    </button>
  );
}

function EmptyList({ onNew, hasQuery }: { onNew: () => void; hasQuery: boolean }) {
  if (hasQuery) {
    return (
      <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center text-[13px] text-muted-foreground">
        Nenhum resultado.
      </div>
    );
  }
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-16 text-center">
      <span className="mb-2 font-mono text-2xl text-muted-foreground/60">·</span>
      <p className="text-[13px] text-muted-foreground">Nenhuma nota ainda</p>
      <button
        onClick={onNew}
        className="mt-3 text-[13px] font-medium text-foreground underline-offset-4 hover:underline"
      >
        Criar a primeira
      </button>
    </div>
  );
}

/* ============ Editor ============ */

function Editor({
  note,
  folders,
  onDelete,
  mobile = false,
  onBack,
  focusMode = false,
  onEnterFocusMode,
  onExitFocusMode,
}: {
  note: Note | null;
  folders: NoteFolder[];
  onDelete: (id: string) => void;
  mobile?: boolean;
  onBack?: () => void;
  focusMode?: boolean;
  onEnterFocusMode?: () => void;
  onExitFocusMode?: () => void;
}) {
  if (!note) {
    return (
      <div className="flex h-full flex-col items-center justify-center text-center">
        <span className="mb-3 font-mono text-3xl text-muted-foreground/50">·</span>
        <p className="text-[13px] text-muted-foreground">Selecione ou crie uma nota</p>
      </div>
    );
  }
  return <EditorInner key={note.id} note={note} folders={folders} onDelete={onDelete} mobile={mobile} onBack={onBack} focusMode={focusMode} onEnterFocusMode={onEnterFocusMode} onExitFocusMode={onExitFocusMode} />;
}

function EditorInner({
  note,
  folders,
  onDelete,
  mobile,
  onBack,
  focusMode = false,
  onEnterFocusMode,
  onExitFocusMode,
}: {
  note: Note;
  folders: NoteFolder[];
  onDelete: (id: string) => void;
  mobile: boolean;
  onBack?: () => void;
  focusMode?: boolean;
  onEnterFocusMode?: () => void;
  onExitFocusMode?: () => void;
}) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(note.title);
  const [content, setContent] = useState(note.content);
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [status, setStatus] = useState<"idle" | "saving" | "saved">("idle");
  const charCount = content.length;
  const titleRef = useRef<HTMLInputElement>(null);
  const contentRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!note.title) titleRef.current?.focus();
  }, [note.id]);

  useEffect(() => {
    if (!focusMode) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onExitFocusMode?.();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [focusMode, onExitFocusMode]);

  // debounce save
  useEffect(() => {
    if (title === note.title && content === note.content) return;
    setStatus("saving");
    const t = setTimeout(async () => {
      try {
        await updateNote(note.id, { title, content });
        setStatus("saved");
        qc.setQueryData<Note[]>(["notes"], (old) =>
          (old ?? []).map((n) =>
            n.id === note.id
              ? { ...n, title, content, updated_at: new Date().toISOString() }
              : n,
          ),
        );
      } catch (e) {
        setStatus("idle");
        toast.error("Falha ao salvar");
      }
    }, 600);
    return () => clearTimeout(t);
  }, [title, content, note.id, note.title, note.content, qc]);

  const moveTo = async (folderId: string | null) => {
    await updateNote(note.id, { folder_id: folderId });
    qc.setQueryData<Note[]>(["notes"], (old) =>
      (old ?? []).map((n) => (n.id === note.id ? { ...n, folder_id: folderId } : n)),
    );
    toast.success("Nota movida");
  };

  return (
    <div className="flex h-full flex-col bg-background">
      <header
        className={cn(
          "group h-12 border-b border-border/60",
          mobile ? "flex items-center gap-2 px-4" : "flex items-center",
        )}
      >
        {mobile && (
          <button
            onClick={onBack}
            className="-ml-2 flex items-center gap-1 rounded p-1.5 text-foreground hover:bg-secondary"
            aria-label="Voltar"
          >
            <ChevronLeft className="h-4 w-4" />
          </button>
        )}
        <div
          className={cn(
            "flex items-center gap-2",
            !mobile && focusMode
              ? "mx-auto w-full max-w-2xl px-8"
              : "flex-1 px-4",
          )}
        >
          <input
            ref={titleRef}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === "Tab") {
                e.preventDefault();
                contentRef.current?.focus();
              }
            }}
            placeholder="Título"
            className="flex-1 bg-transparent text-[15px] font-bold outline-none placeholder:text-muted-foreground/60 [font-family:'iA_Writer_Duospace',ui-monospace,monospace]"
          />
          <span className="hidden text-[11px] text-muted-foreground/60 sm:block tabular-nums select-none">
            {charCount > 0 ? `${charCount} car.` : ""}
            {status === "saving" ? " · Salvando…" : status === "saved" ? " · Salvo" : ""}
          </span>
          {!mobile && (
            <button
              onClick={focusMode ? onExitFocusMode : onEnterFocusMode}
              className="rounded p-1.5 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 hover:bg-secondary hover:text-foreground focus-visible:opacity-100 focus-visible:ring-1 focus-visible:ring-ring"
              aria-label={focusMode ? "Sair do modo foco (Esc)" : "Entrar no modo foco"}
              title={focusMode ? "Sair do modo foco (Esc)" : "Entrar no modo foco"}
            >
              {focusMode ? (
                <Minimize2 className="h-3.5 w-3.5" />
              ) : (
                <Maximize2 className="h-3.5 w-3.5" />
              )}
            </button>
          )}
          <SegmentedToggle value={mode} onChange={setMode} />
        <button
          onClick={() => downloadNoteAsTxt({ ...note, title, content })}
          className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
          aria-label="Baixar .txt"
        >
          <Download className="h-3.5 w-3.5" />
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              className="rounded p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground"
              aria-label="Mais"
            >
              <MoreHorizontal className="h-3.5 w-3.5" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <div className="px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground">
              Mover para
            </div>
            <DropdownMenuItem onClick={() => moveTo(null)}>Sem pasta</DropdownMenuItem>
            {folders.map((f) => (
              <DropdownMenuItem key={f.id} onClick={() => moveTo(f.id)}>
                {f.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={() => {
                if (confirm("Excluir esta nota?")) onDelete(note.id);
              }}
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" />
              Excluir
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        </div>
      </header>
      <div className="flex-1 overflow-y-auto">
        {mode === "edit" ? (
          <div
            className={cn(
              "mx-auto w-full transition-[max-width] duration-300",
              focusMode ? "max-w-2xl" : "max-w-none",
            )}
          >
            <textarea
              ref={contentRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Comece a escrever em markdown…"
              className="block min-h-[80vh] w-full resize-none bg-transparent px-8 py-8 text-[15px] leading-[1.85] text-foreground outline-none placeholder:text-muted-foreground/40 [font-family:'iA_Writer_Duospace',ui-monospace,monospace]"
            />
          </div>
        ) : (
          <MarkdownPreview content={content} focusMode={focusMode} />
        )}
      </div>
    </div>
  );
}

function SegmentedToggle({
  value,
  onChange,
}: {
  value: "edit" | "preview";
  onChange: (v: "edit" | "preview") => void;
}) {
  return (
    <div className="flex h-7 items-center rounded-md border border-border/60 p-0.5 text-[11px]">
      {(["edit", "preview"] as const).map((k) => (
        <button
          key={k}
          onClick={() => onChange(k)}
          className={cn(
            "rounded px-2 py-0.5 transition-colors",
            value === k
              ? "bg-secondary text-foreground"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {k === "edit" ? "Editar" : "Preview"}
        </button>
      ))}
    </div>
  );
}

function MarkdownPreview({ content, focusMode = false }: { content: string; focusMode?: boolean }) {
  return (
    <div
      className={cn(
        "markdown-preview mx-auto px-8 py-8 text-[15px] leading-[1.8] text-foreground transition-[max-width] duration-300 [font-family:'iA_Writer_Duospace',ui-monospace,monospace]",
        focusMode ? "max-w-2xl" : "max-w-3xl",
      )}
    >
      {content.trim() ? (
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{content}</ReactMarkdown>
      ) : (
        <p className="text-muted-foreground">Nada para visualizar.</p>
      )}
    </div>
  );
}

/* ============ Mobile Shell ============ */

function MobileShell({
  folders,
  notes,
  visibleNotes,
  folderId,
  folderName,
  selectedNote,
  setFolder,
  setNote,
  onNewNote,
  onDeleteNote,
}: {
  folders: NoteFolder[];
  notes: Note[];
  visibleNotes: Note[];
  folderId: string;
  folderName: string;
  selectedNote: Note | null;
  setFolder: (id: string) => void;
  setNote: (id: string | undefined) => void;
  onNewNote: () => void;
  onDeleteNote: (id: string) => void;
}) {
  const [showFolders, setShowFolders] = useState(false);

  const selectFolder = (id: string) => {
    setFolder(id);
    setShowFolders(false);
  };

  // 0=pastas, 1=lista (default), 2=editor
  const idx = showFolders ? 0 : selectedNote ? 2 : 1;

  return (
    <div className="-mx-6 -my-10 h-[calc(100dvh-3.5rem)] overflow-hidden">
      <div
        className="flex h-full w-[300%] transition-transform duration-300 ease-out"
        style={{ transform: `translateX(-${idx * (100 / 3)}%)` }}
      >
        <div className="h-full w-1/3 overflow-y-auto bg-background">
          <MobileFolders
            folders={folders}
            notes={notes}
            activeId={folderId}
            onSelect={selectFolder}
            onClose={() => setShowFolders(false)}
          />
        </div>
        <div className="h-full w-1/3 bg-background">
          <MobileNotesList
            folderName={folderName}
            notes={visibleNotes}
            folders={folders}
            onSelect={(id) => setNote(id)}
            onNew={onNewNote}
            onOpenFolders={() => setShowFolders(true)}
            onDelete={onDeleteNote}
            onExport={() =>
              downloadNotesAsZip(visibleNotes, folderName).then(() =>
                toast.success("Pasta exportada"),
              )
            }
          />
        </div>
        <div className="h-full w-1/3 bg-background">
          <Editor
            note={selectedNote}
            folders={folders}
            onDelete={onDeleteNote}
            mobile
            onBack={() => setNote(undefined)}
          />
        </div>
      </div>
    </div>
  );
}

function MobileFolders({
  folders,
  notes,
  activeId,
  onSelect,
  onClose,
}: {
  folders: NoteFolder[];
  notes: Note[];
  activeId: string;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("");

  const createMut = useMutation({
    mutationFn: (n: string) => createFolder(n.trim()),
    onSuccess: (f) => {
      qc.setQueryData<NoteFolder[]>(["note_folders"], (old) =>
        [...(old ?? []), f].sort((a, b) => a.name.localeCompare(b.name)),
      );
      setName("");
      setCreating(false);
    },
  });

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const n of notes) {
      const k = n.folder_id ?? "__all__";
      m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  }, [notes]);

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-14 items-center justify-between border-b border-border/60 px-4">
        <span className="text-[15px] font-semibold">Pastas</span>
        <button
          onClick={() => setCreating(true)}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground active:bg-secondary"
          aria-label="Nova pasta"
        >
          <FolderPlus className="h-4 w-4" />
        </button>
      </header>
      <div className="flex-1 overflow-y-auto px-3 pb-28 pt-2">
        <MobileFolderRow
          label="Todas as notas"
          count={notes.length}
          active={activeId === ALL}
          onClick={() => onSelect(ALL)}
        />
        <div className="my-1 h-px bg-border/40 mx-2" />
        {folders.map((f) => (
          <MobileFolderRow
            key={f.id}
            label={f.name}
            count={counts.get(f.id) ?? 0}
            active={activeId === f.id}
            onClick={() => onSelect(f.id)}
            onDelete={() => {
              if (confirm(`Excluir pasta "${f.name}"?`)) {
                deleteFolder(f.id).then(() => {
                  qc.setQueryData<NoteFolder[]>(["note_folders"], (old) =>
                    (old ?? []).filter((x) => x.id !== f.id),
                  );
                  qc.invalidateQueries({ queryKey: ["notes"] });
                });
              }
            }}
          />
        ))}
        {creating && (
          <div className="mt-2 px-1">
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={() => (name.trim() ? createMut.mutate(name) : setCreating(false))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && name.trim()) createMut.mutate(name);
                if (e.key === "Escape") { setName(""); setCreating(false); }
              }}
              placeholder="Nome da pasta"
              className="h-10 text-base"
            />
          </div>
        )}
      </div>
    </div>
  );
}

function MobileFolderRow({
  label,
  count,
  active,
  onClick,
  onDelete,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  onDelete?: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={cn(
        "flex min-h-[48px] items-center justify-between rounded-lg px-3 py-2 transition-colors active:bg-secondary",
        active && "bg-secondary",
      )}
    >
      <div className="flex items-center gap-3">
        <Folder className={cn("h-4 w-4", active ? "text-foreground" : "text-muted-foreground")} />
        <span className={cn("text-[15px]", active ? "font-medium text-foreground" : "text-foreground")}>{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-[13px] tabular-nums text-muted-foreground">{count}</span>
        {onDelete && (
          <button
            onClick={(e) => { e.stopPropagation(); onDelete(); }}
            className="rounded p-1 text-muted-foreground/60 active:text-foreground"
            aria-label="Excluir"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
        <ChevronRight className="h-4 w-4 text-muted-foreground/50" />
      </div>
    </div>
  );
}

function MobileNotesList({
  folderName,
  notes,
  folders,
  onSelect,
  onNew,
  onOpenFolders,
  onExport,
  onDelete,
}: {
  folderName: string;
  notes: Note[];
  folders: NoteFolder[];
  onSelect: (id: string) => void;
  onNew: () => void;
  onOpenFolders: () => void;
  onExport: () => void;
  onDelete: (id: string) => void;
}) {
  const [q, setQ] = useState("");
  const touchStart = useRef({ x: 0, y: 0 });

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return notes;
    return notes.filter(
      (n) => n.title.toLowerCase().includes(t) || n.content.toLowerCase().includes(t),
    );
  }, [notes, q]);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStart.current.x;
    const dy = e.changedTouches[0].clientY - touchStart.current.y;
    const isHorizontal = Math.abs(dx) > 72 && Math.abs(dx) > Math.abs(dy) * 1.5;
    if (!isHorizontal) return;
    if (dx > 0) onOpenFolders();
    else onNew();
  };

  return (
    <div
      className="flex h-full flex-col"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      <header className="flex h-14 items-center justify-between border-b border-border/60 px-4">
        <button
          onClick={onOpenFolders}
          className="flex items-center gap-1 text-[14px] text-muted-foreground transition-colors active:text-foreground"
        >
          <ChevronLeft className="h-4 w-4" />
          Pastas
        </button>
        <span className="max-w-[140px] truncate text-[15px] font-semibold">{folderName}</span>
        <button
          onClick={onNew}
          className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary hover:text-foreground active:bg-secondary"
          aria-label="Nova nota"
        >
          <Pencil className="h-4 w-4" />
        </button>
      </header>
      <div className="px-3 py-2">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar"
            className="h-10 rounded-lg pl-9 text-base"
          />
        </div>
      </div>
      <div className="flex-1 overflow-y-auto pb-28">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center pt-16 text-center px-6">
            <span className="mb-2 font-mono text-2xl text-muted-foreground/40">·</span>
            <p className="text-[14px] text-muted-foreground">Nenhuma nota ainda</p>
            <button
              onClick={onNew}
              className="mt-3 text-[13px] font-medium text-foreground underline-offset-4 hover:underline"
            >
              Criar a primeira
            </button>
          </div>
        ) : (
          <div className="px-3">
            <div className="overflow-hidden rounded-xl border border-border/60 bg-background">
              {filtered.map((n, i) => (
                <div
                  key={n.id}
                  className={cn(
                    "flex items-stretch",
                    i !== 0 && "border-t border-border/60",
                  )}
                >
                  <button
                    onClick={() => onSelect(n.id)}
                    className="min-w-0 flex-1 px-4 py-3 text-left transition-colors active:bg-secondary"
                  >
                    <div className="truncate text-[15px] font-medium">
                      {n.title.trim() || "Sem título"}
                    </div>
                    <div className="mt-0.5 flex items-center gap-2 text-[12px] text-muted-foreground">
                      <span className="tabular-nums">{formatRelative(n.updated_at)}</span>
                      <span className="truncate">
                        {stripMarkdown(n.content).slice(0, 60) || "Sem conteúdo"}
                      </span>
                    </div>
                  </button>
                  <NoteCardMenu note={n} folders={folders} onDelete={onDelete} />
                </div>
              ))}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between px-6 py-5 text-[11px] text-muted-foreground/35 select-none">
          <span className="flex items-center gap-0.5">
            <ChevronLeft className="h-3 w-3" />
            Pastas
          </span>
          <span className="flex items-center gap-0.5">
            Nova nota
            <ChevronRight className="h-3 w-3" />
          </span>
        </div>
      </div>
    </div>
  );
}

function NoteCardMenu({
  note,
  folders,
  onDelete,
}: {
  note: Note;
  folders: NoteFolder[];
  onDelete: (id: string) => void;
}) {
  const qc = useQueryClient();

  const moveTo = async (folderId: string | null) => {
    await updateNote(note.id, { folder_id: folderId });
    qc.setQueryData<Note[]>(["notes"], (old) =>
      (old ?? []).map((n) => (n.id === note.id ? { ...n, folder_id: folderId } : n)),
    );
    toast.success("Nota movida");
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="flex items-center px-3 text-muted-foreground/50 transition-colors active:bg-secondary active:text-foreground"
          aria-label="Opções"
        >
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <div className="px-2 py-1 text-[11px] uppercase tracking-wider text-muted-foreground">
          Mover para
        </div>
        <DropdownMenuItem onClick={() => moveTo(null)}>Sem pasta</DropdownMenuItem>
        {folders.map((f) => (
          <DropdownMenuItem key={f.id} onClick={() => moveTo(f.id)}>
            {f.name}
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          className="text-destructive focus:text-destructive"
          onClick={() => {
            if (confirm("Excluir esta nota?")) onDelete(note.id);
          }}
        >
          <Trash2 className="mr-2 h-3.5 w-3.5" />
          Excluir
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}