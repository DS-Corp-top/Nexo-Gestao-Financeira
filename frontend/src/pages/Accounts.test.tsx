import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import Accounts from './Accounts';
import * as accountsApi from '../api/accounts';
import type { Account } from '../api/accounts';
import { useIsAdmin } from '../hooks/useIsAdmin';

vi.mock('../api/accounts', async () => {
  const actual = await vi.importActual<typeof import('../api/accounts')>('../api/accounts');
  return {
    ...actual,
    fetchAccounts: vi.fn(),
  };
});
vi.mock('../hooks/useIsAdmin', () => ({
  useIsAdmin: vi.fn(),
}));

function renderAccounts() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Accounts />
    </QueryClientProvider>
  );
}

const baseAccount: Account = {
  id: 1,
  name: 'Conta Corrente',
  account_type: 'bank',
  currency: 'BRL',
  initial_balance: '0.00',
  credit_limit: null,
  backing_investment: null,
  include_in_balance: true,
  is_active: true,
  balance: '1000.00',
  available_credit_limit: null,
  created_at: '2026-01-01T00:00:00Z',
};

describe('Accounts Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useIsAdmin as any).mockReturnValue(true);
  });

  it('shows "Saldo Atual" for a bank account', async () => {
    (accountsApi.fetchAccounts as any).mockResolvedValue([baseAccount]);
    renderAccounts();

    await waitFor(() => {
      expect(screen.getByText('Saldo Atual')).toBeInTheDocument();
    });
    expect(screen.getByText('R$ 1.000,00')).toBeInTheDocument();
  });

  it('shows "Limite Disponível" instead of "Saldo Atual" for a card with a computable limit', async () => {
    const card: Account = {
      ...baseAccount,
      id: 2,
      name: 'Inter Mastercard',
      account_type: 'card',
      backing_investment: 5,
      balance: '186.50',
      available_credit_limit: '13.15',
    };
    (accountsApi.fetchAccounts as any).mockResolvedValue([card]);
    renderAccounts();

    await waitFor(() => {
      expect(screen.getByText('Limite Disponível')).toBeInTheDocument();
    });
    expect(screen.getByText('R$ 13,15')).toBeInTheDocument();
    expect(screen.queryByText('Saldo Atual')).not.toBeInTheDocument();
    expect(screen.queryByText('R$ 186,50')).not.toBeInTheDocument();
  });

  it('falls back to "Saldo Atual" for a card without a computable limit', async () => {
    const card: Account = {
      ...baseAccount,
      id: 3,
      name: 'Cartão sem limite',
      account_type: 'card',
      balance: '0.00',
      available_credit_limit: null,
    };
    (accountsApi.fetchAccounts as any).mockResolvedValue([card]);
    renderAccounts();

    await waitFor(() => {
      expect(screen.getByText('Saldo Atual')).toBeInTheDocument();
    });
  });

  it('shows "Limite Total" alongside "Limite Disponível" for a card with a fixed credit_limit', async () => {
    const card: Account = {
      ...baseAccount,
      id: 4,
      name: 'Cartão com limite fixo',
      account_type: 'card',
      credit_limit: '2000.00',
      available_credit_limit: '500.00',
    };
    (accountsApi.fetchAccounts as any).mockResolvedValue([card]);
    renderAccounts();

    await waitFor(() => {
      expect(screen.getByText('Limite Disponível')).toBeInTheDocument();
    });
    expect(screen.getByText('Limite Total')).toBeInTheDocument();
    expect(screen.getByText('R$ 2.000,00')).toBeInTheDocument();
  });
});
