import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import Investments from './Investments';
import * as investmentsApi from '../api/investments';
import { expectPortaledToBody } from '../test/portal';

vi.mock('../api/investments', async () => {
  const actual = await vi.importActual<typeof import('../api/investments')>('../api/investments');
  return {
    ...actual,
    fetchInvestments: vi.fn(),
    fetchInvestment: vi.fn(),
    fetchInvestmentEntries: vi.fn(),
    fetchInvestmentExchangeRates: vi.fn(),
    deleteInvestmentEntry: vi.fn(),
  };
});

function renderInvestments() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/investments']}>
        <Investments />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Investments Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (investmentsApi.fetchInvestments as any).mockResolvedValue([]);
    (investmentsApi.fetchInvestmentEntries as any).mockResolvedValue([]);
    (investmentsApi.fetchInvestmentExchangeRates as any).mockResolvedValue({
      base: 'BRL',
      rates: { BRL: '1', USD: '5', EUR: '6' },
      updated_at: '',
      source: '',
    });
  });

  it('renders the "Resumo geral" modal outside the page container when opened', async () => {
    const { container } = renderInvestments();

    fireEvent.click(await screen.findByLabelText('Abrir resumo geral'));

    const heading = await screen.findByText('Resumo geral');
    const modalRoot = heading.closest('.modal-overlay') as HTMLElement;
    expect(modalRoot).not.toBeNull();
    expectPortaledToBody(modalRoot, container);
  });

  it('asks for confirmation in an in-app modal before deleting an entry, instead of window.confirm', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    const investment = {
      id: 1, name: 'CDB Garantia', investment_type: 'fixed_income', currency: 'BRL',
      broker: '', is_active: true, total_invested: '1000.00', total_withdrawn: '0.00',
      total_earnings: '0.00', net_invested: '1000.00', total_balance: '1000.00',
      entries: [
        { id: 10, investment: 1, entry_type: 'deposit', amount: '1000.00', date: '2026-07-01', description: '', created_at: '' },
      ],
    };
    (investmentsApi.fetchInvestments as any).mockResolvedValue([investment]);
    (investmentsApi.fetchInvestment as any).mockResolvedValue(investment);
    (investmentsApi.deleteInvestmentEntry as any).mockResolvedValue(undefined);

    const { container } = renderInvestments();

    fireEvent.click(await screen.findByText('CDB Garantia'));
    fireEvent.click(await screen.findByText('Histórico de lançamentos'));
    fireEvent.click(await screen.findByLabelText('Excluir lançamento'));

    const heading = await screen.findByText('Excluir lançamento');
    const modalRoot = heading.closest('.card') as HTMLElement;
    expect(modalRoot).not.toBeNull();
    expectPortaledToBody(modalRoot, container);
    expect(confirmSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

    await vi.waitFor(() => expect(investmentsApi.deleteInvestmentEntry).toHaveBeenCalled());
    expect((investmentsApi.deleteInvestmentEntry as any).mock.calls[0][0]).toBe(10);
  });

  it('closes the delete confirmation without deleting when Cancelar is clicked', async () => {
    const investment = {
      id: 1, name: 'CDB Garantia', investment_type: 'fixed_income', currency: 'BRL',
      broker: '', is_active: true, total_invested: '1000.00', total_withdrawn: '0.00',
      total_earnings: '0.00', net_invested: '1000.00', total_balance: '1000.00',
      entries: [
        { id: 10, investment: 1, entry_type: 'deposit', amount: '1000.00', date: '2026-07-01', description: '', created_at: '' },
      ],
    };
    (investmentsApi.fetchInvestments as any).mockResolvedValue([investment]);
    (investmentsApi.fetchInvestment as any).mockResolvedValue(investment);
    (investmentsApi.deleteInvestmentEntry as any).mockResolvedValue(undefined);

    renderInvestments();

    fireEvent.click(await screen.findByText('CDB Garantia'));
    fireEvent.click(await screen.findByText('Histórico de lançamentos'));
    fireEvent.click(await screen.findByLabelText('Excluir lançamento'));
    await screen.findByText('Excluir lançamento', { selector: 'h3' });

    fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByText('Excluir lançamento', { selector: 'h3' })).not.toBeInTheDocument();
    expect(investmentsApi.deleteInvestmentEntry).not.toHaveBeenCalled();
  });
});
