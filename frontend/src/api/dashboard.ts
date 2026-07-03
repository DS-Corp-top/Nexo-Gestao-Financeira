import api from './client';

export interface DashboardKPIs {
  user_balance: string | null;
  monthly_income: string | null;
  monthly_expense: string | null;
  monthly_balance: string | null;
  credit_available: string | null;
  investments_total: string | null;
  investments_earnings: string | null;
  investments_month_deposited: string | null;
  investments_month_withdrawn: string | null;
  investments_month_earnings: string | null;
}

export interface CategoryBreakdown {
  name: string;
  total: string | null;
}

export interface ExpenseTrendPoint {
  label: string;
  total: string | null;
  is_current: boolean;
}

export interface DailyBreakdown {
  date: string;
  total: string | null;
}

export interface AccountSummary {
  id: number;
  name: string;
  account_type: string;
  balance: string | null;
  include_in_balance: boolean;
}

export interface DueNotificationItem {
  id: number;
  description: string;
  amount: string | null;
  date: string;
  category: string | null;
  account: string | null;
  overdue: boolean;
}

export interface DueNotifications {
  count: number;
  overdue_count: number;
  items: DueNotificationItem[];
}

export interface DashboardAlerts {
  pending_expense_count: number;
  pending_expense_total: string | null;
  credit_card_open_count: number;
  credit_card_open_total: string | null;
  credit_card_month_count: number;
  credit_card_month_total: string | null;
  credit_card_limit: string | null;
  consolidated_balance: string | null;
  balance_after_pending: string | null;
}

export interface DashboardData {
  selected_month: string;
  month_label: string;
  masked: boolean;
  kpis: DashboardKPIs;
  invoices: {
    total_gross: string | null;
    count: number;
  };
  expense_by_category: CategoryBreakdown[];
  income_by_category: CategoryBreakdown[];
  expense_trend: ExpenseTrendPoint[];
  income_trend: ExpenseTrendPoint[];
  daily_expense: DailyBreakdown[];
  daily_income: DailyBreakdown[];
  accounts: AccountSummary[];
  due_notifications: DueNotifications;
  alerts: DashboardAlerts;
}

export async function fetchDashboard(month?: string): Promise<DashboardData> {
  const params = month ? { month } : {};
  const { data } = await api.get<DashboardData>('/dashboard/', { params });
  return data;
}
