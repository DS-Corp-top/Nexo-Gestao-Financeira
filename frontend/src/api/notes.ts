import api from './client';

export interface Note {
  id: number;
  title: string;
  content: string;
  color: string;
  is_pinned: boolean;
  created_at: string;
  updated_at: string;
}

export type NotePayload = {
  title?: string;
  content: string;
  color?: string;
  is_pinned?: boolean;
};

export async function fetchNotes(params?: { is_pinned?: boolean; search?: string }): Promise<Note[]> {
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
