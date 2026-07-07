import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import Transactions from './Transactions';
import * as transactionsApi from '../api/transactions';
import * as accountsApi from '../api/accounts';
import type { Transaction } from '../api/transactions';
import { expectPortaledToBody } from '../test/portal';

vi.mock('../api/transactions', async () => {
  const actual = await vi.importActual<typeof import('../api/transactions')>('../api/transactions');
  return {
    ...actual,
    fetchTransactions: vi.fn(),
    fetchStatementSummary: vi.fn(),
    fetchClosedMonths: vi.fn(),
  };
});
vi.mock('../api/accounts', async () => {
  const actual = await vi.importActual<typeof import('../api/accounts')>('../api/accounts');
  return {
    ...actual,
    fetchAccounts: vi.fn(),
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
});
