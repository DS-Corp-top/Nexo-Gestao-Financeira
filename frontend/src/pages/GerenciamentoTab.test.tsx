import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import { GerenciamentoTab } from './GerenciamentoTab';
import * as usersApi from '../api/users';
import * as systemApi from '../api/system';
import { expectPortaledToBody } from '../test/portal';

vi.mock('../api/users', async () => {
  const actual = await vi.importActual<typeof import('../api/users')>('../api/users');
  return {
    ...actual,
    fetchSystemTenants: vi.fn(),
    fetchSystemUsers: vi.fn(),
  };
});
vi.mock('../api/system', async () => {
  const actual = await vi.importActual<typeof import('../api/system')>('../api/system');
  return {
    ...actual,
    fetchAllCompanies: vi.fn(),
  };
});

function renderGerenciamentoTab() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <GerenciamentoTab />
    </QueryClientProvider>
  );
}

describe('GerenciamentoTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (usersApi.fetchSystemTenants as any).mockResolvedValue([
      { id: 1, name: 'Tenant Teste', slug: 'tenant-teste', person_type: 'pj', user_count: 1, company_count: 1, created_at: '2026-01-01', is_active: true },
    ]);
    (usersApi.fetchSystemUsers as any).mockResolvedValue([]);
    (systemApi.fetchAllCompanies as any).mockResolvedValue([]);
  });

  it('renders the confirmation modal outside the page container when toggling a tenant', async () => {
    const { container } = renderGerenciamentoTab();

    fireEvent.click(await screen.findByText('Inativar'));

    const heading = await screen.findByText('Confirmar ação');
    const modalRoot = heading.closest('div')!.parentElement as HTMLElement;
    expectPortaledToBody(modalRoot, container);
  });
});
