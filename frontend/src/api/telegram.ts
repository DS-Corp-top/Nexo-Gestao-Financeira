import api from './client';

export interface TelegramLinkStatus {
  linked: boolean;
  id?: number;
  chat_id?: number;
  account_name?: string | null;
  linked_at?: string;
}

export interface TelegramLinkCode {
  code: string;
  deep_link: string | null;
  expires_in: number;
}

export async function fetchTelegramLinkStatus(): Promise<TelegramLinkStatus> {
  const { data } = await api.get<TelegramLinkStatus>('/telegram/link/');
  return data;
}

export async function createTelegramLinkCode(accountId: number): Promise<TelegramLinkCode> {
  const { data } = await api.post<TelegramLinkCode>('/telegram/link/code/', { account_id: accountId });
  return data;
}

export async function unlinkTelegram(): Promise<void> {
  await api.delete('/telegram/link/');
}
