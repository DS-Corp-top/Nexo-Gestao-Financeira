import { render, screen, fireEvent, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';
import Sidebar from './Sidebar';
import BottomNav from './BottomNav';
import { useAuth } from '../../contexts/AuthContext';

vi.mock('../../contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('../../contexts/AuthContext')>('../../contexts/AuthContext');
  return { ...actual, useAuth: vi.fn() };
});

// Every top-level module in App.tsx is expected to have a link in BOTH the
// desktop Sidebar and the mobile BottomNav "more" menu. This list is the
// single source of truth for that expectation — when a new module gets a
// route in App.tsx, add it here too, and this test forces you to wire it
// into both menus instead of just one (the exact bug that shipped: /reports
// was added to Sidebar but forgotten in BottomNav).
const EXPECTED_MODULE_LINKS = [
  { to: '/transactions', label: /Financeiro/ },
  { to: '/investments', label: /Investimentos/ },
  { to: '/reports', label: /Relatórios/ },
  { to: '/invoices', label: /Fatura de Serviços/ },
  { to: '/shopping', label: /Lista de Compras/ },
  { to: '/todos', label: /Tarefas/ },
  { to: '/notes', label: /Anotações/ },
  { to: '/drive', label: /Drive/ },
  { to: '/settings/company', label: /Configurações/ },
  { to: '/admin', label: /Administração/ },
];

// Superuser + owner role so every conditional item (Fatura de Serviços,
// Configurações, Administração) renders in both menus.
const SUPERUSER_AUTH = {
  user: { is_superuser: true },
  tenant: { role: 'owner', person_type: 'pj' },
};

describe('Sidebar and BottomNav stay in sync with every top-level module', () => {
  beforeEach(() => {
    (useAuth as any).mockReturnValue(SUPERUSER_AUTH);
  });

  it.each(EXPECTED_MODULE_LINKS)('Sidebar links to $to', ({ to, label }) => {
    render(
      <MemoryRouter>
        <Sidebar isOpen={false} onClose={() => {}} collapsed={false} onToggleCollapse={() => {}} />
      </MemoryRouter>
    );

    const link = screen.getByRole('link', { name: label });
    expect(link).toHaveAttribute('href', to);
  });

  it.each(EXPECTED_MODULE_LINKS)('BottomNav "more" menu links to $to', ({ to, label }) => {
    render(
      <MemoryRouter>
        <BottomNav />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Menu/ }));

    const link = screen.getByRole('link', { name: label });
    expect(link).toHaveAttribute('href', to);
  });

  it('renders the exact same set of module links in Sidebar and BottomNav', () => {
    const { unmount } = render(
      <MemoryRouter>
        <Sidebar isOpen={false} onClose={() => {}} collapsed={false} onToggleCollapse={() => {}} />
      </MemoryRouter>
    );
    const sidebarHrefs = screen.getAllByRole('link').map((el) => el.getAttribute('href')).sort();
    unmount();

    render(
      <MemoryRouter>
        <BottomNav />
      </MemoryRouter>
    );
    fireEvent.click(screen.getByRole('button', { name: /Menu/ }));
    const panel = screen.getByRole('button', { name: /Menu/ }).closest('.txn-more-menu-wrapper') as HTMLElement;
    // "Principal" (dashboard) and the "+" new-transaction FAB live outside
    // the "more" panel — restrict to the panel's own links for a fair diff.
    const bottomNavHrefs = within(panel).getAllByRole('link').map((el) => el.getAttribute('href')).sort();

    expect(bottomNavHrefs).toEqual(sidebarHrefs.filter((href) => href !== '/dashboard'));
  });
});

describe('Fatura de Serviços is restricted to PJ tenants', () => {
  const SUPERUSER_PF_AUTH = {
    user: { is_superuser: true },
    tenant: { role: 'owner', person_type: 'pf' },
  };

  beforeEach(() => {
    (useAuth as any).mockReturnValue(SUPERUSER_PF_AUTH);
  });

  it('hides the link in Sidebar for a PF tenant, even for superusers', () => {
    render(
      <MemoryRouter>
        <Sidebar isOpen={false} onClose={() => {}} collapsed={false} onToggleCollapse={() => {}} />
      </MemoryRouter>
    );

    expect(screen.queryByRole('link', { name: /Fatura de Serviços/ })).not.toBeInTheDocument();
  });

  it('hides the link in BottomNav "more" menu for a PF tenant, even for superusers', () => {
    render(
      <MemoryRouter>
        <BottomNav />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: /Menu/ }));

    expect(screen.queryByRole('link', { name: /Fatura de Serviços/ })).not.toBeInTheDocument();
  });
});
