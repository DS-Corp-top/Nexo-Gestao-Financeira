import { render, screen, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import Administration from './Administration';
import * as tenantApi from '../api/tenant';
import * as usersApi from '../api/users';
import { useAuth } from '../contexts/AuthContext';
import { expectPortaledToBody } from '../test/portal';

vi.mock('../api/tenant', async () => {
  const actual = await vi.importActual<typeof import('../api/tenant')>('../api/tenant');
  return {
    ...actual,
    fetchTenantCompanies: vi.fn(),
  };
});
vi.mock('../api/users', async () => {
  const actual = await vi.importActual<typeof import('../api/users')>('../api/users');
  return {
    ...actual,
    fetchTenantMembers: vi.fn(),
    fetchPendingUsers: vi.fn(),
    fetchSystemStats: vi.fn(),
    fetchSystemTenants: vi.fn(),
    fetchSystemUsers: vi.fn(),
  };
});
vi.mock('../contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('../contexts/AuthContext')>('../contexts/AuthContext');
  return {
    ...actual,
    useAuth: vi.fn(),
  };
});

function renderAdministration() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <Administration />
    </QueryClientProvider>
  );
}

describe('Administration Page - Backup Tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({ user: { is_superuser: true }, isLoggedIn: true, refresh: vi.fn(), logout: vi.fn() });
    (tenantApi.fetchTenantCompanies as any).mockResolvedValue([]);
    (usersApi.fetchTenantMembers as any).mockResolvedValue([]);
    (usersApi.fetchPendingUsers as any).mockResolvedValue([]);
    (usersApi.fetchSystemStats as any).mockResolvedValue({});
    (usersApi.fetchSystemTenants as any).mockResolvedValue([]);
    (usersApi.fetchSystemUsers as any).mockResolvedValue([]);
  });

  it('renders the restore confirmation modal outside the page container', async () => {
    const { container } = renderAdministration();

    fireEvent.click(await screen.findByText('Backup'));

    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    expect(fileInput).not.toBeNull();
    const file = new File(['dummy'], 'backup.sql', { type: 'application/sql' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    fireEvent.click(await screen.findByRole('button', { name: 'Restaurar Backup' }));

    const heading = await screen.findByText('Ação irreversível');
    const modalRoot = heading.closest('div')!.parentElement!.parentElement as HTMLElement;
    expectPortaledToBody(modalRoot, container);
  });
});
