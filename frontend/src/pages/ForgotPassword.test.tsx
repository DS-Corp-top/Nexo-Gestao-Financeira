import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import ForgotPassword from './ForgotPassword';
import * as authApi from '../api/auth';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import '@testing-library/jest-dom';

vi.mock('../api/auth', () => ({
  requestPasswordReset: vi.fn(),
  confirmPasswordResetCode: vi.fn(),
  completePasswordReset: vi.fn(),
}));

const renderPage = () => {
  return render(
    <BrowserRouter>
      <ForgotPassword />
    </BrowserRouter>
  );
};

async function goToCodeStep() {
  (authApi.requestPasswordReset as any).mockResolvedValueOnce();
  fireEvent.change(screen.getByLabelText(/E-mail/i), { target: { value: 'user@example.com' } });
  fireEvent.click(screen.getByRole('button', { name: /Enviar código/i }));
  await waitFor(() => {
    expect(screen.getByLabelText(/Código de confirmação/i)).toBeInTheDocument();
  });
}

async function goToPasswordStep() {
  await goToCodeStep();
  (authApi.confirmPasswordResetCode as any).mockResolvedValueOnce('ticket-abc');
  fireEvent.change(screen.getByLabelText(/Código de confirmação/i), { target: { value: '123456' } });
  fireEvent.click(screen.getByRole('button', { name: /Confirmar código/i }));
  await waitFor(() => {
    expect(screen.getByLabelText(/^Nova senha$/i)).toBeInTheDocument();
  });
}

describe('ForgotPassword Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the e-mail step first', () => {
    renderPage();
    expect(screen.getByPlaceholderText(/seu@email.com/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Enviar código/i })).toBeInTheDocument();
  });

  it('requests a code and advances to the code step on success', async () => {
    renderPage();
    await goToCodeStep();
    expect(authApi.requestPasswordReset).toHaveBeenCalledWith('user@example.com');
  });

  it('shows an error and stays on the e-mail step when the request fails', async () => {
    (authApi.requestPasswordReset as any).mockRejectedValueOnce({
      response: { data: { detail: 'Erro ao enviar.' } },
    });
    renderPage();

    fireEvent.change(screen.getByLabelText(/E-mail/i), { target: { value: 'user@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /Enviar código/i }));

    await waitFor(() => {
      expect(screen.getByText('Erro ao enviar.')).toBeInTheDocument();
    });
    expect(screen.getByPlaceholderText(/seu@email.com/i)).toBeInTheDocument();
  });

  it('resends the code when "Reenviar código" is clicked', async () => {
    renderPage();
    await goToCodeStep();
    (authApi.requestPasswordReset as any).mockResolvedValueOnce();

    fireEvent.click(screen.getByRole('button', { name: /Reenviar código/i }));

    await waitFor(() => {
      expect(authApi.requestPasswordReset).toHaveBeenCalledTimes(2);
    });
  });

  it('confirms the code and advances to the password step on success', async () => {
    renderPage();
    await goToPasswordStep();
    expect(authApi.confirmPasswordResetCode).toHaveBeenCalledWith('user@example.com', '123456');
  });

  it('shows an error and stays on the code step when the code is invalid', async () => {
    renderPage();
    await goToCodeStep();
    (authApi.confirmPasswordResetCode as any).mockRejectedValueOnce({
      response: { data: { detail: 'Código inválido ou expirado.' } },
    });

    fireEvent.change(screen.getByLabelText(/Código de confirmação/i), { target: { value: '000000' } });
    fireEvent.click(screen.getByRole('button', { name: /Confirmar código/i }));

    await waitFor(() => {
      expect(screen.getByText('Código inválido ou expirado.')).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/Código de confirmação/i)).toBeInTheDocument();
  });

  it('blocks submission client-side when the new passwords do not match', async () => {
    renderPage();
    await goToPasswordStep();

    fireEvent.change(screen.getByLabelText(/^Nova senha$/i), { target: { value: 'BrandNewPass456' } });
    fireEvent.change(screen.getByLabelText(/Confirmar nova senha/i), { target: { value: 'Different789' } });
    fireEvent.click(screen.getByRole('button', { name: /Redefinir senha/i }));

    await waitFor(() => {
      expect(screen.getByText('As senhas não coincidem.')).toBeInTheDocument();
    });
    expect(authApi.completePasswordReset).not.toHaveBeenCalled();
  });

  it('completes the reset and shows the success step', async () => {
    renderPage();
    await goToPasswordStep();
    (authApi.completePasswordReset as any).mockResolvedValueOnce();

    fireEvent.change(screen.getByLabelText(/^Nova senha$/i), { target: { value: 'BrandNewPass456' } });
    fireEvent.change(screen.getByLabelText(/Confirmar nova senha/i), { target: { value: 'BrandNewPass456' } });
    fireEvent.click(screen.getByRole('button', { name: /Redefinir senha/i }));

    await waitFor(() => {
      expect(screen.getByText(/Senha redefinida com sucesso/i)).toBeInTheDocument();
    });
    expect(authApi.completePasswordReset).toHaveBeenCalledWith(
      'ticket-abc',
      'BrandNewPass456',
      'BrandNewPass456'
    );
    expect(screen.getByRole('link', { name: /Ir para o login/i })).toBeInTheDocument();
  });

  it('shows an error and stays on the password step when completion fails', async () => {
    renderPage();
    await goToPasswordStep();
    (authApi.completePasswordReset as any).mockRejectedValueOnce({
      response: { data: { new_password: ['Senha muito comum.'] } },
    });

    fireEvent.change(screen.getByLabelText(/^Nova senha$/i), { target: { value: 'password1' } });
    fireEvent.change(screen.getByLabelText(/Confirmar nova senha/i), { target: { value: 'password1' } });
    fireEvent.click(screen.getByRole('button', { name: /Redefinir senha/i }));

    await waitFor(() => {
      expect(screen.getByText('Senha muito comum.')).toBeInTheDocument();
    });
    expect(screen.getByLabelText(/^Nova senha$/i)).toBeInTheDocument();
  });
});
