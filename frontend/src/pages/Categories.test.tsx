import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import Categories from './Categories';
import * as categoriesApi from '../api/categories';
import { useIsAdmin } from '../hooks/useIsAdmin';
import { expectPortaledToBody } from '../test/portal';

vi.mock('../api/categories', async () => {
  const actual = await vi.importActual<typeof import('../api/categories')>('../api/categories');
  return {
    ...actual,
    fetchCategories: vi.fn(),
  };
});
vi.mock('../hooks/useIsAdmin', () => ({
  useIsAdmin: vi.fn(),
}));

function renderCategories() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Categories />
    </QueryClientProvider>
  );
}

describe('Categories Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useIsAdmin as any).mockReturnValue(true);
    (categoriesApi.fetchCategories as any).mockResolvedValue([]);
  });

  it('renders the CategoryModal outside the page container when opened', async () => {
    const { container } = renderCategories();

    await waitFor(() => {
      expect(screen.getByText('Nenhuma categoria cadastrada')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Nova Categoria'));

    const heading = await screen.findByText('Nova Categoria', { selector: 'h2' });
    const modalRoot = heading.closest('.modal-overlay') as HTMLElement;
    expect(modalRoot).not.toBeNull();
    expectPortaledToBody(modalRoot, container);
  });
});
