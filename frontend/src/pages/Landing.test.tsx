import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import Landing from './Landing';
import { useAuth } from '../contexts/AuthContext';

vi.mock('../contexts/AuthContext', async () => {
  const actual = await vi.importActual<typeof import('../contexts/AuthContext')>('../contexts/AuthContext');
  return { ...actual, useAuth: vi.fn() };
});

describe('Landing', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuth as any).mockReturnValue({
      isLoggedIn: false,
      isLoading: false,
      user: null,
      tenant: null,
    });
  });

  it('renders the public CTAs and repeats the brand across the page', () => {
    const { container } = render(
      <MemoryRouter>
        <Landing />
      </MemoryRouter>
    );

    expect(screen.getAllByRole('link', { name: /Entrar/i }).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByRole('link', { name: /Criar conta/i })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Suas finanças,/i })).toBeInTheDocument();
    expect(screen.getByText(/Gestão financeira pessoal e empresarial/i)).toBeInTheDocument();

    const brandImages = container.querySelectorAll('img[src="/logo-text.png"]');
    expect(brandImages.length).toBeGreaterThanOrEqual(6);
  });
});
