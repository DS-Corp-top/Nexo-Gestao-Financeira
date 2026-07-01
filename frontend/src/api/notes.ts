import api from './client';

export interface Note {
  id: number;
  note_list: number | null;
  note_list_name: string | null;
  title: string;
  content: string;
  color: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export type NotePayload = {
  note_list?: number | null;
  title?: string;
  content: string;
  color?: string;
  is_pinned?: boolean;
};

export interface NoteList {
  id: number;
  name: string;
  color: string;
  notes_count: number;
  created_at: string;
  updated_at: string;
}

export type NoteListPayload = {
  name: string;
  color?: string;
};

export async function fetchNoteLists(): Promise<NoteList[]> {
  const { data } = await api.get<NoteList[]>('/note-lists/');
  return data;
}

export async function createNoteList(payload: NoteListPayload): Promise<NoteList> {
  const { data } = await api.post<NoteList>('/note-lists/', payload);
  return data;
}

export async function updateNoteList(id: number, payload: Partial<NoteListPayload>): Promise<NoteList> {
  const { data } = await api.patch<NoteList>(`/note-lists/${id}/`, payload);
  return data;
}

export async function deleteNoteList(id: number): Promise<void> {
  await api.delete(`/note-lists/${id}/`);
}

export async function fetchNotes(params?: { is_pinned?: boolean; search?: string; note_list?: number }): Promise<Note[]> {
  const { data } = await api.get<Note[]>('/notes/', { params });
  return data;
}

export async function createNote(payload: NotePayload): Promise<Note> {
  const { data } = await api.post<Note>('/notes/', payload);
  return data;
}

export async function updateNote(id: number, payload: Partial<NotePayload>): Promise<Note> {
  const { data } = await api.patch<Note>(`/notes/${id}/`, payload);
  return data;
}

export async function deleteNote(id: number): Promise<void> {
  await api.delete(`/notes/${id}/`);
}
