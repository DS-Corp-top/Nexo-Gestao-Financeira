import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import AccountModal from './AccountModal';
import * as investmentsApi from '../../api/investments';
import { type Account } from '../../api/accounts';

vi.mock('../../api/investments', async () => {
  const actual = await vi.importActual<typeof import('../../api/investments')>('../../api/investments');
  return {
    ...actual,
    fetchBacenBanks: vi.fn(),
    fetchInvestments: vi.fn(),
  };
});

const existingAccount: Account = {
  id: 1,
  name: 'Conta Corrente',
  account_type: 'bank',
  currency: 'BRL',
  initial_balance: '1000.00',
  credit_limit: null,
  backing_investment: null,
  include_in_balance: true,
  is_active: true,
  balance: '1000.00',
  created_at: '2026-01-01T00:00:00Z',
};

function renderModal(props: Partial<React.ComponentProps<typeof AccountModal>> = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const onClose = vi.fn();
  const onSave = vi.fn().mockResolvedValue(undefined);
  render(
    <QueryClientProvider client={queryClient}>
      <AccountModal
        account={null}
        isOpen
        onClose={onClose}
        onSave={onSave}
        {...props}
      />
    </QueryClientProvider>
  );
  return { onClose, onSave };
}

describe('AccountModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (investmentsApi.fetchBacenBanks as any).mockResolvedValue([]);
    (investmentsApi.fetchInvestments as any).mockResolvedValue([
      { id: 5, name: 'CDB Garantia', investment_type: 'fixed_income', net_invested: '1000.00', total_balance: '1000.00' },
    ]);
  });

  it('does not show a delete button when creating a new account', () => {
    renderModal();
    expect(screen.queryByRole('button', { name: 'Excluir Conta' })).not.toBeInTheDocument();
  });

  it('does not show the "Conta ativa" toggle when creating a new account', () => {
    renderModal();
    expect(screen.queryByLabelText(/Conta ativa/)).not.toBeInTheDocument();
  });

  it('disables the initial balance field when editing an existing account', () => {
    renderModal({ account: existingAccount });
    expect(screen.getByLabelText('Saldo Inicial')).toBeDisabled();
  });

  it('only shows the credit limit field for card accounts', () => {
    renderModal({ account: existingAccount });
    expect(screen.queryByLabelText('Limite do Cartão')).not.toBeInTheDocument();

    renderModal({ account: { ...existingAccount, account_type: 'card' } });
    expect(screen.getByLabelText('Limite do Cartão')).toBeInTheDocument();
  });

  it('shows a delete button with a two-step confirmation when editing', () => {
    renderModal({ account: existingAccount, onDelete: vi.fn().mockResolvedValue(undefined) });

    fireEvent.click(screen.getByRole('button', { name: 'Excluir Conta' }));

    expect(screen.getByText(/Tem certeza que deseja excluir/)).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole('button', { name: 'Cancelar' })[0]);
    expect(screen.queryByText(/Tem certeza que deseja excluir/)).not.toBeInTheDocument();
  });

  it('calls onDelete and closes the modal after confirming deletion', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const { onClose } = renderModal({ account: existingAccount, onDelete });

    fireEvent.click(screen.getByRole('button', { name: 'Excluir Conta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim, excluir' }));

    await waitFor(() => expect(onDelete).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('shows the backend error and keeps the modal open when deletion is blocked', async () => {
    const onDelete = vi.fn().mockRejectedValue({
      response: { data: { detail: 'Esta conta tem transações lançadas e por isso não pode ser excluída.' } },
    });
    const { onClose } = renderModal({ account: existingAccount, onDelete });

    fireEvent.click(screen.getByRole('button', { name: 'Excluir Conta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Sim, excluir' }));

    await waitFor(() =>
      expect(screen.getByText(/Esta conta tem transações lançadas/)).toBeInTheDocument()
    );
    expect(onClose).not.toHaveBeenCalled();
  });

  it('offers linking a card to an investment and hides the fixed limit once one is chosen', async () => {
    renderModal({ account: { ...existingAccount, account_type: 'card' } });

    const select = await screen.findByLabelText(/Limite garantido por investimento/);
    await screen.findByText(/CDB Garantia/);
    expect(screen.getByLabelText('Limite do Cartão')).toBeInTheDocument();

    fireEvent.change(select, { target: { value: '5' } });

    expect(screen.queryByLabelText('Limite do Cartão')).not.toBeInTheDocument();
  });

  it('pre-selects the already-linked investment when editing a card account', async () => {
    renderModal({ account: { ...existingAccount, account_type: 'card', backing_investment: 5 } });

    const select = (await screen.findByLabelText(/Limite garantido por investimento/)) as HTMLSelectElement;
    await screen.findByText(/CDB Garantia/);

    expect(select.value).toBe('5');
  });

  it('saves the selected investment id as backing_investment', async () => {
    const { onSave } = renderModal({ account: { ...existingAccount, account_type: 'card' } });

    const select = await screen.findByLabelText(/Limite garantido por investimento/);
    await screen.findByText(/CDB Garantia/);
    fireEvent.change(select, { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].backing_investment).toBe(5);
  });

  it('unlinking back to "Nenhum" sends backing_investment as null and shows the fixed limit again', async () => {
    const { onSave } = renderModal({
      account: { ...existingAccount, account_type: 'card', backing_investment: 5 },
    });

    const select = await screen.findByLabelText(/Limite garantido por investimento/);
    expect(screen.queryByLabelText('Limite do Cartão')).not.toBeInTheDocument();

    fireEvent.change(select, { target: { value: '' } });
    expect(screen.getByLabelText('Limite do Cartão')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][0].backing_investment).toBeNull();
  });
});
