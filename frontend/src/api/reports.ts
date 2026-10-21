import api from './client';

export interface DateRangeParams {
  date_start: string;
  date_end: string;
}

export type ReportStatusFilter = 'cleared' | 'pending' | 'all';

export interface TransactionsReportRow {
  id: number;
  date: string;
  description: string;
  transaction_type: 'income' | 'expense' | 'transfer';
  amount: string;
  account: string | null;
  category: string | null;
  is_cleared: boolean;
}

export interface TransactionsReport {
  date_start: string;
  date_end: string;
  account: string | null;
  status: ReportStatusFilter;
  opening_balance: string;
  closing_balance: string;
  total_income: string;
  total_expense: string;
  transactions: TransactionsReportRow[];
}

export async function fetchTransactionsReport(
  params: DateRangeParams & {
    account?: number;
    category?: number;
    type?: 'income' | 'expense';
    status?: ReportStatusFilter;
  }
): Promise<TransactionsReport> {
  const { data } = await api.get<TransactionsReport>('/reports/transactions/', { params });
  return data;
}

export interface AccountReportRow {
  id: number;
  name: string;
  account_type: string;
  account_type_display: string;
  opening_balance: string;
  total_income: string;
  total_expense: string;
  closing_balance: string;
}

export interface AccountsReport {
  date_start: string;
  date_end: string;
  status: ReportStatusFilter;
  accounts: AccountReportRow[];
  total_opening_balance: string;
  total_closing_balance: string;
  total_income: string;
  total_expense: string;
}

export async function fetchAccountsReport(
  params: DateRangeParams & { status?: ReportStatusFilter }
): Promise<AccountsReport> {
  const { data } = await api.get<AccountsReport>('/reports/accounts/', { params });
  return data;
}

export interface CategoryTotal {
  name: string;
  total: string;
}

export interface SummaryReport {
  date_start: string;
  date_end: string;
  total_income: string;
  total_expense: string;
  balance: string;
  income_by_category: CategoryTotal[];
  expense_by_category: CategoryTotal[];
}

export async function fetchSummaryReport(
  params: DateRangeParams & { type?: 'income' | 'expense' }
): Promise<SummaryReport> {
  const { data } = await api.get<SummaryReport>('/reports/summary/', { params });
  return data;
}

export interface InvestmentReportRow {
  id: number;
  name: string;
  investment_type: string;
  investment_type_display: string;
  broker: string;
  total_invested: string;
  total_withdrawn: string;
  total_earnings: string;
  net_invested: string;
}

export interface InvestmentsReport {
  date_start: string;
  date_end: string;
  investments: InvestmentReportRow[];
  total_invested: string;
  total_withdrawn: string;
  total_earnings: string;
  net_invested: string;
}

export async function fetchInvestmentsReport(
  params: DateRangeParams & { investment_type?: string }
): Promise<InvestmentsReport> {
  const { data } = await api.get<InvestmentsReport>('/reports/investments/', { params });
  return data;
}

export interface DREReport {
  date_start: string;
  date_end: string;
  total_income: string;
  costs_by_category: CategoryTotal[];
  total_cost: string;
  gross_profit: string;
  operating_expenses: CategoryTotal[];
  total_operating_expenses: string;
  net_result: string;
}

export async function fetchDREReport(params: DateRangeParams): Promise<DREReport> {
  const { data } = await api.get<DREReport>('/reports/dre/', { params });
  return data;
}

// Diagnóstico financeiro (backend/reports/diagnosis.py). Default de status é
// "all" — inclui o que já está provisionado para os meses futuros.
export type MonthFlag = 'heavy' | 'surplus' | 'deficit' | 'normal' | 'empty';

export interface OscillationMonth {
  month: string; // YYYY-MM
  income: string;
  expense: string;
  net: string;
  expense_vs_average: number | null;
  flag: MonthFlag;
}

export interface OscillationsReport {
  end_month: string;
  status: ReportStatusFilter;
  masked: boolean;
  average_income?: string;
  average_expense?: string;
  average_net?: string;
  months: OscillationMonth[];
}

export async function fetchOscillationsReport(params: {
  end_month?: string;
  months?: number;
  status?: ReportStatusFilter;
}): Promise<OscillationsReport> {
  const { data } = await api.get<OscillationsReport>('/reports/oscillations/', { params });
  return data;
}

export type VerdictLevel = 'critical' | 'attention' | 'good' | 'excellent' | 'empty';
export type InsightTone = 'negative' | 'positive' | 'neutral';
export type ExpenseKind = 'recurring' | 'installment' | 'one_off';

export interface DiagnosisDriver {
  category_id: number | null;
  name: string;
  current: string;
  average: string;
  delta: string;
  delta_ratio: number | null;
  is_new: boolean;
}

export interface MonthDiagnosis {
  month: string;
  status: ReportStatusFilter;
  masked: boolean;
  income: string;
  expense: string;
  net: string;
  savings_rate: number | null;
  baseline: { months: number; requested_months: number; income: string; expense: string; net: string };
  verdict: { level: VerdictLevel; title: string; summary: string };
  insights: { tone: InsightTone; text: string }[];
  expense_increases: DiagnosisDriver[];
  expense_decreases: DiagnosisDriver[];
  income_changes: DiagnosisDriver[];
  composition: { kind: ExpenseKind; label: string; value: string; count: number; share: number | null }[];
  card_expense: string;
  pending_expense: string;
  top_expenses: {
    id: number;
    date: string;
    description: string;
    category: string | null;
    account: string;
    value: string;
    kind: ExpenseKind;
    is_cleared: boolean;
    share: number | null;
  }[];
}

export async function fetchMonthDiagnosis(params: {
  month: string;
  baseline_months?: number;
  status?: ReportStatusFilter;
}): Promise<MonthDiagnosis> {
  const { data } = await api.get<MonthDiagnosis>('/reports/oscillations/diagnosis/', { params });
  return data;
}
