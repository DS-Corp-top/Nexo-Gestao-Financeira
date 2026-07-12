import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import Transactions from './Transactions';
import * as transactionsApi from '../api/transactions';
import * as accountsApi from '../api/accounts';
import * as categoriesApi from '../api/categories';
import type { Transaction } from '../api/transactions';
import { expectPortaledToBody } from '../test/portal';

vi.mock('../api/transactions', async () => {
  const actual = await vi.importActual<typeof import('../api/transactions')>('../api/transactions');
  return {
    ...actual,
    fetchTransactions: vi.fn(),
    fetchStatementSummary: vi.fn(),
    fetchClosedMonths: vi.fn(),
    toggleTransactionCleared: vi.fn(),
  };
});
vi.mock('../api/accounts', async () => {
  const actual = await vi.importActual<typeof import('../api/accounts')>('../api/accounts');
  return {
    ...actual,
    fetchAccounts: vi.fn(),
  };
});
vi.mock('../api/categories', async () => {
  const actual = await vi.importActual<typeof import('../api/categories')>('../api/categories');
  return {
    ...actual,
    fetchCategories: vi.fn(),
  };
});

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 1,
    transaction_type: 'expense',
    amount: '100.00',
    date: '2026-07-07',
    account: 1,
    account_name: 'Conta Teste',
    destination_account: null,
    destination_account_name: '',
    category: null,
    category_name: '',
    description: 'Compra teste',
    is_cleared: false,
    is_ignored: false,
    recurrence_type: 'once',
    recurrence_interval: 1,
    recurrence_interval_unit: 'month',
    installment_count: null,
    installment_number: null,
    display_title: 'Compra teste',
    created_at: '2026-07-01T00:00:00Z',
    ...overrides,
  };
}

function renderTransactions() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/transactions?month=2026-07']}>
        <Transactions />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Transactions Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (transactionsApi.fetchTransactions as any).mockResolvedValue([makeTransaction()]);
    (transactionsApi.fetchStatementSummary as any).mockResolvedValue({
      current_balance: '0', monthly_balance: '0', credit_card_open_total: '0',
      credit_card_month_total: '0', credit_card_limit: '0', consolidated_balance: '0',
      pending_bank_total: '0', monthly_income_total: '0', monthly_expense_total: '0',
    });
    (transactionsApi.fetchClosedMonths as any).mockResolvedValue([]);
    (accountsApi.fetchAccounts as any).mockResolvedValue([]);
    (categoriesApi.fetchCategories as any).mockResolvedValue([]);
  });

  it('renders the ClearTransactionModal outside the page container when opened', async () => {
    const { container } = renderTransactions();

    fireEvent.click(await screen.findByLabelText('Ações da transação'));
    fireEvent.click(await screen.findByText('Baixar'));

    const heading = await screen.findByText('Compra teste', { selector: 'h3' });
    const modalRoot = heading.closest('.app-modal-content') as HTMLElement;
    expect(modalRoot).not.toBeNull();
    expectPortaledToBody(modalRoot, container);
  });

  it('allows changing the category when clearing a transaction', async () => {
    (accountsApi.fetchAccounts as any).mockResolvedValue([{ id: 1, name: 'Conta Teste' }]);
    (categoriesApi.fetchCategories as any).mockResolvedValue([
      { id: 10, name: 'Mercado', category_type: 'expense', expense_kind: 'operating', created_at: '' },
      { id: 20, name: 'Lazer', category_type: 'expense', expense_kind: 'operating', created_at: '' },
      { id: 30, name: 'Salário', category_type: 'income', expense_kind: 'operating', created_at: '' },
    ]);
    (transactionsApi.toggleTransactionCleared as any).mockResolvedValue(makeTransaction({ is_cleared: true, category: 20 }));

    renderTransactions();

    fireEvent.click(await screen.findByLabelText('Ações da transação'));
    fireEvent.click(await screen.findByText('Baixar'));

    await screen.findByText('Compra teste', { selector: 'h3' });

    const categorySelect = await screen.findByLabelText('Categoria');
    expect(screen.queryByText('Salário')).not.toBeInTheDocument();
    fireEvent.change(categorySelect, { target: { value: '20' } });

    fireEvent.click(screen.getByText('Confirmar baixa'));

    await vi.waitFor(() => {
      expect(transactionsApi.toggleTransactionCleared).toHaveBeenCalled();
    });
    const call = (transactionsApi.toggleTransactionCleared as any).mock.calls[0][0];
    expect(call.category).toBe(20);
  });

  it('opens Contas/Categorias as an overlay modal instead of navigating away', async () => {
    const { container } = renderTransactions();

    fireEvent.click(await screen.findByLabelText('Abrir mais ações'));
    fireEvent.click(await screen.findByText('Contas'));

    const accountsHeading = await screen.findByText('Contas', { selector: '.modal-title' });
    const modalRoot = accountsHeading.closest('.modal-overlay') as HTMLElement;
    expect(modalRoot).not.toBeNull();
    expectPortaledToBody(modalRoot, container);
    // Still on the transactions page — this didn't navigate away.
    expect(window.location.pathname).not.toBe('/accounts');

    fireEvent.click(screen.getByRole('button', { name: '×' }));
    expect(screen.queryByText('Contas', { selector: '.modal-title' })).not.toBeInTheDocument();

    fireEvent.click(await screen.findByLabelText('Abrir mais ações'));
    fireEvent.click(await screen.findByText('Categorias'));
    expect(await screen.findByText('Categorias', { selector: '.modal-title' })).toBeInTheDocument();
  });

  it('does not show a category field when clearing a transfer', async () => {
    (transactionsApi.fetchTransactions as any).mockResolvedValue([
      makeTransaction({ transaction_type: 'transfer', description: 'Transferencia teste', display_title: 'Transferencia teste' }),
    ]);

    renderTransactions();

    fireEvent.click(await screen.findByLabelText('Ações da transação'));
    fireEvent.click(await screen.findByText('Baixar'));

    await screen.findByText('Transferencia teste', { selector: 'h3' });
    expect(screen.queryByLabelText('Categoria')).not.toBeInTheDocument();
  });
});
