import api from './client';

export interface PendingUser {
  id: number;
  username: string;
  email: string;
  first_name: string;
  last_name: string;
  date_joined: string;
  tenant_name: string | null;
  person_type: 'pf' | 'pj' | null;
  person_type_display: string | null;
  document: string | null;
}

export async function fetchPendingUsers(): Promise<PendingUser[]> {
  const { data } = await api.get<any>('/users/pending/');
  return data.results !== undefined ? data.results : data;
}

export async function approveUser(id: number): Promise<PendingUser> {
  const { data } = await api.post<PendingUser>(`/users/${id}/approve/`);
  return data;
}
