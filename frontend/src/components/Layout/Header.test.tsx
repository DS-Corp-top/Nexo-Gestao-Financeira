import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import Header from './Header';
import { useAuth } from '../../contexts/AuthContext';
import { usePushNotifications } from '../../hooks/usePushNotifications';
import * as tenantApi from '../../api/tenant';
import * as systemApi from '../../api/system';

vi.mock('../../contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/AuthContext')>('../../contexts/AuthContext');
  return { ...actual, useAuth: vi.fn() };
});

vi.mock('../../hooks/usePushNotifications', () => ({
  usePushNotifications: vi.fn(),
}));

vi.mock('../../api/tenant', async () => {
  const actual = await vi.importActual<typeof import('../../api/tenant')>('../../api/tenant');
  return { ...actual, fetchTenantCompanies: vi.fn() };
});

vi.mock('../../api/system', async () => {
  const actual = await vi.importActual<typeof import('../../api/system')>('../../api/system');
  return { ...actual, fetchAllCompanies: vi.fn() };
});

const BASE_PUSH_STATE = {
  permission: 'default' as const,
  subscribed: false,
  loading: false,
  error: null as string | null,
  subscribe: vi.fn(),
  unsubscribe: vi.fn(),
};

function renderHeader() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <Header title="Dashboard" onMenuClick={() => {}} />
      </MemoryRouter>
    </QueryClientProvider>
  );
}

function openUserMenu() {
  fireEvent.click(screen.getByText('U'));
}

describe('Header push notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      user: { username: 'user', first_name: '', last_name: '', email: '', is_superuser: false },
      tenant: { id: 1, name: 'Tenant', role: 'owner', person_type: 'pf' },
      logout: vi.fn(),
      refresh: vi.fn(),
    });
    (tenantApi.fetchTenantCompanies as any).mockResolvedValue([]);
    (systemApi.fetchAllCompanies as any).mockResolvedValue([]);
  });

  it('shows the push error message inside the user dropdown when present', () => {
    (usePushNotifications as any).mockReturnValue({
      ...BASE_PUSH_STATE,
      error: 'Notificacoes push nao estao configuradas no servidor.',
    });

    renderHeader();
    openUserMenu();

    expect(screen.getByText('Notificacoes push nao estao configuradas no servidor.')).toBeInTheDocument();
  });

  it('does not render an error message when there is none', () => {
    (usePushNotifications as any).mockReturnValue({ ...BASE_PUSH_STATE, error: null });

    renderHeader();
    openUserMenu();

    expect(screen.getByText('Ativar notificações')).toBeInTheDocument();
    expect(screen.queryByText(/nao estao configuradas|bloqueadas|Nao foi possivel/i)).not.toBeInTheDocument();
  });

  it('hides the notifications toggle entirely when push is unsupported', () => {
    (usePushNotifications as any).mockReturnValue({ ...BASE_PUSH_STATE, permission: 'unsupported' });

    renderHeader();
    openUserMenu();

    expect(screen.queryByText('Ativar notificações')).not.toBeInTheDocument();
  });

  it('calls subscribe when the toggle is clicked while not subscribed', () => {
    const subscribe = vi.fn();
    (usePushNotifications as any).mockReturnValue({ ...BASE_PUSH_STATE, subscribed: false, subscribe });

    renderHeader();
    openUserMenu();
    fireEvent.click(screen.getByText('Ativar notificações'));

    expect(subscribe).toHaveBeenCalled();
  });

  it('calls unsubscribe when the toggle is clicked while already subscribed', () => {
    const unsubscribe = vi.fn();
    (usePushNotifications as any).mockReturnValue({ ...BASE_PUSH_STATE, subscribed: true, unsubscribe });

    renderHeader();
    openUserMenu();
    fireEvent.click(screen.getByText('Notificações ativadas'));

    expect(unsubscribe).toHaveBeenCalled();
  });

  it('disables the toggle while a subscribe/unsubscribe call is in flight', () => {
    (usePushNotifications as any).mockReturnValue({ ...BASE_PUSH_STATE, loading: true });

    renderHeader();
    openUserMenu();

    expect(screen.getByText('Ativar notificações').closest('button')).toBeDisabled();
  });

  it('shows the blocked-permission label and does not call subscribe when permission is denied', () => {
    const subscribe = vi.fn();
    (usePushNotifications as any).mockReturnValue({
      ...BASE_PUSH_STATE,
      permission: 'denied',
      subscribe,
      error: 'Notificacoes bloqueadas nas configuracoes deste site. Altere a permissao no navegador e tente novamente.',
    });

    renderHeader();
    openUserMenu();

    expect(screen.getByText('Notificações bloqueadas no navegador')).toBeInTheDocument();
    expect(
      screen.getByText('Notificacoes bloqueadas nas configuracoes deste site. Altere a permissao no navegador e tente novamente.')
    ).toBeInTheDocument();
  });
});
