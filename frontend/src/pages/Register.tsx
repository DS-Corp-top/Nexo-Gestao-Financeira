import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { register, login } from '../api/auth';
import { useAuth } from '../contexts/AuthContext';

export default function Register() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [passwordConfirm, setPasswordConfirm] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();
  const { refresh } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== passwordConfirm) {
      setError('As senhas não conferem.');
      return;
    }

    setLoading(true);

    try {
      await register({ username, email, password, password_confirm: passwordConfirm });
      // Após registrar, faz login automaticamente
      await login({ username, password });
      await refresh();
      navigate('/');
    } catch (err: any) {
      if (err.response?.data) {
        // Formata os erros da API (pode ser um objeto com as chaves dos campos)
        const messages = Object.values(err.response.data).flat();
        setError(messages.join(' '));
      } else {
        setError('Erro ao criar conta. Verifique os dados e tente novamente.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <div className="login-card animate-scale-in">
        <div className="login-brand">
          <div className="login-brand-title">Nexo</div>
          <div className="login-brand-subtitle">Crie sua conta</div>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
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
              {error}
            </div>
          )}

          <div style={{ marginBottom: 'var(--space-md)' }}>
            <label className="label" htmlFor="username">Username</label>
            <input
              id="username"
              className="input"
              type="text"
              placeholder="seunome"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: 'var(--space-md)' }}>
            <label className="label" htmlFor="email">E-mail</label>
            <input
              id="email"
              className="input"
              type="email"
              placeholder="seu@email.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: 'var(--space-md)' }}>
            <label className="label" htmlFor="password">Senha</label>
            <input
              id="password"
              className="input"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <label className="label" htmlFor="passwordConfirm">Confirmar Senha</label>
            <input
              id="passwordConfirm"
              className="input"
              type="password"
              placeholder="••••••••"
              value={passwordConfirm}
              onChange={(e) => setPasswordConfirm(e.target.value)}
              required
            />
          </div>

          <button
            type="submit"
            className="btn btn-primary btn-lg"
            style={{ width: '100%' }}
            disabled={loading}
          >
            {loading ? <span className="spinner" /> : 'Criar Conta'}
          </button>
        </form>

        <div style={{ textAlign: 'center', marginTop: 'var(--space-lg)' }}>
          <Link
            to="/login"
            style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)' }}
          >
            Já tem uma conta? <span style={{ color: 'var(--color-accent)' }}>Entrar</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
