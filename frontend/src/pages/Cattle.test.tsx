import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import Cattle from './Cattle';
import * as cattleApi from '../api/cattle';

vi.mock('../api/cattle', async () => {
  const actual = await vi.importActual<typeof import('../api/cattle')>('../api/cattle');
  return {
    ...actual,
    fetchCattleLots: vi.fn(),
    fetchCattleLot: vi.fn(),
    createCattleLot: vi.fn(),
    createCattleLotEntry: vi.fn(),
    deleteCattleLot: vi.fn(),
    deleteCattleLotEntry: vi.fn(),
    updateCattleLot: vi.fn(),
  };
});

const baseLot: cattleApi.CattleLot = {
  id: 1,
  name: 'Lote Nelore',
  system: 'feedlot',
  status: 'open',
  location: 'Curral 3',
  start_date: '2026-01-01',
  end_date: null,
  notes: '',
  acquisition_cost: '200000.00',
  feed_cost: '50000.00',
  medicine_cost: '3000.00',
  vaccine_cost: '2000.00',
  freight_cost: '4000.00',
  other_costs: '1000.00',
  total_cost: '260000.00',
  sales_revenue: '300000.00',
  profit: '40000.00',
  margin_percent: '13.33',
  cost_per_head: '2600.00',
  feed_cost_per_head_day: '5.00',
  heads_purchased: 100,
  heads_sold: 60,
  heads_on_hand: 40,
  avg_purchase_weight_kg: '360.00',
  avg_sale_weight_kg: '520.00',
  days_on_feed: 100,
};

function renderCattle() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={['/cattle']}>
        <Cattle />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

describe('Cattle page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (cattleApi.fetchCattleLots as any).mockResolvedValue([baseLot]);
    (cattleApi.fetchCattleLot as any).mockResolvedValue({
      ...baseLot,
      entries: [
        { id: 10, lot: 1, entry_type: 'acquisition', date: '2026-01-01', amount: '200000.00', head_count: 100, weight_kg: '36000.00', description: '', created_at: '' },
      ],
    });
  });

  it('shows the lot card with profit and margin, plus aggregated totals', async () => {
    renderCattle();

    expect(await screen.findByText('Lote Nelore')).toBeInTheDocument();
    expect(screen.getByText('40 de 100')).toBeInTheDocument();
    expect(screen.getAllByText(/13,3%/).length).toBeGreaterThan(0);
    expect(screen.getByText('Cabeças em estoque', { selector: '.kpi-label' })).toBeInTheDocument();
  });

  it('shows an empty state when there are no lots', async () => {
    (cattleApi.fetchCattleLots as any).mockResolvedValue([]);
    renderCattle();

    expect(await screen.findByText('Nenhum lote encontrado')).toBeInTheDocument();
  });

  it('opens the detail and posts a sale entry with head count and weight', async () => {
    (cattleApi.createCattleLotEntry as any).mockResolvedValue({ id: 11 });
    renderCattle();

    fireEvent.click(await screen.findByText('Lote Nelore'));
    expect(await screen.findByText('Custo de trato')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Tipo de lançamento'), { target: { value: 'sale' } });
    fireEvent.change(screen.getByPlaceholderText('Valor (R$)'), { target: { value: '150000' } });
    fireEvent.change(screen.getByLabelText('Cabeças'), { target: { value: '30' } });
    fireEvent.change(screen.getByLabelText('Peso total (kg)'), { target: { value: '15600' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() => expect(cattleApi.createCattleLotEntry).toHaveBeenCalled());
    expect((cattleApi.createCattleLotEntry as any).mock.calls[0][0]).toMatchObject({
      lot: 1,
      entry_type: 'sale',
      amount: '150000',
      head_count: 30,
      weight_kg: '15600',
    });
  });

  it('offers Remédio, Vacina and Frete and posts them as costs without heads', async () => {
    (cattleApi.createCattleLotEntry as any).mockResolvedValue({ id: 12 });
    renderCattle();

    fireEvent.click(await screen.findByText('Lote Nelore'));
    const select = await screen.findByLabelText('Tipo de lançamento');
    const options = Array.from((select as HTMLSelectElement).options).map((o) => o.textContent);
    expect(options).toEqual(['Aquisição', 'Trato / Alimentação', 'Remédio', 'Vacina', 'Frete', 'Outros custos', 'Venda']);
    expect(screen.getByText('Remédios', { selector: '.kpi-label' })).toBeInTheDocument();
    expect(screen.getByText('Vacinas', { selector: '.kpi-label' })).toBeInTheDocument();
    expect(screen.getByText('Frete', { selector: '.kpi-label' })).toBeInTheDocument();

    fireEvent.change(select, { target: { value: 'vaccine' } });
    expect(screen.queryByLabelText('Cabeças')).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText('Ex.: aftosa, clostridiose')).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText('Valor (R$)'), { target: { value: '2000' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() => expect(cattleApi.createCattleLotEntry).toHaveBeenCalled());
    expect((cattleApi.createCattleLotEntry as any).mock.calls[0][0]).toMatchObject({
      entry_type: 'vaccine', amount: '2000', head_count: null, weight_kg: null,
    });
  });

  it('hides head count and weight for feed entries', async () => {
    renderCattle();

    fireEvent.click(await screen.findByText('Lote Nelore'));
    fireEvent.change(await screen.findByLabelText('Tipo de lançamento'), { target: { value: 'feed' } });

    expect(screen.queryByLabelText('Cabeças')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Peso total (kg)')).not.toBeInTheDocument();
  });

  it('shows the API validation message when a sale exceeds the stock', async () => {
    (cattleApi.createCattleLotEntry as any).mockRejectedValue({
      response: { data: { head_count: ['Venda de 50 cabeças excede o estoque do lote (40).'] } },
    });
    renderCattle();

    fireEvent.click(await screen.findByText('Lote Nelore'));
    fireEvent.change(await screen.findByLabelText('Tipo de lançamento'), { target: { value: 'sale' } });
    fireEvent.change(screen.getByPlaceholderText('Valor (R$)'), { target: { value: '1000' } });
    fireEvent.change(screen.getByLabelText('Cabeças'), { target: { value: '50' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('excede o estoque do lote (40)');
  });

  it('confirms in an in-app dialog before deleting a lot', async () => {
    const confirmSpy = vi.spyOn(window, 'confirm');
    (cattleApi.deleteCattleLot as any).mockResolvedValue(undefined);
    renderCattle();

    fireEvent.click(await screen.findByLabelText('Excluir Lote Nelore'));
    expect(await screen.findByRole('dialog', { name: 'Excluir lote' })).toBeInTheDocument();
    expect(confirmSpy).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir' }));
    await waitFor(() => expect(cattleApi.deleteCattleLot).toHaveBeenCalled());
    expect((cattleApi.deleteCattleLot as any).mock.calls[0][0]).toBe(1);
  });

  it('shows why the API refused to delete an acquisition that was already sold', async () => {
    (cattleApi.deleteCattleLotEntry as any).mockRejectedValue({
      response: { data: { detail: 'Não é possível excluir esta aquisição: 60 cabeças já foram vendidas e restariam 0 compradas.' } },
    });
    renderCattle();

    fireEvent.click(await screen.findByText('Lote Nelore'));
    // Tabela (desktop) e cartões (mobile) ficam no DOM; o CSS mostra um deles.
    fireEvent.click((await screen.findAllByLabelText('Excluir lançamento'))[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Excluir lançamento' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));

    expect(await within(dialog).findByText(/já foram vendidas/)).toBeInTheDocument();
    expect(cattleApi.deleteCattleLotEntry).toHaveBeenCalledWith(10, expect.anything());
  });

  it('masks money values when the API returns nulls (view-only superuser)', async () => {
    (cattleApi.fetchCattleLots as any).mockResolvedValue([{
      ...baseLot,
      acquisition_cost: null, feed_cost: null, medicine_cost: null, vaccine_cost: null,
      freight_cost: null, other_costs: null, total_cost: null,
      sales_revenue: null, profit: null, margin_percent: null,
    }]);
    renderCattle();

    expect(await screen.findByText('Lote Nelore')).toBeInTheDocument();
    expect(screen.getAllByText(/••••••/).length).toBeGreaterThan(0);
    expect(screen.queryByText(/R\$\s?0,00/)).not.toBeInTheDocument();
  });
});

const closedSemiLot: cattleApi.CattleLot = {
  ...baseLot,
  id: 2,
  name: 'Lote Piquete',
  system: 'semi_feedlot',
  status: 'closed',
  end_date: '2026-03-01',
  sales_revenue: '100000.00',
  profit: '-10000.00',
  margin_percent: '-10.00',
  heads_purchased: 50,
  heads_sold: 50,
  heads_on_hand: 0,
};

const detailWithEntries = {
  ...baseLot,
  entries: [
    { id: 10, lot: 1, entry_type: 'acquisition', date: '2026-01-01', amount: '200000.00', head_count: 100, weight_kg: '36000.00', description: 'Leilão', created_at: '' },
    { id: 11, lot: 1, entry_type: 'medicine', date: '2026-01-15', amount: '3000.00', head_count: null, weight_kg: null, description: '', created_at: '' },
  ],
};

async function openLot(name = 'Lote Nelore') {
  fireEvent.click(await screen.findByText(name));
  await screen.findByText('Custo de trato');
}

function kpi(label: string) {
  return screen.getByText(label, { selector: '.kpi-label' }).nextElementSibling!;
}

describe('Cattle page — lots, filters and entries', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (cattleApi.fetchCattleLots as any).mockResolvedValue([baseLot, closedSemiLot]);
    (cattleApi.fetchCattleLot as any).mockResolvedValue(detailWithEntries);
  });

  it('creates a lot from the "Novo lote" button and refreshes the list', async () => {
    (cattleApi.createCattleLot as any).mockResolvedValue({ ...baseLot, id: 3 });
    renderCattle();
    await screen.findByText('Lote Nelore');

    fireEvent.click(screen.getByRole('button', { name: 'Novo lote' }));
    const dialog = screen.getByRole('dialog', { name: 'Novo lote' });
    fireEvent.change(within(dialog).getByLabelText('Nome do lote'), { target: { value: 'Lote Novo' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(cattleApi.createCattleLot).toHaveBeenCalled());
    expect((cattleApi.createCattleLot as any).mock.calls[0][0]).toMatchObject({ name: 'Lote Novo', system: 'feedlot' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Novo lote' })).not.toBeInTheDocument());
    await waitFor(() => expect(cattleApi.fetchCattleLots).toHaveBeenCalledTimes(2));
  });

  it('edits a lot from its card without opening the detail', async () => {
    (cattleApi.updateCattleLot as any).mockResolvedValue(baseLot);
    renderCattle();

    fireEvent.click(await screen.findByLabelText('Editar Lote Nelore'));
    const dialog = screen.getByRole('dialog', { name: 'Editar lote' });
    expect(within(dialog).getByLabelText('Nome do lote')).toHaveValue('Lote Nelore');
    fireEvent.change(within(dialog).getByLabelText('Nome do lote'), { target: { value: 'Lote Nelore 2' } });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(cattleApi.updateCattleLot).toHaveBeenCalled());
    const [id, payload] = (cattleApi.updateCattleLot as any).mock.calls[0];
    expect(id).toBe(1);
    expect(payload).toMatchObject({ name: 'Lote Nelore 2', location: 'Curral 3' });
    expect(cattleApi.fetchCattleLot).not.toHaveBeenCalled();
  });

  it('edits the lot from the detail header and refreshes it', async () => {
    (cattleApi.updateCattleLot as any).mockResolvedValue(baseLot);
    renderCattle();
    await openLot();

    fireEvent.click(screen.getByRole('button', { name: 'Editar lote' }));
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'closed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));

    await waitFor(() => expect(cattleApi.updateCattleLot).toHaveBeenCalled());
    expect((cattleApi.updateCattleLot as any).mock.calls[0][1]).toMatchObject({ status: 'closed' });
    await waitFor(() => expect(cattleApi.fetchCattleLot).toHaveBeenCalledTimes(2));
  });

  it('deletes the lot from the detail header and goes back to the list', async () => {
    (cattleApi.deleteCattleLot as any).mockResolvedValue(undefined);
    renderCattle();
    await openLot();

    fireEvent.click(screen.getByRole('button', { name: 'Excluir lote' }));
    const dialog = screen.getByRole('dialog', { name: 'Excluir lote' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(cattleApi.deleteCattleLot).toHaveBeenCalled());
    expect((cattleApi.deleteCattleLot as any).mock.calls[0][0]).toBe(1);
    expect(await screen.findByRole('heading', { name: 'Confinamento' })).toBeInTheDocument();
  });

  it('opens the delete confirmation from the edit modal, closing the modal', async () => {
    renderCattle();

    fireEvent.click(await screen.findByLabelText('Editar Lote Nelore'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Editar lote' })).getByRole('button', { name: 'Excluir' }));

    expect(screen.queryByRole('dialog', { name: 'Editar lote' })).not.toBeInTheDocument();
    expect(screen.getByRole('dialog', { name: 'Excluir lote' })).toBeInTheDocument();
  });

  it('shows an error inside the dialog when deleting the lot fails', async () => {
    (cattleApi.deleteCattleLot as any).mockRejectedValue(new Error('500'));
    renderCattle();

    fireEvent.click(await screen.findByLabelText('Excluir Lote Nelore'));
    const dialog = screen.getByRole('dialog', { name: 'Excluir lote' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));

    expect(await within(dialog).findByText('Não foi possível excluir. Tente novamente.')).toBeInTheDocument();
  });

  it('cancels a lot deletion from the button or by clicking outside', async () => {
    renderCattle();

    fireEvent.click(await screen.findByLabelText('Excluir Lote Nelore'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Excluir lote' })).getByRole('button', { name: 'Cancelar' }));
    expect(screen.queryByRole('dialog', { name: 'Excluir lote' })).not.toBeInTheDocument();

    fireEvent.click(screen.getByLabelText('Excluir Lote Nelore'));
    fireEvent.click(screen.getByRole('dialog', { name: 'Excluir lote' }).parentElement!);
    expect(screen.queryByRole('dialog', { name: 'Excluir lote' })).not.toBeInTheDocument();
    expect(cattleApi.deleteCattleLot).not.toHaveBeenCalled();
  });

  it('shows only open lots by default and filters by status and system', async () => {
    renderCattle();

    expect(await screen.findByText('Lote Nelore')).toBeInTheDocument();
    expect(screen.queryByText('Lote Piquete')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filtrar por status'), { target: { value: '' } });
    expect(screen.getByText('Lote Piquete')).toBeInTheDocument();
    expect(screen.getByText('Lote Nelore')).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filtrar por sistema'), { target: { value: 'semi_feedlot' } });
    expect(screen.getByText('Lote Piquete')).toBeInTheDocument();
    expect(screen.queryByText('Lote Nelore')).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText('Filtrar por status'), { target: { value: 'open' } });
    expect(screen.getByText('Nenhum lote encontrado')).toBeInTheDocument();
    expect(screen.getByText('Tente ajustar os filtros.')).toBeInTheDocument();
  });

  it('aggregates totals across the filtered lots, with margin weighted by revenue', async () => {
    renderCattle();
    await screen.findByText('Lote Nelore');

    fireEvent.change(screen.getByLabelText('Filtrar por status'), { target: { value: '' } });

    // (40.000 − 10.000) / (300.000 + 100.000) = 7,5% — não a média simples das margens (1,7%).
    expect(kpi('Margem de lucro')).toHaveTextContent('7,5%');
    expect(kpi('Lucro')).toHaveTextContent('R$ 30.000,00');
    expect(kpi('Receita de venda')).toHaveTextContent('R$ 400.000,00');
    expect(kpi('Cabeças em estoque')).toHaveTextContent('40');
  });

  it('shows an error state when the lots cannot be loaded', async () => {
    (cattleApi.fetchCattleLots as any).mockRejectedValue(new Error('500'));
    renderCattle();

    expect(await screen.findByText('Erro ao carregar lotes')).toBeInTheDocument();
  });

  it('suggests starting with an acquisition when the lot has no animals yet', async () => {
    const emptyLot = { ...baseLot, heads_purchased: 0, heads_sold: 0, heads_on_hand: 0 };
    (cattleApi.fetchCattleLots as any).mockResolvedValue([emptyLot]);
    (cattleApi.fetchCattleLot as any).mockResolvedValue({ ...emptyLot, entries: [] });
    renderCattle();
    await openLot();

    expect(screen.getByLabelText('Tipo de lançamento')).toHaveValue('acquisition');
    expect(screen.getByText(/Comece pela aquisição dos animais/)).toBeInTheDocument();
  });

  it('defaults to feed for lots that already have animals, and goes back to the list', async () => {
    renderCattle();
    await openLot();

    expect(screen.getByLabelText('Tipo de lançamento')).toHaveValue('feed');

    fireEvent.click(screen.getByRole('button', { name: 'Voltar para lotes' }));
    expect(await screen.findByRole('heading', { name: 'Confinamento' })).toBeInTheDocument();
  });

  it('blocks a zero amount locally, without calling the API', async () => {
    renderCattle();
    await openLot();

    fireEvent.change(screen.getByPlaceholderText('Valor (R$)'), { target: { value: '0' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Informe um valor maior que zero.');
    expect(cattleApi.createCattleLotEntry).not.toHaveBeenCalled();
  });

  it('sends date and description, then clears the form and refreshes the lot', async () => {
    (cattleApi.createCattleLotEntry as any).mockResolvedValue({ id: 20 });
    renderCattle();
    await openLot();

    fireEvent.change(screen.getByLabelText('Tipo de lançamento'), { target: { value: 'freight' } });
    fireEvent.change(screen.getByLabelText('Data'), { target: { value: '2026-02-10' } });
    fireEvent.change(screen.getByPlaceholderText('Valor (R$)'), { target: { value: '1500' } });
    fireEvent.change(screen.getByLabelText('Descrição'), { target: { value: 'Caminhão boiadeiro' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    await waitFor(() => expect(cattleApi.createCattleLotEntry).toHaveBeenCalled());
    expect((cattleApi.createCattleLotEntry as any).mock.calls[0][0]).toEqual({
      lot: 1, entry_type: 'freight', date: '2026-02-10', amount: '1500',
      head_count: null, weight_kg: null, description: 'Caminhão boiadeiro',
    });
    await waitFor(() => expect(screen.getByLabelText('Descrição')).toHaveValue(''));
    expect(screen.getByPlaceholderText('Valor (R$)')).toHaveValue('');
    await waitFor(() => expect(cattleApi.fetchCattleLot).toHaveBeenCalledTimes(2));
  });

  it('falls back to a generic message when saving an entry fails unexpectedly', async () => {
    (cattleApi.createCattleLotEntry as any).mockRejectedValue(new Error('network'));
    renderCattle();
    await openLot();

    fireEvent.change(screen.getByPlaceholderText('Valor (R$)'), { target: { value: '10' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('Erro ao salvar lançamento.');
  });

  it('deletes an entry after confirmation and refreshes the lot', async () => {
    (cattleApi.deleteCattleLotEntry as any).mockResolvedValue(undefined);
    renderCattle();
    await openLot();

    fireEvent.click(screen.getAllByLabelText('Excluir lançamento')[1]);
    const dialog = screen.getByRole('dialog', { name: 'Excluir lançamento' });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(cattleApi.deleteCattleLotEntry).toHaveBeenCalled());
    expect((cattleApi.deleteCattleLotEntry as any).mock.calls[0][0]).toBe(11);
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Excluir lançamento' })).not.toBeInTheDocument());
    await waitFor(() => expect(cattleApi.fetchCattleLot).toHaveBeenCalledTimes(2));
  });

  it('cancels an entry deletion', async () => {
    renderCattle();
    await openLot();

    fireEvent.click(screen.getAllByLabelText('Excluir lançamento')[0]);
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Excluir lançamento' })).getByRole('button', { name: 'Cancelar' }));

    expect(screen.queryByRole('dialog', { name: 'Excluir lançamento' })).not.toBeInTheDocument();
    expect(cattleApi.deleteCattleLotEntry).not.toHaveBeenCalled();
  });

  it('renders the history both as a table and as mobile cards with the same data', async () => {
    renderCattle();
    await openLot();

    const table = document.querySelector('.cattle-history-table') as HTMLElement;
    const cards = document.querySelector('.cattle-history-list') as HTMLElement;
    expect(within(table).getAllByRole('row')).toHaveLength(3); // cabeçalho + 2 lançamentos
    const items = within(cards).getAllByRole('listitem');
    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Aquisição');
    expect(items[0]).toHaveTextContent('100 cab. · 36.000 kg · Leilão');
    expect(items[0]).toHaveTextContent('-R$ 200.000,00');
    expect(items[1]).toHaveTextContent('Remédio');
    expect(items[1]).toHaveTextContent('-R$ 3.000,00');
  });

  it('deletes an entry from its mobile card', async () => {
    (cattleApi.deleteCattleLotEntry as any).mockResolvedValue(undefined);
    renderCattle();
    await openLot();

    const card = within(document.querySelector('.cattle-history-list') as HTMLElement).getAllByRole('listitem')[0];
    fireEvent.click(within(card).getByLabelText('Excluir lançamento'));
    fireEvent.click(within(screen.getByRole('dialog', { name: 'Excluir lançamento' })).getByRole('button', { name: 'Excluir' }));

    await waitFor(() => expect(cattleApi.deleteCattleLotEntry).toHaveBeenCalled());
    expect((cattleApi.deleteCattleLotEntry as any).mock.calls[0][0]).toBe(10);
  });

  it('colors a negative profit and shows dashes for metrics without base', async () => {
    const losingLot = {
      ...closedSemiLot, cost_per_head: null, feed_cost_per_head_day: null,
      avg_purchase_weight_kg: null, avg_sale_weight_kg: null,
    };
    (cattleApi.fetchCattleLots as any).mockResolvedValue([losingLot]);
    (cattleApi.fetchCattleLot as any).mockResolvedValue({ ...losingLot, entries: [] });
    renderCattle();
    fireEvent.change(await screen.findByLabelText('Filtrar por status'), { target: { value: 'closed' } });
    await openLot('Lote Piquete');

    expect(kpi('Lucro')).toHaveClass('negative');
    expect(kpi('Margem de lucro')).toHaveTextContent('-10,0%');
    expect(kpi('Custo por cabeça')).toHaveTextContent('—');
    expect(kpi('Trato / cabeça / dia')).toHaveTextContent('—');
    expect(kpi('Peso médio (entrada / saída)')).toHaveTextContent('— / —');
  });
});
