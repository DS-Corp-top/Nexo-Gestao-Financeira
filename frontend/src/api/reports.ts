import api from './client';

export interface DateRangeParams {
  date_start: string;
  date_end: string;
}

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
  opening_balance: string;
  closing_balance: string;
  total_income: string;
  total_expense: string;
  transactions: TransactionsReportRow[];
}

export async function fetchTransactionsReport(
  params: DateRangeParams & { account?: number; category?: number }
): Promise<TransactionsReport> {
  const { data } = await api.get<TransactionsReport>('/reports/transactions/', { params });
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

export async function fetchSummaryReport(params: DateRangeParams): Promise<SummaryReport> {
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
