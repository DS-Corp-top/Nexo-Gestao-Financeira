import api from './client';

export type Currency = 'BRL' | 'USD' | 'EUR';

export interface ExchangeRates {
  base: 'BRL';
  rates: Record<Currency, string>;
  updated_at: string | null;
  source: string;
}

export interface BacenBank {
  cnpj: string;
  name: string;
  segment: string;
}

export interface InvestmentEntry {
  id: number;
  investment: number;
  entry_type: 'deposit' | 'withdrawal' | 'dividend' | 'yield';
  amount: string;
  date: string;
  description: string;
  created_at: string;
}

export interface Investment {
  id: number;
  name: string;
  investment_type: 'stocks' | 'fii' | 'fixed_income' | 'crypto' | 'savings' | 'emergency' | 'other';
  currency: Currency;
  broker: string;
  is_active: boolean;
  total_invested: string;
  total_withdrawn: string;
  total_earnings: string;
  net_invested: string;
  total_balance: string;
  entries?: InvestmentEntry[];
}

export type CreateInvestmentPayload = Pick<Investment, 'name' | 'investment_type' | 'currency' | 'broker' | 'is_active'>;
export type CreateInvestmentEntryPayload = Pick<InvestmentEntry, 'investment' | 'entry_type' | 'amount' | 'date' | 'description'>;

export async function fetchInvestments(): Promise<Investment[]> {
  const { data } = await api.get<any>('/investments/');
  return data.results !== undefined ? data.results : data;
}

export async function fetchInvestment(id: number): Promise<Investment> {
  const { data } = await api.get<Investment>(`/investments/${id}/`);
  return data;
}

export async function fetchInvestmentEntries(): Promise<InvestmentEntry[]> {
  const { data } = await api.get<any>('/investment-entries/');
  return data.results !== undefined ? data.results : data;
}

export async function fetchInvestmentExchangeRates(): Promise<ExchangeRates> {
  const { data } = await api.get<ExchangeRates>('/investments/exchange-rates/');
  return data;
}

export async function fetchBacenBanks(): Promise<BacenBank[]> {
  const { data } = await api.get<{ results: BacenBank[] }>('/investments/bacen-banks/');
  return data.results;
}

export async function createInvestment(payload: CreateInvestmentPayload): Promise<Investment> {
  const { data } = await api.post<Investment>('/investments/', payload);
  return data;
}

export async function updateInvestment(id: number, payload: Partial<CreateInvestmentPayload>): Promise<Investment> {
  const { data } = await api.patch<Investment>(`/investments/${id}/`, payload);
  return data;
}

export async function deleteInvestment(id: number): Promise<void> {
  await api.delete(`/investments/${id}/`);
}

export async function createInvestmentEntry(payload: CreateInvestmentEntryPayload): Promise<InvestmentEntry> {
  const { data } = await api.post<InvestmentEntry>('/investment-entries/', payload);
  return data;
}

export async function deleteInvestmentEntry(id: number): Promise<void> {
  await api.delete(`/investment-entries/${id}/`);
}
