import api from './client';

export type CattleSystem = 'feedlot' | 'semi_feedlot';
export type CattleLotStatus = 'open' | 'closed';
export type CattleEntryType = 'acquisition' | 'feed' | 'medicine' | 'vaccine' | 'freight' | 'other_cost' | 'sale';

export interface CattleLotEntry {
  id: number;
  lot: number;
  entry_type: CattleEntryType;
  date: string;
  amount: string;
  head_count: number | null;
  weight_kg: string | null;
  description: string;
  created_at: string;
}

// Valores monetários vêm null quando mascarados (superusuário sem vínculo).
export interface CattleLot {
  id: number;
  name: string;
  system: CattleSystem;
  status: CattleLotStatus;
  location: string;
  start_date: string;
  end_date: string | null;
  notes: string;
  acquisition_cost: string | null;
  feed_cost: string | null;
  medicine_cost: string | null;
  vaccine_cost: string | null;
  freight_cost: string | null;
  other_costs: string | null;
  total_cost: string | null;
  sales_revenue: string | null;
  profit: string | null;
  margin_percent: string | null;
  cost_per_head: string | null;
  feed_cost_per_head_day: string | null;
  heads_purchased: number;
  heads_sold: number;
  heads_on_hand: number;
  avg_purchase_weight_kg: string | null;
  avg_sale_weight_kg: string | null;
  days_on_feed: number;
  entries?: CattleLotEntry[];
}

export type CattleLotPayload = Pick<CattleLot, 'name' | 'system' | 'status' | 'location' | 'start_date' | 'end_date' | 'notes'>;
export type CattleLotEntryPayload = Pick<CattleLotEntry, 'lot' | 'entry_type' | 'date' | 'amount' | 'head_count' | 'weight_kg' | 'description'>;

export const systemLabels: Record<CattleSystem, string> = {
  feedlot: 'Confinamento',
  semi_feedlot: 'Semiconfinamento',
};

export const statusLabels: Record<CattleLotStatus, string> = {
  open: 'Em andamento',
  closed: 'Encerrado',
};

export const entryTypeLabels: Record<CattleEntryType, string> = {
  acquisition: 'Aquisição',
  feed: 'Trato / Alimentação',
  medicine: 'Remédio',
  vaccine: 'Vacina',
  freight: 'Frete',
  other_cost: 'Outros custos',
  sale: 'Venda',
};

export async function fetchCattleLots(): Promise<CattleLot[]> {
  const { data } = await api.get<any>('/cattle-lots/');
  return data.results !== undefined ? data.results : data;
}

export async function fetchCattleLot(id: number): Promise<CattleLot> {
  const { data } = await api.get<CattleLot>(`/cattle-lots/${id}/`);
  return data;
}

export async function createCattleLot(payload: CattleLotPayload): Promise<CattleLot> {
  const { data } = await api.post<CattleLot>('/cattle-lots/', payload);
  return data;
}

export async function updateCattleLot(id: number, payload: Partial<CattleLotPayload>): Promise<CattleLot> {
  const { data } = await api.patch<CattleLot>(`/cattle-lots/${id}/`, payload);
  return data;
}

export async function deleteCattleLot(id: number): Promise<void> {
  await api.delete(`/cattle-lots/${id}/`);
}

export async function createCattleLotEntry(payload: CattleLotEntryPayload): Promise<CattleLotEntry> {
  const { data } = await api.post<CattleLotEntry>('/cattle-lot-entries/', payload);
  return data;
}

export async function deleteCattleLotEntry(id: number): Promise<void> {
  await api.delete(`/cattle-lot-entries/${id}/`);
}
