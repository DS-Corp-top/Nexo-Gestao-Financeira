import type { ReactNode } from 'react';
import { render, screen, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

import Dashboard from './Dashboard';
import { ViewModeContext } from '../contexts/ViewModeContext';
import type { DashboardData } from '../api/dashboard';
import * as dashboardApi from '../api/dashboard';
import * as investmentsApi from '../api/investments';

vi.mock('../api/dashboard', async () => {
  const actual = await vi.importActual<typeof import('../api/dashboard')>('../api/dashboard');
  return {
    ...actual,
    fetchDashboard: vi.fn(),
  };
});

vi.mock('../api/investments', async () => {
  const actual = await vi.importActual<typeof import('../api/investments')>('../api/investments');
  return {
    ...actual,
    fetchInvestmentEntries: vi.fn(),
  };
});

vi.mock('../components/Dashboard/ChartsModal', () => ({
  default: () => null,
}));

vi.mock('recharts', () => {
  const Mock = ({ children }: { children?: ReactNode }) => <div>{children}</div>;
  return {
    ResponsiveContainer: Mock,
    BarChart: Mock,
    Bar: Mock,
    XAxis: Mock,
    YAxis: Mock,
    Tooltip: Mock,
    Cell: Mock,
    PieChart: Mock,
    Pie: Mock,
  };
});

function makeDashboardData(overrides: Partial<DashboardData> = {}): DashboardData {
  return {
    selected_month: '2026-08-01',
    month_label: 'Agosto 2026',
    masked: false,
    kpis: {
      user_balance: '1000.00',
      monthly_income: '5000.00',
      monthly_expense: '2000.00',
      monthly_balance: '3000.00',
      credit_available: '750.00',
      investments_total: '0.00',
      investments_earnings: '0.00',
      investments_month_deposited: '0.00',
      investments_month_withdrawn: '0.00',
      investments_month_earnings: '0.00',
    },
    invoices: {
      total_gross: '0.00',
      count: 0,
    },
    expense_by_category: [],
    income_by_category: [],
    expense_trend: [],
    income_trend: [],
    daily_expense: [],
    daily_income: [],
    accounts: [],
    due_notifications: {
      count: 0,
      overdue_count: 0,
      items: [],
    },
    alerts: {
      pending_expense_count: 0,
      pending_expense_total: '0.00',
      credit_card_open_count: 0,
      credit_card_open_total: '0.00',
      credit_card_month_count: 0,
      credit_card_month_total: '250.00',
      credit_card_limit: '750.00',
      debt_percentage: '40.00',
      consolidated_balance: '3750.00',
      balance_after_pending: '3750.00',
    },
    ...overrides,
  };
}

function mockDashboard(data: Partial<DashboardData> = {}) {
  (dashboardApi.fetchDashboard as any).mockResolvedValue(makeDashboardData(data));
}

function renderDashboard() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ViewModeContext.Provider value={{ viewMode: 'desktop', isMobile: false, toggle: () => {} }}>
        <MemoryRouter initialEntries={['/dashboard?month=2026-08']}>
          <Routes>
            <Route path="/dashboard" element={<Dashboard />} />
          </Routes>
        </MemoryRouter>
      </ViewModeContext.Provider>
    </QueryClientProvider>
  );
}

describe('Dashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (investmentsApi.fetchInvestmentEntries as any).mockResolvedValue([]);
    mockDashboard();
  });

  it('renders the committed income percentage card from dashboard alerts', async () => {
    renderDashboard();

    const debtHeading = await screen.findByText('Renda comprometida');
    const debtCard = debtHeading.closest('.kpi-card') as HTMLElement;
    expect(debtCard).not.toBeNull();
    expect(within(debtCard).getByText('40,0%')).toBeInTheDocument();
    expect(debtCard).toHaveTextContent('R$ 2.000,00');
    expect(debtCard).toHaveTextContent('R$ 5.000,00');
  });

  it('renders a placeholder when there is no committed income percentage to show', async () => {
    mockDashboard({
      alerts: {
        ...makeDashboardData().alerts,
        debt_percentage: null,
      },
    });

    renderDashboard();

    expect(await screen.findByText('Renda comprometida')).toBeInTheDocument();
    expect(screen.getByText('----')).toBeInTheDocument();
  });

  it('uses the expected visual tone for low, medium and high debt percentage', async () => {
    mockDashboard({
      alerts: {
        ...makeDashboardData().alerts,
        debt_percentage: '85.00',
      },
    });

    const { unmount } = renderDashboard();
    expect(await screen.findByText('85,0%')).toHaveClass('negative');
    unmount();

    mockDashboard({
      alerts: {
        ...makeDashboardData().alerts,
        debt_percentage: '65.00',
      },
    });
    const medium = renderDashboard();
    expect(await screen.findByText('65,0%')).toHaveClass('accent');
    medium.unmount();

    mockDashboard({
      alerts: {
        ...makeDashboardData().alerts,
        debt_percentage: '25.00',
      },
    });
    renderDashboard();
    expect(await screen.findByText('25,0%')).toHaveClass('positive');
  });
});
