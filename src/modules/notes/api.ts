import { all, one, run, uid, nowIso } from "@/lib/db";
import type { Note, NoteFolder } from "./types";

export async function fetchFolders(): Promise<NoteFolder[]> {
  return all<NoteFolder>(
    `SELECT id, name, created_at, updated_at FROM note_folders ORDER BY name`,
  );
}

export async function fetchNotes(): Promise<Note[]> {
  return all<Note>(
    `SELECT id, folder_id, title, content, created_at, updated_at
     FROM notes ORDER BY updated_at DESC`,
  );
}

export async function createFolder(name: string): Promise<NoteFolder> {
  const id = uid();
  const now = nowIso();
  await run(
    `INSERT INTO note_folders (id, name, created_at, updated_at) VALUES ($1, $2, $3, $4)`,
    [id, name, now, now],
  );
  return { id, name, created_at: now, updated_at: now };
}

export async function renameFolder(id: string, name: string): Promise<void> {
  await run(`UPDATE note_folders SET name = $1, updated_at = $2 WHERE id = $3`, [
    name,
    nowIso(),
    id,
  ]);
}

export async function deleteFolder(id: string): Promise<void> {
  // As notas da pasta não somem — apenas ficam sem pasta.
  await run(`UPDATE notes SET folder_id = NULL WHERE folder_id = $1`, [id]);
  await run(`DELETE FROM note_folders WHERE id = $1`, [id]);
}

export async function createNote(folderId: string | null): Promise<Note> {
  const id = uid();
  const now = nowIso();
  await run(
    `INSERT INTO notes (id, folder_id, title, content, created_at, updated_at)
     VALUES ($1, $2, '', '', $3, $4)`,
    [id, folderId, now, now],
  );
  return { id, folder_id: folderId, title: "", content: "", created_at: now, updated_at: now };
}

export async function updateNote(
  id: string,
  patch: Partial<Pick<Note, "title" | "content" | "folder_id">>,
): Promise<void> {
  const sets: string[] = [];
  const vals: unknown[] = [];
  let i = 1;
  if (patch.title !== undefined) {
    sets.push(`title = $${i++}`);
    vals.push(patch.title);
  }
  if (patch.content !== undefined) {
    sets.push(`content = $${i++}`);
    vals.push(patch.content);
  }
  if (patch.folder_id !== undefined) {
    sets.push(`folder_id = $${i++}`);
    vals.push(patch.folder_id);
  }
  sets.push(`updated_at = $${i++}`);
  vals.push(nowIso());
  vals.push(id);
  await run(`UPDATE notes SET ${sets.join(", ")} WHERE id = $${i}`, vals);
}

export async function deleteNote(id: string): Promise<void> {
  await run(`DELETE FROM notes WHERE id = $1`, [id]);
}

// Reexport para telas que só precisam de leitura pontual.
export async function getNote(id: string): Promise<Note | null> {
  return one<Note>(
    `SELECT id, folder_id, title, content, created_at, updated_at FROM notes WHERE id = $1`,
    [id],
  );
}
