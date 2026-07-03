import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import Invoices from './Invoices';
import * as invoicesApi from '../api/invoices';
import * as accountsApi from '../api/accounts';
import { useIsAdmin } from '../hooks/useIsAdmin';
import type { Invoice } from '../api/invoices';

vi.mock('../api/invoices', async () => {
  const actual = await vi.importActual<typeof import('../api/invoices')>('../api/invoices');
  return {
    ...actual,
    fetchInvoices: vi.fn(),
    fetchInvoicePrintData: vi.fn(),
    cancelInvoice: vi.fn(),
    deleteInvoice: vi.fn(),
    payInvoice: vi.fn(),
    toggleInvoiceNoteIssued: vi.fn(),
  };
});
vi.mock('../api/accounts', () => ({
  fetchAccounts: vi.fn(),
}));
vi.mock('../hooks/useIsAdmin', () => ({
  useIsAdmin: vi.fn(),
}));
vi.mock('../components/Invoices/InvoiceModal', () => ({
  default: () => null,
}));

function makeInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    id: 1,
    issuer_company: null,
    issuer_company_name: '',
    number: 1,
    number_display: '0001/2026',
    status: 'issued',
    issue_date: '2026-01-10',
    due_date: '2026-01-20',
    client_name: 'Cliente A',
    client_document: '11144477735',
    client_email: '',
    client_phone: '',
    client_address: '',
    client_city: '',
    service_code: '101',
    service_code_description: '',
    service_description: 'Serviço',
    gross_value: '1000.00',
    deductions: '0.00',
    calculation_base: '1000.00',
    iss_rate: '0',
    iss_withheld: false,
    pis_rate: '0',
    cofins_rate: '0',
    csll_rate: '0',
    ir_rate: '0',
    inss_rate: '0',
    iss_value: '0',
    pis_value: '0',
    cofins_value: '0',
    csll_value: '0',
    ir_value: '0',
    inss_value: '0',
    total_withheld: '0',
    net_value: '1000.00',
    recurrence_type: 'once',
    recurrence_interval: 1,
    recurrence_interval_unit: 'month',
    installment_count: null,
    expected_account: null,
    expected_account_name: '',
    note_issued: false,
    paid_at: null,
    transaction: null,
    notes: '',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderInvoices() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Invoices />
    </QueryClientProvider>
  );
}

describe('Invoices Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (accountsApi.fetchAccounts as any).mockResolvedValue([]);
    (useIsAdmin as any).mockReturnValue(true);
  });

  it('renders invoice rows returned by the API', async () => {
    (invoicesApi.fetchInvoices as any).mockResolvedValue([
      makeInvoice({ id: 1, number_display: '0001/2026', client_name: 'Cliente A' }),
      makeInvoice({ id: 2, number_display: '0002/2026', client_name: 'Cliente B' }),
    ]);

    renderInvoices();

    await waitFor(() => {
      expect(screen.getByText('Cliente A')).toBeInTheDocument();
    });
    expect(screen.getByText('Cliente B')).toBeInTheDocument();
    expect(screen.getByText('0001/2026')).toBeInTheDocument();
  });

  it('counts and sums invoices with the note marked as issued in the summary cards', async () => {
    (invoicesApi.fetchInvoices as any).mockResolvedValue([
      makeInvoice({ id: 1, client_name: 'Cliente A', note_issued: true, net_value: '1000.00' }),
      makeInvoice({ id: 2, client_name: 'Cliente B', note_issued: true, net_value: '1000.00' }),
      makeInvoice({ id: 3, client_name: 'Cliente C', note_issued: false, net_value: '1000.00' }),
    ]);

    renderInvoices();

    await waitFor(() => {
      expect(screen.getByText('Cliente A')).toBeInTheDocument();
    });

    const countCard = screen.getByText('Notas Emitidas').parentElement!;
    expect(within(countCard).getByText('2')).toBeInTheDocument();

    const totalCard = screen.getByText('Total Nota Emitida').parentElement!;
    expect(within(totalCard).getByText('R$ 2.000,00')).toBeInTheDocument();
  });

  it('shows "Nova Fatura" only for admins', async () => {
    (invoicesApi.fetchInvoices as any).mockResolvedValue([]);
    (useIsAdmin as any).mockReturnValue(false);

    renderInvoices();

    await waitFor(() => {
      expect(screen.getByText(/Nenhuma fatura encontrada/i)).toBeInTheDocument();
    });
    expect(screen.queryByText('Nova Fatura')).not.toBeInTheDocument();
  });

  it('sorts rows by column when a header is clicked', async () => {
    (invoicesApi.fetchInvoices as any).mockResolvedValue([
      makeInvoice({ id: 1, number_display: '0001/2026', client_name: 'Zeta' }),
      makeInvoice({ id: 2, number_display: '0002/2026', client_name: 'Alpha' }),
    ]);

    renderInvoices();

    await waitFor(() => {
      expect(screen.getByText('Zeta')).toBeInTheDocument();
    });

    const table = screen.getByRole('table');
    const clientNamesBefore = within(table).getAllByRole('row').slice(1).map((row) => row.textContent);
    expect(clientNamesBefore[0]).toContain('Zeta');

    fireEvent.click(screen.getByText('Cliente'));

    await waitFor(() => {
      const clientNamesAfter = within(table).getAllByRole('row').slice(1).map((row) => row.textContent);
      expect(clientNamesAfter[0]).toContain('Alpha');
    });
  });

  it('only refetches with the draft filters after clicking "Aplicar"', async () => {
    (invoicesApi.fetchInvoices as any).mockResolvedValue([]);

    renderInvoices();

    await waitFor(() => {
      expect(invoicesApi.fetchInvoices).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByText('Filtros'));
    fireEvent.change(screen.getByDisplayValue('Todos'), { target: { value: 'paid' } });

    // Changing the draft alone must not trigger another fetch.
    expect(invoicesApi.fetchInvoices).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'Aplicar' }));

    await waitFor(() => {
      expect(invoicesApi.fetchInvoices).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: 'paid' })
      );
    });
  });

  it('resets filters immediately when clicking "Limpar"', async () => {
    (invoicesApi.fetchInvoices as any).mockResolvedValue([]);

    renderInvoices();

    await waitFor(() => {
      expect(invoicesApi.fetchInvoices).toHaveBeenCalledTimes(1);
    });

    fireEvent.click(screen.getByText('Filtros'));
    fireEvent.change(screen.getByDisplayValue('Todos'), { target: { value: 'draft' } });
    fireEvent.click(screen.getByRole('button', { name: 'Limpar' }));

    await waitFor(() => {
      expect(invoicesApi.fetchInvoices).toHaveBeenLastCalledWith(
        expect.objectContaining({ status: '', start: '', end: '' })
      );
    });
  });

  it('toggles the "nota emitida" flag from the actions menu', async () => {
    (invoicesApi.fetchInvoices as any).mockResolvedValue([
      makeInvoice({ id: 5, number_display: '0005/2026', client_name: 'Cliente C', status: 'issued', note_issued: false }),
    ]);
    (invoicesApi.toggleInvoiceNoteIssued as any).mockResolvedValue(
      makeInvoice({ id: 5, note_issued: true })
    );

    renderInvoices();

    await waitFor(() => {
      expect(screen.getByText('Nota Pendente')).toBeInTheDocument();
    });

    const row = screen.getByText('Cliente C').closest('tr')!;
    fireEvent.click(within(row).getByRole('button'));
    fireEvent.click(await screen.findByText('Marcar Nota Emitida'));

    await waitFor(() => {
      expect(invoicesApi.toggleInvoiceNoteIssued).toHaveBeenCalledWith(5, expect.anything());
    });
  });
});
