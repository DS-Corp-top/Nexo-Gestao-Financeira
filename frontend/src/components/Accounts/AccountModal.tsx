import { useState } from 'react';
import { type Account, type CreateAccountPayload } from '../../api/accounts';

interface AccountModalProps {
  account: Account | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: CreateAccountPayload) => Promise<void>;
}

export default function AccountModal({ account, isOpen, onClose, onSave }: AccountModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [name, setName] = useState(account?.name || '');
  const [accountType, setAccountType] = useState<'bank' | 'cash' | 'card'>(
    account?.account_type || 'bank'
  );
  const [initialBalance, setInitialBalance] = useState(account?.initial_balance || '0.00');
  const [creditLimit, setCreditLimit] = useState(account?.credit_limit || '');
  const [includeInBalance, setIncludeInBalance] = useState(
    account?.include_in_balance ?? true
  );

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await onSave({
        name,
        account_type: accountType,
        initial_balance: initialBalance,
        credit_limit: accountType === 'card' ? creditLimit || null : null,
        include_in_balance: includeInBalance,
        is_active: account?.is_active ?? true,
      });
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao salvar conta.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2 className="modal-title">{account ? 'Editar Conta' : 'Nova Conta'}</h2>
          <button className="btn-ghost btn-icon" onClick={onClose}>×</button>
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
            <label className="label">Nome da Conta</label>
            <input
              type="text"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
            <div>
              <label className="label">Tipo</label>
              <select
                className="select"
                value={accountType}
                onChange={(e) => setAccountType(e.target.value as any)}
              >
                <option value="bank">Conta Corrente</option>
                <option value="cash">Dinheiro em Espécie</option>
                <option value="card">Cartão de Crédito</option>
              </select>
            </div>

            <div>
              <label className="label">Saldo Inicial</label>
              <input
                type="number"
                step="0.01"
                className="input"
                value={initialBalance}
                onChange={(e) => setInitialBalance(e.target.value)}
                required
                disabled={!!account} // Não permite alterar após criação
              />
            </div>
          </div>

          {accountType === 'card' && (
            <div style={{ marginBottom: 'var(--space-md)' }}>
              <label className="label">Limite do Cartão</label>
              <input
                type="number"
                step="0.01"
                className="input"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
              />
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-lg)' }}>
            <input
              type="checkbox"
              id="includeInBalance"
              checked={includeInBalance}
              onChange={(e) => setIncludeInBalance(e.target.checked)}
            />
            <label htmlFor="includeInBalance" style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              Incluir no saldo geral
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
              Cancelar
            </button>
            <button type="submit" className="btn btn-primary" disabled={loading}>
              {loading ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
