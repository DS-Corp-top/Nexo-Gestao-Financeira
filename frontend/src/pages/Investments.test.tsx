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
    fetchInvestmentEntries: vi.fn(),
    fetchInvestmentExchangeRates: vi.fn(),
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
});
