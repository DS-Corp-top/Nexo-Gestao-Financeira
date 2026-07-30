import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { completePasswordReset, confirmPasswordResetCode, requestPasswordReset } from '../api/auth';

type Step = 'email' | 'code' | 'password' | 'done';

function extractApiError(err: any, fallback: string): string {
  const data = err?.response?.data;
  if (!data) return fallback;
  if (typeof data.detail === 'string') return data.detail;
  const firstKey = Object.keys(data)[0];
  const firstValue = firstKey ? data[firstKey] : undefined;
  if (Array.isArray(firstValue) && typeof firstValue[0] === 'string') return firstValue[0];
  if (typeof firstValue === 'string') return firstValue;
  return fallback;
}

function ErrorBanner({ message }: { message: string }) {
  if (!message) return null;
  return (
    <div
      style={{
        background: 'var(--color-danger-muted)',
        color: 'var(--color-danger)',
        padding: '10px 14px',
        borderRadius: 'var(--radius-md)',
        fontSize: '0.85rem',
        marginBottom: 'var(--space-md)',
      }}
    >
      {message}
    </div>
  );
}

export default function ForgotPassword() {
  const [step, setStep] = useState<Step>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordConfirm, setNewPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);

  const handleRequestCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setInfo('Se o e-mail informado estiver cadastrado, enviamos um código de confirmação.');
      setStep('code');
    } catch (err: any) {
      setError(extractApiError(err, 'Não foi possível enviar o código. Tente novamente.'));
    } finally {
      setLoading(false);
    }
  };

  const handleResendCode = async () => {
    setError('');
    setLoading(true);
    try {
      await requestPasswordReset(email);
      setInfo('Reenviamos o código para o seu e-mail.');
    } catch (err: any) {
      setError(extractApiError(err, 'Não foi possível reenviar o código. Tente novamente.'));
    } finally {
      setLoading(false);
    }
  };

  const handleConfirmCode = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const token = await confirmPasswordResetCode(email, code);
      setResetToken(token);
      setInfo('');
      setStep('password');
    } catch (err: any) {
      setError(extractApiError(err, 'Código inválido ou expirado.'));
    } finally {
      setLoading(false);
    }
  };

  const handleCompleteReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (newPassword !== newPasswordConfirm) {
      setError('As senhas não coincidem.');
      return;
    }
    setLoading(true);
    try {
      await completePasswordReset(resetToken, newPassword, newPasswordConfirm);
      setStep('done');
    } catch (err: any) {
      setError(extractApiError(err, 'Não foi possível redefinir a senha. Tente novamente.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ maxWidth: 440, margin: '0 auto', paddingTop: '8vh', paddingInline: 'var(--space-lg)' }} className="animate-fade-in">
      <Link
        to="/login"
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.35rem',
          fontSize: '0.85rem',
          color: 'var(--color-text-muted)',
          marginBottom: 'var(--space-xl)',
          textDecoration: 'none',
        }}
      >
        <ArrowLeft size={15} /> Voltar para o login
      </Link>

      <div style={{ marginBottom: 'var(--space-xl)' }}>
        <h1 style={{ fontSize: '1.8rem', fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--color-text-primary)' }}>
          Recuperar senha
        </h1>
        <p style={{ color: 'var(--color-text-secondary)', marginTop: 'var(--space-xs)' }}>
          {step === 'email' && 'Informe o e-mail cadastrado para receber um código de confirmação.'}
          {step === 'code' && 'Digite o código de 6 dígitos enviado para o seu e-mail.'}
          {step === 'password' && 'Escolha a nova senha para sua conta.'}
          {step === 'done' && 'Senha redefinida com sucesso.'}
        </p>
      </div>

      {step === 'email' && (
        <form onSubmit={handleRequestCode} className="card">
          <ErrorBanner message={error} />
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <label className="label" htmlFor="email">E-mail</label>
            <input
              id="email"
              className="input"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
              required
            />
          </div>
          <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Enviar código'}
          </button>
        </form>
      )}

      {step === 'code' && (
        <form onSubmit={handleConfirmCode} className="card">
          {info && <ErrorBanner message={info} />}
          <ErrorBanner message={error} />
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <label className="label" htmlFor="code">Código de confirmação</label>
            <input
              id="code"
              className="input"
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              placeholder="000000"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
              autoComplete="one-time-code"
              autoFocus
              required
            />
          </div>
          <button
            type="submit"
            className="btn btn-primary btn-lg"
            style={{ width: '100%', marginBottom: 'var(--space-sm)' }}
            disabled={loading || code.length !== 6}
          >
            {loading ? <span className="spinner" /> : 'Confirmar código'}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            style={{ width: '100%' }}
            onClick={handleResendCode}
            disabled={loading}
          >
            Reenviar código
          </button>
        </form>
      )}

      {step === 'password' && (
        <form onSubmit={handleCompleteReset} className="card">
          <ErrorBanner message={error} />
          <div style={{ marginBottom: 'var(--space-md)' }}>
            <label className="label" htmlFor="new-password">Nova senha</label>
            <input
              id="new-password"
              className="input"
              type="password"
              placeholder="••••••••"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              autoFocus
              required
              minLength={8}
            />
          </div>
          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <label className="label" htmlFor="new-password-confirm">Confirmar nova senha</label>
            <input
              id="new-password-confirm"
              className="input"
              type="password"
              placeholder="••••••••"
              value={newPasswordConfirm}
              onChange={(e) => setNewPasswordConfirm(e.target.value)}
              autoComplete="new-password"
              required
              minLength={8}
            />
          </div>
          <button type="submit" className="btn btn-primary btn-lg" style={{ width: '100%' }} disabled={loading}>
            {loading ? <span className="spinner" /> : 'Redefinir senha'}
          </button>
        </form>
      )}

      {step === 'done' && (
        <div className="card">
          <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)', marginBottom: 'var(--space-lg)' }}>
            Sua senha foi alterada. Você já pode entrar com a nova senha.
          </p>
          <Link to="/login" className="btn btn-primary btn-lg" style={{ width: '100%', display: 'block', textAlign: 'center' }}>
            Ir para o login
          </Link>
        </div>
      )}

      {step !== 'done' && (
        <div style={{ textAlign: 'center', marginTop: 'var(--space-xl)' }}>
          <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)' }}>
            Lembrou a senha?{' '}
            <Link to="/login" style={{ color: 'var(--color-accent)', fontWeight: 600 }}>
              Entrar
            </Link>
          </p>
        </div>
      )}
    </div>
  );
}
