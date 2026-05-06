export type NoteFolder = {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
};

export type Note = {
  id: string;
  folder_id: string | null;
  title: string;
  content: string;
  created_at: string;
  updated_at: string;
};