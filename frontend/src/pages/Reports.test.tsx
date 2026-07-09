import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import Reports from './Reports';
import * as reportsApi from '../api/reports';
import * as accountsApi from '../api/accounts';
import * as categoriesApi from '../api/categories';
import * as tenantApi from '../api/tenant';
import * as printDocument from '../utils/printDocument';
import { useAuth } from '../contexts/AuthContext';

vi.mock('../api/reports', async () => {
  const actual = await vi.importActual<typeof import('../api/reports')>('../api/reports');
  return {
    ...actual,
    fetchTransactionsReport: vi.fn(),
    fetchSummaryReport: vi.fn(),
    fetchInvestmentsReport: vi.fn(),
    fetchDREReport: vi.fn(),
  };
});
vi.mock('../api/invoices', async () => {
  const actual = await vi.importActual<typeof import('../api/invoices')>('../api/invoices');
  return { ...actual, fetchInvoices: vi.fn() };
});
vi.mock('../api/accounts', () => ({ fetchAccounts: vi.fn() }));
vi.mock('../api/categories', () => ({ fetchCategories: vi.fn() }));
vi.mock('../api/tenant', async () => {
  const actual = await vi.importActual<typeof import('../api/tenant')>('../api/tenant');
  return { ...actual, fetchTenantProfile: vi.fn() };
});
vi.mock('../contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('../contexts/AuthContext')>('../contexts/AuthContext');
  return { ...actual, useAuth: vi.fn() };
});
vi.mock('../utils/printDocument', async () => {
  const actual = await vi.importActual<typeof import('../utils/printDocument')>('../utils/printDocument');
  return { ...actual, openPrintWindow: vi.fn(), writePrintDocument: vi.fn() };
});

function renderReports() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Reports />
    </QueryClientProvider>
  );
}

const DRE_REPORT: reportsApi.DREReport = {
  date_start: '2026-02-01',
  date_end: '2026-02-28',
  total_income: '6500.00',
  costs_by_category: [{ name: 'Materiais', total: '800.00' }],
  total_cost: '800.00',
  gross_profit: '5700.00',
  operating_expenses: [{ name: 'Aluguel', total: '1200.00' }],
  total_operating_expenses: '1200.00',
  net_result: '4500.00',
};

describe('Reports Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (accountsApi.fetchAccounts as any).mockResolvedValue([]);
    (categoriesApi.fetchCategories as any).mockResolvedValue([]);
    (tenantApi.fetchTenantProfile as any).mockResolvedValue({ id: 1, name: 'Empresa Teste', logo: null });
    (useAuth as any).mockReturnValue({ user: { is_superuser: false }, tenant: null });
  });

  it('hides "Faturas Emitidas" for non-superusers', async () => {
    renderReports();
    await waitFor(() => expect(screen.getByRole('button', { name: /Extrato de Transações/ })).toBeInTheDocument());

    expect(screen.queryByRole('button', { name: /Faturas Emitidas/ })).not.toBeInTheDocument();
    // DRE is transaction-based, not invoice-based — must stay available to everyone.
    expect(screen.getByRole('button', { name: /DRE Gerencial/ })).toBeInTheDocument();
  });

  it('shows "Faturas Emitidas" for superusers', async () => {
    (useAuth as any).mockReturnValue({ user: { is_superuser: true }, tenant: null });
    renderReports();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Faturas Emitidas/ })).toBeInTheDocument();
    });
  });

  it('does not fetch a report before "Gerar Relatório" is clicked', async () => {
    renderReports();
    await waitFor(() => expect(screen.getByRole('button', { name: /DRE Gerencial/ })).toBeInTheDocument());

    expect(reportsApi.fetchDREReport).not.toHaveBeenCalled();
  });

  it('generates the DRE Gerencial report and renders its KPI cards', async () => {
    (reportsApi.fetchDREReport as any).mockResolvedValue(DRE_REPORT);
    renderReports();

    fireEvent.click(await screen.findByRole('button', { name: /DRE Gerencial/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Gerar Relatório' }));

    await waitFor(() => expect(reportsApi.fetchDREReport).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('Lucro Bruto')).toBeInTheDocument();
    // Values appear twice (KPI card + "Demonstração do Resultado" table), and
    // toLocaleString('pt-BR', {style:'currency'}) uses a non-breaking space
    // between "R$" and the amount — match on the digits, allow multiple hits.
    expect(screen.getAllByText(/R\$\s*5\.700,00/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/R\$\s*4\.500,00/).length).toBeGreaterThan(0);
  });

  it('shows the Imprimir button only after a report has been generated', async () => {
    (reportsApi.fetchDREReport as any).mockResolvedValue(DRE_REPORT);
    renderReports();

    fireEvent.click(await screen.findByRole('button', { name: /DRE Gerencial/ }));
    expect(screen.queryByRole('button', { name: 'Imprimir' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Gerar Relatório' }));

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Imprimir' })).toBeInTheDocument();
    });
  });

  it('clicking Imprimir opens the print window with the report data', async () => {
    (reportsApi.fetchDREReport as any).mockResolvedValue(DRE_REPORT);
    const fakeWindow = {} as Window;
    (printDocument.openPrintWindow as any).mockReturnValue(fakeWindow);

    renderReports();
    fireEvent.click(await screen.findByRole('button', { name: /DRE Gerencial/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Gerar Relatório' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Imprimir' }));

    await waitFor(() => {
      expect(printDocument.writePrintDocument).toHaveBeenCalledTimes(1);
    });
    const [windowArg, html] = (printDocument.writePrintDocument as any).mock.calls[0];
    expect(windowArg).toBe(fakeWindow);
    expect(html).toContain('DRE Gerencial');
    expect(html).toMatch(/R\$\s*5\.700,00/);
  });

  it('switching report type hides the previous result until generated again', async () => {
    (reportsApi.fetchDREReport as any).mockResolvedValue(DRE_REPORT);
    (reportsApi.fetchSummaryReport as any).mockResolvedValue({
      date_start: '2026-02-01', date_end: '2026-02-28',
      total_income: '0.00', total_expense: '0.00', balance: '0.00',
      income_by_category: [], expense_by_category: [],
    });

    renderReports();
    fireEvent.click(await screen.findByRole('button', { name: /DRE Gerencial/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Gerar Relatório' }));
    await waitFor(() => expect(screen.getByText('Lucro Bruto')).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Resumo Financeiro/ }));
    expect(screen.queryByText('Lucro Bruto')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Imprimir' })).not.toBeInTheDocument();
  });
});
