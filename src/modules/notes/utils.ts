import JSZip from "jszip";
import type { Note } from "./types";

export function stripMarkdown(md: string): string {
  return md
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]*`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_~>]+/g, "")
    .replace(/^\s*[-+*]\s+/gm, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function slugify(s: string): string {
  const base = (s || "nota")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base || "nota";
}

export function formatRelative(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = d.toDateString() === now.toDateString();
  if (sameDay) {
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }
  const diffDays = Math.floor((now.getTime() - d.getTime()) / 86400000);
  if (diffDays < 7) {
    return d.toLocaleDateString("pt-BR", { weekday: "short" });
  }
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" });
}

export function downloadNoteAsTxt(note: Note) {
  const title = note.title.trim() || "Sem título";
  const date = new Date(note.updated_at).toISOString().slice(0, 10);
  const body = `# ${title}\n\n${note.content}`;
  const blob = new Blob([body], { type: "text/plain;charset=utf-8" });
  triggerDownload(blob, `${slugify(title)}-${date}.txt`);
}

export async function downloadNotesAsZip(notes: Note[], folderName: string) {
  const zip = new JSZip();
  const used = new Set<string>();
  for (const n of notes) {
    const title = n.title.trim() || "Sem título";
    let name = slugify(title);
    let i = 1;
    while (used.has(name)) name = `${slugify(title)}-${++i}`;
    used.add(name);
    zip.file(`${name}.txt`, `# ${title}\n\n${n.content}`);
  }
  const blob = await zip.generateAsync({ type: "blob" });
  const date = new Date().toISOString().slice(0, 10);
  triggerDownload(blob, `${slugify(folderName)}-${date}.zip`);
}

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}