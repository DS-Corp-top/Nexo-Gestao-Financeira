import api from './client';

export interface Account {
  id: number;
  name: string;
  account_type: 'bank' | 'cash' | 'card';
  initial_balance: string;
  credit_limit: string | null;
  include_in_balance: boolean;
  is_active: boolean;
  balance: string;
  created_at: string;
}

export type CreateAccountPayload = Omit<Account, 'id' | 'balance' | 'created_at'>;

export async function fetchAccounts(): Promise<Account[]> {
  const { data } = await api.get<Account[]>('/accounts/');
  return data;
}

export async function createAccount(payload: CreateAccountPayload): Promise<Account> {
  const { data } = await api.post<Account>('/accounts/', payload);
  return data;
}

export async function updateAccount(id: number, payload: Partial<CreateAccountPayload>): Promise<Account> {
  const { data } = await api.patch<Account>(`/accounts/${id}/`, payload);
  return data;
}

export async function deleteAccount(id: number): Promise<void> {
  await api.delete(`/accounts/${id}/`);
}
