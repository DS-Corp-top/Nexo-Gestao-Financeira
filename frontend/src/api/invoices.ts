import api from './client';
import type { TenantCompany, TenantProfile } from './tenant';

export interface Client {
  id: number;
  name: string;
  document: string;
  email: string;
  phone: string;
  address: string;
  city: string;
  created_at: string;
}

export interface Invoice {
  id: number;
  issuer_company: number | null;
  issuer_company_name: string;
  number: number;
  number_display: string;
  status: 'draft' | 'issued' | 'paid' | 'cancelled';
  issue_date: string;
  due_date: string;
  client_name: string;
  client_document: string;
  client_email: string;
  client_phone: string;
  client_address: string;
  client_city: string;
  service_code: string;
  service_code_description: string;
  service_description: string;
  gross_value: string;
  deductions: string;
  calculation_base: string;
  iss_rate: string;
  iss_withheld: boolean;
  pis_rate: string;
  cofins_rate: string;
  csll_rate: string;
  ir_rate: string;
  inss_rate: string;
  iss_value: string;
  pis_value: string;
  cofins_value: string;
  csll_value: string;
  ir_value: string;
  inss_value: string;
  total_withheld: string;
  net_value: string;
  recurrence_type: 'once' | 'fixed' | 'monthly' | 'quarterly' | 'yearly' | 'installment';
  recurrence_interval: number;
  recurrence_interval_unit: 'day' | 'month' | 'year';
  installment_count: number | null;
  expected_account: number | null;
  expected_account_name: string;
  note_issued: boolean;
  paid_at: string | null;
  transaction: number | null;
  notes: string;
  created_at: string;
}

export type CreateInvoicePayload = Partial<Invoice> & { launch_financial?: boolean; save_client?: boolean };

export interface InvoicePrintData {
  invoice: Invoice;
  tenant: TenantProfile | null;
  issuer_company: TenantCompany | null;
  service_code_description: string;
  responsible_name: string;
}

export interface InvoiceFilters {
  status?: string;
  start?: string;
  end?: string;
}

export async function fetchInvoices(filters?: InvoiceFilters): Promise<Invoice[]> {
  const query = new URLSearchParams();
  if (filters?.status) query.set('status', filters.status);
  if (filters?.start) query.set('issue_date__gte', filters.start);
  if (filters?.end) query.set('issue_date__lte', filters.end);
  const qs = query.toString();
  const { data } = await api.get<any>(`/invoices/${qs ? `?${qs}` : ''}`);
  return data.results !== undefined ? data.results : data;
}

export async function fetchInvoice(id: number): Promise<Invoice> {
  const { data } = await api.get<Invoice>(`/invoices/${id}/`);
  return data;
}

export async function createInvoice(payload: CreateInvoicePayload): Promise<Invoice> {
  const { data } = await api.post<Invoice>('/invoices/', payload);
  return data;
}

export async function updateInvoice(id: number, payload: Partial<CreateInvoicePayload>): Promise<Invoice> {
  const { data } = await api.patch<Invoice>(`/invoices/${id}/`, payload);
  return data;
}

export async function deleteInvoice(id: number): Promise<void> {
  await api.delete(`/invoices/${id}/`);
}

export async function payInvoice(id: number, payload: { paid_at: string; account?: number | null; launch_financial?: boolean }): Promise<Invoice> {
  const { data } = await api.post<Invoice>(`/invoices/${id}/pay/`, payload);
  return data;
}

export async function cancelInvoice(id: number): Promise<Invoice> {
  const { data } = await api.post<Invoice>(`/invoices/${id}/cancel/`);
  return data;
}

export async function toggleInvoiceNoteIssued(id: number): Promise<Invoice> {
  const { data } = await api.post<Invoice>(`/invoices/${id}/toggle_note_issued/`);
  return data;
}

export async function fetchClients(): Promise<Client[]> {
  const { data } = await api.get<any>('/clients/');
  return data.results !== undefined ? data.results : data;
}

export async function createClient(payload: Partial<Client>): Promise<Client> {
  const { data } = await api.post<Client>('/clients/', payload);
  return data;
}

export async function updateClient(id: number, payload: Partial<Client>): Promise<Client> {
  const { data } = await api.patch<Client>(`/clients/${id}/`, payload);
  return data;
}

export async function deleteClient(id: number): Promise<void> {
  await api.delete(`/clients/${id}/`);
}

export async function fetchInvoicePrintData(id: number): Promise<InvoicePrintData> {
  const { data } = await api.get<InvoicePrintData>(`/invoices/${id}/print_data/`);
  return data;
}

export interface ServiceCode {
  code: string;
  description: string;
}

export async function fetchServiceCodes(): Promise<ServiceCode[]> {
  const { data } = await api.get<ServiceCode[]>('/invoices/service_codes/');
  return data;
}

export async function lookupClientCnpj(cnpj: string): Promise<{ name: string; email: string; phone: string; address: string; city: string }> {
  const { data } = await api.get(`/clients/cnpj_lookup/?cnpj=${encodeURIComponent(cnpj)}`);
  return data;
}
