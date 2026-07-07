import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import Shopping from './Shopping';
import * as shoppingApi from '../api/shopping';
import { expectPortaledToBody } from '../test/portal';

vi.mock('../api/shopping', async () => {
  const actual = await vi.importActual<typeof import('../api/shopping')>('../api/shopping');
  return {
    ...actual,
    fetchShoppingLists: vi.fn(),
  };
});

function renderShopping() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Shopping />
    </QueryClientProvider>
  );
}

describe('Shopping Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (shoppingApi.fetchShoppingLists as any).mockResolvedValue([]);
  });

  it('renders the create-list Modal outside the page container when opened', async () => {
    const { container } = renderShopping();

    await waitFor(() => {
      expect(screen.getByText('Nenhuma lista')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Nova Lista'));

    const heading = await screen.findByText('Nova Lista', { selector: 'h3' });
    const modalRoot = heading.parentElement!.parentElement as HTMLElement;
    expectPortaledToBody(modalRoot, container);
  });
});
