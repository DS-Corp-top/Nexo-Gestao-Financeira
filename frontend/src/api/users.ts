import api from './client';
import type { User } from './auth';

export async function fetchPendingUsers(): Promise<User[]> {
  const { data } = await api.get<any>('/users/pending/');
  return data.results !== undefined ? data.results : data;
}

export async function approveUser(id: number): Promise<User> {
  const { data } = await api.post<User>(`/users/${id}/approve/`);
  return data;
}
