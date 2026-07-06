import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import TransactionForm from './TransactionForm';
import * as transactionsApi from '../api/transactions';
import * as accountsApi from '../api/accounts';
import * as categoriesApi from '../api/categories';
import type { Transaction } from '../api/transactions';

vi.mock('../api/transactions', async () => {
  const actual = await vi.importActual<typeof import('../api/transactions')>('../api/transactions');
  return {
    ...actual,
    fetchTransactionById: vi.fn(),
    createTransaction: vi.fn(),
    updateTransaction: vi.fn(),
  };
});
vi.mock('../api/accounts', () => ({
  fetchAccounts: vi.fn(),
}));
vi.mock('../api/categories', () => ({
  fetchCategories: vi.fn(),
}));

function makeTransaction(overrides: Partial<Transaction> = {}): Transaction {
  return {
    id: 1,
    transaction_type: 'expense',
    amount: '100.00',
    date: '2026-01-10',
    account: 1,
    account_name: 'Conta A',
    destination_account: null,
    destination_account_name: '',
    category: null,
    category_name: '',
    description: 'Compra parcelada',
    is_cleared: false,
    is_ignored: false,
    recurrence_type: 'once',
    recurrence_interval: 1,
    recurrence_interval_unit: 'month',
    installment_count: null,
    installment_number: null,
    display_title: 'Compra parcelada',
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

function renderEditForm(id = '1') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[`/transactions/${id}/edit`]}>
        <Routes>
          <Route path="/transactions/:id/edit" element={<TransactionForm />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('TransactionForm - edit installment transaction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (accountsApi.fetchAccounts as any).mockResolvedValue([{ id: 1, name: 'Conta A' }]);
    (categoriesApi.fetchCategories as any).mockResolvedValue([]);
  });

  it('preserves installment_count when saving an edited installment transaction', async () => {
    (transactionsApi.fetchTransactionById as any).mockResolvedValue(
      makeTransaction({ recurrence_type: 'installment', installment_count: 5, installment_number: 2 })
    );
    (transactionsApi.updateTransaction as any).mockResolvedValue(makeTransaction());

    renderEditForm();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Salvar alterações/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Salvar alterações/i }));

    await waitFor(() => {
      expect(transactionsApi.updateTransaction).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ recurrence_type: 'installment', installment_count: 5 })
      );
    });
  });

  it('keeps installment_count null when editing a non-installment transaction', async () => {
    (transactionsApi.fetchTransactionById as any).mockResolvedValue(
      makeTransaction({ recurrence_type: 'once', installment_count: null })
    );
    (transactionsApi.updateTransaction as any).mockResolvedValue(makeTransaction());

    renderEditForm();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /Salvar alterações/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole('button', { name: /Salvar alterações/i }));

    await waitFor(() => {
      expect(transactionsApi.updateTransaction).toHaveBeenCalledWith(
        1,
        expect.objectContaining({ recurrence_type: 'once', installment_count: null })
      );
    });
  });
});
