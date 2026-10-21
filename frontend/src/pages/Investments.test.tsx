import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
    updateInvestment: vi.fn(),
    deleteInvestment: vi.fn(),
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

  it('shows the tax entry type and renders tax launches as negative amounts', async () => {
    const investment = {
      id: 1, name: 'CDB Garantia', investment_type: 'fixed_income', currency: 'BRL',
      broker: '', is_active: true, total_invested: '1000.00', total_withdrawn: '0.00',
      total_earnings: '14.53', total_taxes: '2.53', net_invested: '1000.00', total_balance: '1012.00',
      entries: [
        { id: 10, investment: 1, entry_type: 'tax', amount: '2.53', date: '2026-07-03', description: 'IR semestral', created_at: '' },
      ],
    };
    (investmentsApi.fetchInvestments as any).mockResolvedValue([investment]);
    (investmentsApi.fetchInvestment as any).mockResolvedValue(investment);

    renderInvestments();

    fireEvent.click(await screen.findByText('CDB Garantia'));
    fireEvent.click(await screen.findByRole('button', { name: /Novo lançamento/i }));
    fireEvent.click(await screen.findByRole('button', { name: /Histórico de lançamentos/i }));

    expect(await screen.findByRole('option', { name: 'Imposto / IR/IOF' })).toBeInTheDocument();
    expect(await screen.findByText('IR semestral')).toBeInTheDocument();
    expect(screen.getAllByText('Imposto / IR/IOF').length).toBeGreaterThan(0);
    expect(screen.getByText((_, element) => element?.textContent?.replace(/\s/g, '') === '-R$2,53')).toBeInTheDocument();
  });

  describe('editing and deleting an investment', () => {
    const CDB = {
      id: 7, name: 'CDB + LIMITE', investment_type: 'fixed_income', currency: 'BRL',
      broker: 'Banco Inter', is_active: true, total_invested: '5818.80', total_withdrawn: '5579.90',
      total_earnings: '58.95', total_taxes: '0.00', net_invested: '238.90', total_balance: '297.85',
      entries: [],
    };

    beforeEach(() => {
      (investmentsApi.fetchInvestments as any).mockResolvedValue([CDB]);
      (investmentsApi.fetchInvestment as any).mockResolvedValue(CDB);
      (investmentsApi.updateInvestment as any).mockResolvedValue({ ...CDB, name: 'CDB Liquidez' });
      (investmentsApi.deleteInvestment as any).mockResolvedValue(undefined);
    });

    it('edits straight from the card without opening the detail', async () => {
      renderInvestments();
      fireEvent.click(await screen.findByRole('button', { name: 'Editar CDB + LIMITE' }));

      expect(await screen.findByText('Editar Investimento')).toBeInTheDocument();
      // O clique no lápis não pode abrir o detalhe do card.
      expect(investmentsApi.fetchInvestment).not.toHaveBeenCalled();

      fireEvent.change(screen.getByDisplayValue('CDB + LIMITE'), { target: { value: 'CDB Liquidez' } });
      fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

      await waitFor(() => expect(investmentsApi.updateInvestment).toHaveBeenCalled());
      expect((investmentsApi.updateInvestment as any).mock.calls[0][0]).toBe(7);
      expect((investmentsApi.updateInvestment as any).mock.calls[0][1]).toMatchObject({
        name: 'CDB Liquidez', investment_type: 'fixed_income', broker: 'Banco Inter',
      });
    });

    it('deletes from the card after an in-app confirmation that warns about the entries', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm');
      const { container } = renderInvestments();
      fireEvent.click(await screen.findByRole('button', { name: 'Excluir CDB + LIMITE' }));

      const dialog = await screen.findByRole('dialog', { name: 'Excluir investimento' });
      expectPortaledToBody(dialog, container);
      expect(dialog).toHaveTextContent('apaga também todos os aportes, resgates, rendimentos e impostos');
      expect(investmentsApi.fetchInvestment).not.toHaveBeenCalled();
      expect(investmentsApi.deleteInvestment).not.toHaveBeenCalled();

      fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));

      await waitFor(() => expect(investmentsApi.deleteInvestment).toHaveBeenCalled());
      expect((investmentsApi.deleteInvestment as any).mock.calls[0][0]).toBe(7);
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Excluir investimento' })).not.toBeInTheDocument());
      expect(confirmSpy).not.toHaveBeenCalled();
    });

    it('does not delete when the confirmation is cancelled', async () => {
      renderInvestments();
      fireEvent.click(await screen.findByRole('button', { name: 'Excluir CDB + LIMITE' }));
      const dialog = await screen.findByRole('dialog', { name: 'Excluir investimento' });

      fireEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));

      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Excluir investimento' })).not.toBeInTheDocument());
      expect(investmentsApi.deleteInvestment).not.toHaveBeenCalled();
    });

    it('keeps the confirmation open with an error when the delete fails', async () => {
      (investmentsApi.deleteInvestment as any).mockRejectedValue(new Error('boom'));
      renderInvestments();
      fireEvent.click(await screen.findByRole('button', { name: 'Excluir CDB + LIMITE' }));
      const dialog = await screen.findByRole('dialog', { name: 'Excluir investimento' });

      fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));

      expect(await within(dialog).findByText('Não foi possível excluir. Tente novamente.')).toBeInTheDocument();
      expect(screen.getByRole('dialog', { name: 'Excluir investimento' })).toBeInTheDocument();
    });

    it('offers edit and delete in the detail header and returns to the list after deleting', async () => {
      renderInvestments();
      fireEvent.click(await screen.findByText('CDB + LIMITE'));
      await screen.findByText('Aportes (Total)');

      fireEvent.click(screen.getByRole('button', { name: 'Editar investimento' }));
      expect(await screen.findByText('Editar Investimento')).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar' }));

      fireEvent.click(screen.getByRole('button', { name: 'Excluir investimento' }));
      const dialog = await screen.findByRole('dialog', { name: 'Excluir investimento' });
      fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));

      await waitFor(() => expect(investmentsApi.deleteInvestment).toHaveBeenCalled());
      await waitFor(() => expect(screen.queryByText('Aportes (Total)')).not.toBeInTheDocument());
    });

    it('routes the Excluir button of the edit form to the same confirmation', async () => {
      const confirmSpy = vi.spyOn(window, 'confirm');
      renderInvestments();
      fireEvent.click(await screen.findByRole('button', { name: 'Editar CDB + LIMITE' }));
      await screen.findByText('Editar Investimento');

      fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));

      expect(await screen.findByRole('dialog', { name: 'Excluir investimento' })).toBeInTheDocument();
      expect(screen.queryByText('Editar Investimento')).not.toBeInTheDocument();
      expect(confirmSpy).not.toHaveBeenCalled();
      expect(investmentsApi.deleteInvestment).not.toHaveBeenCalled();
    });
  });
});
