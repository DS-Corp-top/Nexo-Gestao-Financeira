import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
    fetchAccountsReport: vi.fn(),
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
    const select = await screen.findByLabelText('Tipo de Relatório');

    expect(within(select).queryByRole('option', { name: /Faturas Emitidas/ })).not.toBeInTheDocument();
    // DRE is transaction-based, not invoice-based — must stay available to everyone.
    expect(within(select).getByRole('option', { name: /DRE Gerencial/ })).toBeInTheDocument();
  });

  it('shows "Faturas Emitidas" for superusers', async () => {
    (useAuth as any).mockReturnValue({ user: { is_superuser: true }, tenant: null });
    renderReports();

    const select = await screen.findByLabelText('Tipo de Relatório');
    await waitFor(() => {
      expect(within(select).getByRole('option', { name: /Faturas Emitidas/ })).toBeInTheDocument();
    });
  });

  it('does not fetch a report before "Gerar Relatório" is clicked', async () => {
    renderReports();
    fireEvent.change(await screen.findByLabelText('Tipo de Relatório'), { target: { value: 'dre' } });

    expect(reportsApi.fetchDREReport).not.toHaveBeenCalled();
  });

  it('generates the DRE Gerencial report and renders its KPI cards', async () => {
    (reportsApi.fetchDREReport as any).mockResolvedValue(DRE_REPORT);
    renderReports();

    fireEvent.change(await screen.findByLabelText('Tipo de Relatório'), { target: { value: 'dre' } });
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

    fireEvent.change(await screen.findByLabelText('Tipo de Relatório'), { target: { value: 'dre' } });
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
    fireEvent.change(await screen.findByLabelText('Tipo de Relatório'), { target: { value: 'dre' } });
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

  it('generates the Relatório por Conta report and renders its table', async () => {
    (reportsApi.fetchAccountsReport as any).mockResolvedValue({
      date_start: '2026-02-01',
      date_end: '2026-02-28',
      accounts: [
        {
          id: 1, name: 'Conta Corrente', account_type: 'bank', account_type_display: 'Banco',
          opening_balance: '1000.00', total_income: '500.00', total_expense: '200.00', closing_balance: '1300.00',
        },
      ],
      total_opening_balance: '1000.00',
      total_closing_balance: '1300.00',
      total_income: '500.00',
      total_expense: '200.00',
    });
    renderReports();
    await screen.findByLabelText('Tipo de Relatório');

    fireEvent.click(screen.getByRole('button', { name: 'Gerar Relatório' }));

    await waitFor(() => expect(reportsApi.fetchAccountsReport).toHaveBeenCalledTimes(1));
    // "Conta Corrente" appears twice — the table row and the balance pie chart legend.
    expect((await screen.findAllByText('Conta Corrente')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/R\$\s*1\.300,00/).length).toBeGreaterThan(0);
  });

  it('expands an account row to fetch and show its transactions', async () => {
    (reportsApi.fetchAccountsReport as any).mockResolvedValue({
      date_start: '2026-02-01',
      date_end: '2026-02-28',
      accounts: [
        {
          id: 1, name: 'Conta Corrente', account_type: 'bank', account_type_display: 'Banco',
          opening_balance: '1000.00', total_income: '500.00', total_expense: '200.00', closing_balance: '1300.00',
        },
      ],
      total_opening_balance: '1000.00',
      total_closing_balance: '1300.00',
      total_income: '500.00',
      total_expense: '200.00',
    });
    (reportsApi.fetchTransactionsReport as any).mockResolvedValue({
      date_start: '2026-02-01',
      date_end: '2026-02-28',
      account: 'Conta Corrente',
      opening_balance: '1000.00',
      closing_balance: '1300.00',
      total_income: '500.00',
      total_expense: '200.00',
      transactions: [
        { id: 10, date: '2026-02-05', description: 'Salário', transaction_type: 'income', amount: '500.00', account: 'Conta Corrente', category: 'Trabalho', is_cleared: true },
      ],
    });

    renderReports();
    await screen.findByLabelText('Tipo de Relatório');
    fireEvent.click(screen.getByRole('button', { name: 'Gerar Relatório' }));

    const table = await screen.findByRole('table');
    expect(reportsApi.fetchTransactionsReport).not.toHaveBeenCalled();

    fireEvent.click(within(table).getByText('Conta Corrente'));

    await waitFor(() =>
      expect(reportsApi.fetchTransactionsReport).toHaveBeenCalledWith(expect.objectContaining({ account: 1 }))
    );
    expect(await screen.findByText('Salário')).toBeInTheDocument();
  });

  it('filtering by type passes it to the expanded transaction fetch', async () => {
    (reportsApi.fetchAccountsReport as any).mockResolvedValue({
      date_start: '2026-02-01',
      date_end: '2026-02-28',
      accounts: [
        {
          id: 1, name: 'Conta Corrente', account_type: 'bank', account_type_display: 'Banco',
          opening_balance: '1000.00', total_income: '500.00', total_expense: '200.00', closing_balance: '1300.00',
        },
      ],
      total_opening_balance: '1000.00',
      total_closing_balance: '1300.00',
      total_income: '500.00',
      total_expense: '200.00',
    });
    (reportsApi.fetchTransactionsReport as any).mockResolvedValue({
      date_start: '2026-02-01',
      date_end: '2026-02-28',
      account: 'Conta Corrente',
      opening_balance: '1000.00',
      closing_balance: '1300.00',
      total_income: '0.00',
      total_expense: '200.00',
      transactions: [
        { id: 11, date: '2026-02-20', description: 'Aluguel', transaction_type: 'expense', amount: '200.00', account: 'Conta Corrente', category: 'Moradia', is_cleared: true },
      ],
    });

    renderReports();
    await screen.findByLabelText('Tipo de Relatório');
    fireEvent.click(screen.getByRole('button', { name: 'Gerar Relatório' }));

    const table = await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'expense' } });
    fireEvent.click(within(table).getByText('Conta Corrente'));

    await waitFor(() =>
      expect(reportsApi.fetchTransactionsReport).toHaveBeenCalledWith(
        expect.objectContaining({ account: 1, type: 'expense' })
      )
    );
    expect(await screen.findByText('Aluguel')).toBeInTheDocument();
  });

  it('defaults the status filter to "Baixadas" and refetches when changed', async () => {
    (reportsApi.fetchAccountsReport as any).mockResolvedValue({
      date_start: '2026-02-01',
      date_end: '2026-02-28',
      status: 'cleared',
      accounts: [
        {
          id: 1, name: 'Conta Corrente', account_type: 'bank', account_type_display: 'Banco',
          opening_balance: '1000.00', total_income: '500.00', total_expense: '200.00', closing_balance: '1300.00',
        },
      ],
      total_opening_balance: '1000.00',
      total_closing_balance: '1300.00',
      total_income: '500.00',
      total_expense: '200.00',
    });

    renderReports();
    await screen.findByLabelText('Tipo de Relatório');
    fireEvent.click(screen.getByRole('button', { name: 'Gerar Relatório' }));

    await waitFor(() =>
      expect(reportsApi.fetchAccountsReport).toHaveBeenCalledWith(expect.objectContaining({ status: 'cleared' }))
    );

    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'pending' } });

    await waitFor(() =>
      expect(reportsApi.fetchAccountsReport).toHaveBeenCalledWith(expect.objectContaining({ status: 'pending' }))
    );
  });

  it('passes the status filter to the expanded transaction fetch', async () => {
    (reportsApi.fetchAccountsReport as any).mockResolvedValue({
      date_start: '2026-02-01',
      date_end: '2026-02-28',
      status: 'pending',
      accounts: [
        {
          id: 1, name: 'Conta Corrente', account_type: 'bank', account_type_display: 'Banco',
          opening_balance: '1000.00', total_income: '0.00', total_expense: '450.00', closing_balance: '550.00',
        },
      ],
      total_opening_balance: '1000.00',
      total_closing_balance: '550.00',
      total_income: '0.00',
      total_expense: '450.00',
    });
    (reportsApi.fetchTransactionsReport as any).mockResolvedValue({
      date_start: '2026-02-01',
      date_end: '2026-02-28',
      account: 'Conta Corrente',
      status: 'pending',
      opening_balance: '1000.00',
      closing_balance: '550.00',
      total_income: '0.00',
      total_expense: '450.00',
      transactions: [
        { id: 12, date: '2026-02-20', description: 'Fatura a pagar', transaction_type: 'expense', amount: '450.00', account: 'Conta Corrente', category: 'Contas', is_cleared: false },
      ],
    });

    renderReports();
    await screen.findByLabelText('Tipo de Relatório');
    fireEvent.click(screen.getByRole('button', { name: 'Gerar Relatório' }));

    await screen.findByRole('table');
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'pending' } });

    // Changing the status refetches the accounts report (different query
    // key), which briefly unmounts the table — re-query it once settled.
    const table = await screen.findByRole('table');
    fireEvent.click(within(table).getByText('Conta Corrente'));

    await waitFor(() =>
      expect(reportsApi.fetchTransactionsReport).toHaveBeenCalledWith(
        expect.objectContaining({ account: 1, status: 'pending' })
      )
    );
    expect(await screen.findByText('Fatura a pagar')).toBeInTheDocument();
  });

  it('filtering by account narrows the table and recalculates the KPI totals', async () => {
    (reportsApi.fetchAccountsReport as any).mockResolvedValue({
      date_start: '2026-02-01',
      date_end: '2026-02-28',
      accounts: [
        {
          id: 1, name: 'Conta Corrente', account_type: 'bank', account_type_display: 'Banco',
          opening_balance: '1000.00', total_income: '500.00', total_expense: '200.00', closing_balance: '1300.00',
        },
        {
          id: 2, name: 'Reserva', account_type: 'savings', account_type_display: 'Poupança',
          opening_balance: '2000.00', total_income: '0.00', total_expense: '0.00', closing_balance: '2000.00',
        },
      ],
      total_opening_balance: '3000.00',
      total_closing_balance: '3300.00',
      total_income: '500.00',
      total_expense: '200.00',
    });
    (accountsApi.fetchAccounts as any).mockResolvedValue([
      { id: 1, name: 'Conta Corrente' },
      { id: 2, name: 'Reserva' },
    ]);

    renderReports();
    await screen.findByLabelText('Tipo de Relatório');
    fireEvent.click(screen.getByRole('button', { name: 'Gerar Relatório' }));

    const table = await screen.findByRole('table');
    expect(within(table).getByText('Reserva')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Conta'), { target: { value: '1' } });

    // "Reserva" still exists as an <option> in the filter select — the
    // assertion must stay scoped to the results table.
    await waitFor(() => expect(within(table).queryByText('Reserva')).not.toBeInTheDocument());
    expect(within(table).getAllByText(/R\$\s*1\.300,00/).length).toBeGreaterThan(0);
  });

  it('printing the Relatório por Conta report embeds each account statement', async () => {
    (reportsApi.fetchAccountsReport as any).mockResolvedValue({
      date_start: '2026-02-01',
      date_end: '2026-02-28',
      accounts: [
        {
          id: 1, name: 'Conta Corrente', account_type: 'bank', account_type_display: 'Banco',
          opening_balance: '1000.00', total_income: '500.00', total_expense: '200.00', closing_balance: '1300.00',
        },
      ],
      total_opening_balance: '1000.00',
      total_closing_balance: '1300.00',
      total_income: '500.00',
      total_expense: '200.00',
    });
    (reportsApi.fetchTransactionsReport as any).mockResolvedValue({
      date_start: '2026-02-01',
      date_end: '2026-02-28',
      account: 'Conta Corrente',
      opening_balance: '1000.00',
      closing_balance: '1300.00',
      total_income: '500.00',
      total_expense: '200.00',
      transactions: [
        { id: 10, date: '2026-02-05', description: 'Salário', transaction_type: 'income', amount: '500.00', account: 'Conta Corrente', category: 'Trabalho', is_cleared: true },
      ],
    });
    const fakeWindow = {} as Window;
    (printDocument.openPrintWindow as any).mockReturnValue(fakeWindow);

    renderReports();
    await screen.findByLabelText('Tipo de Relatório');
    fireEvent.click(screen.getByRole('button', { name: 'Gerar Relatório' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Imprimir' }));

    await waitFor(() => expect(printDocument.writePrintDocument).toHaveBeenCalledTimes(1));
    const [, html] = (printDocument.writePrintDocument as any).mock.calls[0];
    expect(html).toContain('Extrato — Conta Corrente');
    expect(html).toContain('Salário');
  });

  it('filtering the Resumo Financeiro by type refetches with the type param', async () => {
    (reportsApi.fetchSummaryReport as any).mockResolvedValue({
      date_start: '2026-02-01', date_end: '2026-02-28',
      total_income: '3000.00', total_expense: '0.00', balance: '3000.00',
      income_by_category: [{ name: 'Salario', total: '3000.00' }], expense_by_category: [],
    });

    renderReports();
    const select = await screen.findByLabelText('Tipo de Relatório');
    fireEvent.change(select, { target: { value: 'summary' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar Relatório' }));
    await waitFor(() => expect(reportsApi.fetchSummaryReport).toHaveBeenCalledWith(expect.objectContaining({ type: undefined })));

    fireEvent.change(screen.getByLabelText('Tipo'), { target: { value: 'income' } });

    await waitFor(() =>
      expect(reportsApi.fetchSummaryReport).toHaveBeenCalledWith(expect.objectContaining({ type: 'income' }))
    );
  });

  it('switching report type hides the previous result until generated again', async () => {
    (reportsApi.fetchDREReport as any).mockResolvedValue(DRE_REPORT);
    (reportsApi.fetchSummaryReport as any).mockResolvedValue({
      date_start: '2026-02-01', date_end: '2026-02-28',
      total_income: '0.00', total_expense: '0.00', balance: '0.00',
      income_by_category: [], expense_by_category: [],
    });

    renderReports();
    const select = await screen.findByLabelText('Tipo de Relatório');
    fireEvent.change(select, { target: { value: 'dre' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gerar Relatório' }));
    await waitFor(() => expect(screen.getByText('Lucro Bruto')).toBeInTheDocument());

    fireEvent.change(select, { target: { value: 'summary' } });
    expect(screen.queryByText('Lucro Bruto')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Imprimir' })).not.toBeInTheDocument();
  });
});
