import { supabase } from "@/integrations/supabase/client";
import type { Note, NoteFolder } from "./types";

export async function fetchFolders(): Promise<NoteFolder[]> {
  const { data, error } = await supabase
    .from("note_folders")
    .select("id, name, created_at, updated_at")
    .order("name");
  if (error) throw error;
  return (data ?? []) as NoteFolder[];
}

export async function fetchNotes(): Promise<Note[]> {
  const { data, error } = await supabase
    .from("notes")
    .select("id, folder_id, title, content, created_at, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as Note[];
}

export async function createFolder(name: string): Promise<NoteFolder> {
  const { data, error } = await supabase
    .from("note_folders")
    .insert({ name })
    .select("id, name, created_at, updated_at")
    .single();
  if (error) throw error;
  return data as NoteFolder;
}

export async function renameFolder(id: string, name: string): Promise<void> {
  const { error } = await supabase.from("note_folders").update({ name }).eq("id", id);
  if (error) throw error;
}

export async function deleteFolder(id: string): Promise<void> {
  const { error } = await supabase.from("note_folders").delete().eq("id", id);
  if (error) throw error;
}

export async function createNote(folderId: string | null): Promise<Note> {
  const { data, error } = await supabase
    .from("notes")
    .insert({ folder_id: folderId, title: "", content: "" })
    .select("id, folder_id, title, content, created_at, updated_at")
    .single();
  if (error) throw error;
  return data as Note;
}

export async function updateNote(
  id: string,
  patch: Partial<Pick<Note, "title" | "content" | "folder_id">>,
): Promise<void> {
  const { error } = await supabase.from("notes").update(patch).eq("id", id);
  if (error) throw error;
}

export async function deleteNote(id: string): Promise<void> {
  const { error } = await supabase.from("notes").delete().eq("id", id);
  if (error) throw error;
}