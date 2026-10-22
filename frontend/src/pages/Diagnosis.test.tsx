import { cloneElement, type ReactElement } from 'react';
import { act, render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import Diagnosis from './Diagnosis';
import * as reportsApi from '../api/reports';
import { ViewModeContext } from '../contexts/ViewModeContext';

vi.mock('../api/reports', async () => {
  const actual = await vi.importActual<typeof import('../api/reports')>('../api/reports');
  return { ...actual, fetchOscillationsReport: vi.fn(), fetchMonthDiagnosis: vi.fn() };
});

// No jsdom o ResponsiveContainer mede 0x0 e não desenha nada. Aqui ele ganha
// tamanho fixo, e o ComposedChart real é envolvido só para guardar o onClick
// — clicar num ponto exato do SVG não é viável sem layout de verdade.
const chart = vi.hoisted(() => ({ onClick: undefined as undefined | ((state: unknown) => void) }));
vi.mock('recharts', async () => {
  const actual = await vi.importActual<typeof import('recharts')>('recharts');
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: ReactElement<{ width?: number; height?: number }> }) => (
      <div style={{ width: 800, height: 300 }}>{cloneElement(children, { width: 800, height: 300 })}</div>
    ),
    ComposedChart: (props: any) => {
      chart.onClick = props.onClick;
      return <actual.ComposedChart {...props} />;
    },
  };
});

function renderDiagnosis({ isMobile = false } = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <ViewModeContext.Provider value={{ viewMode: isMobile ? 'mobile' : 'desktop', isMobile, toggle: () => {} }}>
        <Diagnosis />
      </ViewModeContext.Provider>
    </QueryClientProvider>
  );
}

async function openDiagnosis(monthLabel = 'Abril de 2026') {
  fireEvent.click(await screen.findByRole('button', { name: `Diagnóstico de ${monthLabel}` }));
  return screen.findByRole('dialog', { name: `Diagnóstico de ${monthLabel}` });
}

const OSCILLATIONS: reportsApi.OscillationsReport = {
  end_month: '2026-04',
  status: 'all',
  masked: false,
  average_income: '5000.00',
  average_expense: '3225.00',
  average_net: '1775.00',
  months: [
    { month: '2026-01', income: '5000.00', expense: '2500.00', net: '2500.00', expense_vs_average: -0.22, flag: 'normal' },
    { month: '2026-02', income: '9000.00', expense: '2500.00', net: '6500.00', expense_vs_average: -0.22, flag: 'surplus' },
    { month: '2026-03', income: '0.00', expense: '0.00', net: '0.00', expense_vs_average: null, flag: 'empty' },
    { month: '2026-04', income: '5000.00', expense: '5400.00', net: '-400.00', expense_vs_average: 0.67, flag: 'deficit' },
  ],
};

const DIAGNOSIS: reportsApi.MonthDiagnosis = {
  month: '2026-04',
  status: 'all',
  masked: false,
  income: '5000.00',
  expense: '5400.00',
  net: '-400.00',
  savings_rate: -0.08,
  baseline: { months: 3, requested_months: 6, income: '5000.00', expense: '2500.00', net: '2500.00' },
  verdict: { level: 'critical', title: 'Mês no vermelho', summary: 'As despesas superaram as receitas em R$ 400,00.' },
  insights: [
    { tone: 'negative', text: '“Viagem” é um gasto novo: R$ 3.000,00 sem registro nos meses anteriores.' },
    { tone: 'positive', text: '“Alimentação” ficou R$ 600,00 abaixo da média, aliviando o mês.' },
  ],
  expense_increases: [
    { category_id: 3, name: 'Viagem', current: '3000.00', average: '0.00', delta: '3000.00', delta_ratio: null, is_new: true },
    { category_id: 1, name: 'Moradia', current: '2000.00', average: '1500.00', delta: '500.00', delta_ratio: 0.3333, is_new: false },
  ],
  expense_decreases: [
    { category_id: 2, name: 'Alimentação', current: '400.00', average: '1000.00', delta: '-600.00', delta_ratio: -0.6, is_new: false },
  ],
  income_changes: [],
  composition: [
    { kind: 'recurring', label: 'Fixas e recorrentes', value: '2000.00', count: 1, share: 0.3704 },
    { kind: 'installment', label: 'Parcelamentos', value: '0.00', count: 0, share: 0 },
    { kind: 'one_off', label: 'Pontuais', value: '3400.00', count: 2, share: 0.6296 },
  ],
  card_expense: '3400.00',
  pending_expense: '0.00',
  top_expenses: [
    {
      id: 10, date: '2026-04-20', description: 'Passagens', category: 'Viagem', account: 'Cartão',
      value: '3000.00', kind: 'one_off', is_cleared: true, share: 0.5556,
    },
  ],
};

describe('Diagnosis Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (reportsApi.fetchOscillationsReport as any).mockResolvedValue(OSCILLATIONS);
    (reportsApi.fetchMonthDiagnosis as any).mockResolvedValue(DIAGNOSIS);
  });

  it('loads the last 12 months including provisions by default', async () => {
    renderDiagnosis();
    await waitFor(() => expect(reportsApi.fetchOscillationsReport).toHaveBeenCalled());
    expect(reportsApi.fetchOscillationsReport).toHaveBeenCalledWith(
      expect.objectContaining({ months: 12, status: 'all' })
    );
  });

  it('highlights the heaviest month and the biggest surplus', async () => {
    renderDiagnosis();
    const heaviest = (await screen.findByText('Mês mais pesado')).closest('button')!;
    expect(within(heaviest).getByText('Abril de 2026')).toBeInTheDocument();
    const surplus = screen.getByText('Maior sobra').closest('button')!;
    expect(within(surplus).getByText('Fevereiro de 2026')).toBeInTheDocument();
  });

  it('flags each month and disables months without data', async () => {
    renderDiagnosis();
    const april = await screen.findByRole('button', { name: 'Diagnóstico de Abril de 2026' });
    expect(within(april).getByText('No vermelho')).toBeInTheDocument();
    expect(within(screen.getByRole('button', { name: 'Diagnóstico de Fevereiro de 2026' })).getByText('Sobra')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Diagnóstico de Março de 2026' })).toBeDisabled();
  });

  it('opens the month diagnosis when a month is clicked', async () => {
    renderDiagnosis();
    fireEvent.click(await screen.findByRole('button', { name: 'Diagnóstico de Abril de 2026' }));

    const dialog = await screen.findByRole('dialog', { name: 'Diagnóstico de Abril de 2026' });
    expect(reportsApi.fetchMonthDiagnosis).toHaveBeenCalledWith({ month: '2026-04', status: 'all' });
    expect(await within(dialog).findByText('Mês no vermelho')).toBeInTheDocument();
    expect(within(dialog).getByText(/“Viagem” é um gasto novo/)).toBeInTheDocument();
    expect(within(dialog).getByText('O que pesou')).toBeInTheDocument();
    expect(within(dialog).getByText('Moradia')).toBeInTheDocument();
    expect(within(dialog).getByText('O que aliviou')).toBeInTheDocument();
    expect(within(dialog).getByText('Alimentação')).toBeInTheDocument();
    expect(within(dialog).getByText('Passagens')).toBeInTheDocument();

    fireEvent.click(within(dialog).getByRole('button', { name: 'Fechar' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('opens the diagnosis from the highlight cards too', async () => {
    renderDiagnosis();
    fireEvent.click((await screen.findByText('Maior sobra')).closest('button')!);
    await screen.findByRole('dialog', { name: 'Diagnóstico de Fevereiro de 2026' });
    expect(reportsApi.fetchMonthDiagnosis).toHaveBeenCalledWith({ month: '2026-02', status: 'all' });
  });

  it('passes the status filter to both requests', async () => {
    renderDiagnosis();
    await screen.findByText('Mês mais pesado');
    fireEvent.change(screen.getByLabelText('Considerar'), { target: { value: 'cleared' } });
    await waitFor(() =>
      expect(reportsApi.fetchOscillationsReport).toHaveBeenLastCalledWith(expect.objectContaining({ status: 'cleared' }))
    );
    fireEvent.click(await screen.findByRole('button', { name: 'Diagnóstico de Abril de 2026' }));
    await waitFor(() =>
      expect(reportsApi.fetchMonthDiagnosis).toHaveBeenCalledWith({ month: '2026-04', status: 'cleared' })
    );
  });

  it('shows an empty state when there is no movement', async () => {
    (reportsApi.fetchOscillationsReport as any).mockResolvedValue({
      ...OSCILLATIONS,
      months: OSCILLATIONS.months.map((m) => ({ ...m, income: '0.00', expense: '0.00', net: '0.00', flag: 'empty' })),
    });
    renderDiagnosis();
    expect(await screen.findByText('Nenhuma receita ou despesa no período.')).toBeInTheDocument();
  });

  it('hides values for a view-only superuser', async () => {
    (reportsApi.fetchOscillationsReport as any).mockResolvedValue({ end_month: '2026-04', status: 'all', masked: true, months: [] });
    renderDiagnosis();
    expect(await screen.findByText(/Valores ocultos/)).toBeInTheDocument();
    expect(screen.queryByText('Mês mais pesado')).not.toBeInTheDocument();
  });

  it('shows an error message when loading fails', async () => {
    (reportsApi.fetchOscillationsReport as any).mockRejectedValue(new Error('boom'));
    renderDiagnosis();
    expect(await screen.findByText(/Não foi possível carregar as oscilações/)).toBeInTheDocument();
  });

  describe('chart', () => {
    it('renders the chart with one tick per month and a legend', async () => {
      const { container } = renderDiagnosis();
      await screen.findByText('Mês mais pesado');
      await waitFor(() => expect(container.querySelector('.recharts-surface')).toBeInTheDocument());
      expect(within(container).getByText('Receitas')).toBeInTheDocument();
      expect(within(container).getByText('Saldo do mês')).toBeInTheDocument();
      // O jsdom não mede texto em SVG, então o Recharts cria os ticks mas
      // não escreve o rótulo — dá para conferir os ticks, não o "9 mil".
      await waitFor(() =>
        expect(container.querySelectorAll('.recharts-yAxis .recharts-cartesian-axis-tick').length).toBeGreaterThan(0)
      );
      expect(container.querySelectorAll('.recharts-xAxis .recharts-cartesian-axis-tick')).toHaveLength(4);
    });

    it('opens the diagnosis of the clicked month', async () => {
      renderDiagnosis();
      await screen.findByText('Mês mais pesado');
      act(() => chart.onClick?.({ activeTooltipIndex: 3 }));
      await screen.findByRole('dialog', { name: 'Diagnóstico de Abril de 2026' });
      expect(reportsApi.fetchMonthDiagnosis).toHaveBeenCalledWith({ month: '2026-04', status: 'all' });
    });

    it('accepts the tooltip index as a string (recharts 3)', async () => {
      renderDiagnosis();
      await screen.findByText('Mês mais pesado');
      act(() => chart.onClick?.({ activeTooltipIndex: '1' }));
      await screen.findByRole('dialog', { name: 'Diagnóstico de Fevereiro de 2026' });
    });

    it.each([
      ['an empty month', { activeTooltipIndex: 2 }],
      ['outside any bar', { activeTooltipIndex: null }],
      ['an index out of range', { activeTooltipIndex: 99 }],
      ['a click without state', null],
    ])('ignores a click on %s', async (_label, state) => {
      renderDiagnosis();
      await screen.findByText('Mês mais pesado');
      act(() => chart.onClick?.(state));
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(reportsApi.fetchMonthDiagnosis).not.toHaveBeenCalled();
    });
  });

  describe('filters', () => {
    it('reloads with the chosen period', async () => {
      renderDiagnosis();
      await screen.findByText('Mês mais pesado');
      fireEvent.change(screen.getByLabelText('Período'), { target: { value: '24' } });
      await waitFor(() =>
        expect(reportsApi.fetchOscillationsReport).toHaveBeenLastCalledWith(expect.objectContaining({ months: 24 }))
      );
    });

    it('reloads with the chosen end month', async () => {
      renderDiagnosis();
      await screen.findByText('Mês mais pesado');
      fireEvent.change(screen.getByLabelText('Até o mês'), { target: { value: '2025-12' } });
      await waitFor(() =>
        expect(reportsApi.fetchOscillationsReport).toHaveBeenLastCalledWith(
          expect.objectContaining({ end_month: '2025-12' })
        )
      );
    });
  });

  describe('highlights', () => {
    it('shows no biggest surplus when every month closed negative', async () => {
      (reportsApi.fetchOscillationsReport as any).mockResolvedValue({
        ...OSCILLATIONS,
        average_net: '-300.00',
        months: [
          { month: '2026-01', income: '1000.00', expense: '1200.00', net: '-200.00', expense_vs_average: 0, flag: 'deficit' },
          { month: '2026-02', income: '1000.00', expense: '1400.00', net: '-400.00', expense_vs_average: 0.1, flag: 'deficit' },
        ],
      });
      renderDiagnosis();
      const surplus = (await screen.findByText('Maior sobra')).closest('button')!;
      expect(surplus).toBeDisabled();
      expect(within(surplus).getAllByText('—')).toHaveLength(2);
      fireEvent.click(surplus);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      // Sobra média negativa aparece em vermelho.
      expect(screen.getByText('Sobra média mensal').nextElementSibling).toHaveClass('negative');
    });
  });

  describe('month diagnosis modal', () => {
    it('shows a loading state while the diagnosis is computed', async () => {
      (reportsApi.fetchMonthDiagnosis as any).mockReturnValue(new Promise(() => {}));
      renderDiagnosis();
      const dialog = await openDiagnosis();
      expect(within(dialog).getByText('Analisando o mês...')).toBeInTheDocument();
    });

    it('shows an error when the diagnosis fails', async () => {
      (reportsApi.fetchMonthDiagnosis as any).mockRejectedValue(new Error('boom'));
      renderDiagnosis();
      const dialog = await openDiagnosis();
      expect(await within(dialog).findByText('Não foi possível gerar o diagnóstico.')).toBeInTheDocument();
    });

    it('hides values for a view-only superuser', async () => {
      (reportsApi.fetchMonthDiagnosis as any).mockResolvedValue({ month: '2026-04', status: 'all', masked: true });
      renderDiagnosis();
      const dialog = await openDiagnosis();
      expect(await within(dialog).findByText('Valores ocultos para este cliente.')).toBeInTheDocument();
      expect(within(dialog).queryByText('Receitas')).not.toBeInTheDocument();
    });

    it('closes when clicking the overlay but not the content', async () => {
      renderDiagnosis();
      const dialog = await openDiagnosis();
      await within(dialog).findByText('Mês no vermelho');
      fireEvent.click(dialog);
      expect(screen.getByRole('dialog')).toBeInTheDocument();
      fireEvent.click(dialog.parentElement!);
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    });

    it('compares each total with the average', async () => {
      renderDiagnosis();
      const dialog = await openDiagnosis();
      await within(dialog).findByText('Mês no vermelho');
      expect(within(dialog).getByText('Comparado com a média dos 3 meses anteriores com movimentação.')).toBeInTheDocument();
      // Despesa R$ 2.900 acima da média de R$ 2.500.
      const expenseTile = within(dialog).getByText('Despesas').parentElement!;
      expect(within(expenseTile).getByText('R$ 2.900,00')).toBeInTheDocument();
      expect(within(expenseTile).getByText('média R$ 2.500,00')).toBeInTheDocument();
      // Saldo negativo: nada de "você guardou".
      expect(within(dialog).queryByText(/Você guardou/)).not.toBeInTheDocument();
    });

    it('lists composition, card and the biggest expenses with their kind', async () => {
      (reportsApi.fetchMonthDiagnosis as any).mockResolvedValue({
        ...DIAGNOSIS,
        pending_expense: '420.00',
        top_expenses: [
          ...DIAGNOSIS.top_expenses,
          {
            id: 11, date: '2026-04-25', description: 'Notebook (3/10)', category: null, account: 'Cartão',
            value: '420.00', kind: 'installment', is_cleared: false, share: 0.0778,
          },
        ],
      });
      renderDiagnosis();
      const dialog = await openDiagnosis();
      await within(dialog).findByText('Composição das despesas');
      expect(within(dialog).getByRole('img', { name: /Fixas e recorrentes: 37%.*Pontuais: 63%/ })).toBeInTheDocument();
      expect(within(dialog).getByText('No cartão: R$ 3.400,00')).toBeInTheDocument();
      expect(within(dialog).getByText('A pagar: R$ 420,00')).toBeInTheDocument();
      expect(within(dialog).getByText('Viagem · Pontual')).toBeInTheDocument();
      expect(within(dialog).getByText('Sem categoria · Parcela · a pagar')).toBeInTheDocument();
      expect(within(dialog).getByText('56% do mês')).toBeInTheDocument();
    });

    it('describes a surplus month with income changes and no history gaps', async () => {
      (reportsApi.fetchMonthDiagnosis as any).mockResolvedValue({
        ...DIAGNOSIS,
        month: '2026-02',
        income: '9000.00',
        expense: '2500.00',
        net: '6500.00',
        savings_rate: 0.7222,
        baseline: { months: 1, requested_months: 6, income: '5000.00', expense: '2500.00', net: '2500.00' },
        verdict: { level: 'excellent', title: 'Sobra acima do normal', summary: 'Sobraram R$ 6.500,00.' },
        insights: [{ tone: 'neutral', text: 'Ainda há R$ 100,00 em despesas não baixadas (a pagar) neste mês.' }],
        expense_increases: [],
        expense_decreases: [],
        income_changes: [
          { category_id: 5, name: 'Bônus', current: '4000.00', average: '0.00', delta: '4000.00', delta_ratio: null, is_new: true },
          { category_id: 6, name: 'Freela', current: '0.00', average: '500.00', delta: '-500.00', delta_ratio: -1, is_new: false },
        ],
        card_expense: '0.00',
        pending_expense: '0.00',
        top_expenses: [],
      });
      renderDiagnosis();
      const dialog = await openDiagnosis('Fevereiro de 2026');

      expect(await within(dialog).findByText('Sobra acima do normal')).toBeInTheDocument();
      expect(within(dialog).getByText(/Comparado com o mês anterior com movimentação\./)).toBeInTheDocument();
      expect(within(dialog).getByText(/Você guardou 72% da receita\./)).toBeInTheDocument();
      expect(within(dialog).queryByText('O que pesou')).not.toBeInTheDocument();
      expect(within(dialog).queryByText('Maiores despesas do mês')).not.toBeInTheDocument();
      expect(within(dialog).queryByText(/No cartão/)).not.toBeInTheDocument();

      const income = within(dialog).getByText('Variações nas receitas').parentElement!;
      expect(within(income).getByText('novo')).toBeInTheDocument();
      // Receita subindo é bom (verde); caindo é ruim (vermelho).
      expect(within(income).getByText('+ R$ 4.000,00')).toHaveStyle({ color: 'var(--color-success)' });
      expect(within(income).getByText('− R$ 500,00')).toHaveStyle({ color: 'var(--color-danger)' });
      expect(within(income).getByText('R$ 0,00 no mês · média R$ 500,00 (−100%)')).toBeInTheDocument();
      expect(within(income).getByText('R$ 4.000,00 no mês · média R$ 0,00')).toBeInTheDocument();
    });

    it('shows only the side that has drivers', async () => {
      (reportsApi.fetchMonthDiagnosis as any).mockResolvedValue({ ...DIAGNOSIS, expense_decreases: [] });
      renderDiagnosis();
      const dialog = await openDiagnosis();
      expect(await within(dialog).findByText('Nenhuma categoria abaixo do normal.')).toBeInTheDocument();
    });

    it('explains a month without history or movement', async () => {
      (reportsApi.fetchMonthDiagnosis as any).mockResolvedValue({
        ...DIAGNOSIS,
        income: '0.00',
        expense: '0.00',
        net: '0.00',
        savings_rate: null,
        baseline: { months: 0, requested_months: 6, income: '0.00', expense: '0.00', net: '0.00' },
        verdict: { level: 'empty', title: 'Sem movimentação', summary: 'Nenhuma receita ou despesa registrada.' },
        insights: [],
        expense_increases: [],
        expense_decreases: [],
        composition: DIAGNOSIS.composition.map((c) => ({ ...c, value: '0.00', count: 0, share: null })),
        card_expense: '0.00',
        top_expenses: [],
      });
      renderDiagnosis();
      const dialog = await openDiagnosis();
      expect(await within(dialog).findByText('Sem movimentação')).toBeInTheDocument();
      expect(within(dialog).queryByText(/Comparado com/)).not.toBeInTheDocument();
      expect(within(dialog).queryByText(/média R\$/)).not.toBeInTheDocument();
      expect(within(dialog).queryByText('Por que o mês ficou assim')).not.toBeInTheDocument();
      expect(within(dialog).queryByText('Composição das despesas')).not.toBeInTheDocument();
    });
  });

  describe('mobile layout', () => {
    it('shows the net value next to the flag and stacks the diagnosis', async () => {
      renderDiagnosis({ isMobile: true });
      const april = await screen.findByRole('button', { name: 'Diagnóstico de Abril de 2026' });
      // No celular a linha mostra só o saldo e a etiqueta.
      expect(within(april).getByText('-R$ 400,00')).toBeInTheDocument();
      expect(within(april).queryByText('R$ 5.000,00')).not.toBeInTheDocument();

      const dialog = await openDiagnosis();
      expect(await within(dialog).findByText('O que pesou')).toBeInTheDocument();
      expect(within(dialog).getByText('Passagens')).toBeInTheDocument();
    });

    it('talks about tapping instead of clicking on the chart', async () => {
      renderDiagnosis({ isMobile: true });

      expect(await screen.findByText('Toque em um mês para ver o diagnóstico')).toBeInTheDocument();
      expect(screen.queryByText(/Clique em um mês/)).not.toBeInTheDocument();
    });

    it('wraps long names instead of truncating them, and never shrinks the amount', async () => {
      // Regressão: a coluna `1fr` com nome em nowrap estourava a largura do modal
      // no celular e cortava o valor ("+ R$ 10" em vez de "+ R$ 10.350,00").
      renderDiagnosis({ isMobile: true });
      const dialog = await openDiagnosis();
      await within(dialog).findByText('O que pesou');

      const name = within(dialog).getByText('Viagem', { selector: '[title]' });
      expect(name).toHaveAttribute('title', 'Viagem');
      expect(name).not.toHaveStyle({ whiteSpace: 'nowrap' });
      expect(name.parentElement).toHaveTextContent('novo');
      expect(within(dialog).getByText('+ R$ 3.000,00')).toHaveStyle({ flexShrink: '0', whiteSpace: 'nowrap' });

      const description = within(dialog).getByText('Passagens');
      expect(description).toHaveAttribute('title', 'Passagens');
      expect(description).not.toHaveStyle({ whiteSpace: 'nowrap' });
    });
  });

  describe('desktop layout', () => {
    it('keeps names on a single line with the full text available on hover', async () => {
      renderDiagnosis();

      expect(await screen.findByText('Clique em um mês para ver o diagnóstico')).toBeInTheDocument();
      const dialog = await openDiagnosis();
      await within(dialog).findByText('O que pesou');

      const name = within(dialog).getByText('Viagem', { selector: '[title]' });
      expect(name).toHaveStyle({ whiteSpace: 'nowrap', textOverflow: 'ellipsis' });
      expect(within(dialog).getByText('Passagens')).toHaveStyle({ whiteSpace: 'nowrap' });
    });
  });
});
