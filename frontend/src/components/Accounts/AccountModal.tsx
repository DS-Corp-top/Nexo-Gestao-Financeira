import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { type Account, type CreateAccountPayload } from '../../api/accounts';
import { fetchBacenBanks } from '../../api/investments';

interface AccountModalProps {
  account: Account | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: CreateAccountPayload) => Promise<void>;
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export default function AccountModal({ account, isOpen, onClose, onSave }: AccountModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bankFocused, setBankFocused] = useState(false);

  // Form state
  const [name, setName] = useState(account?.name || '');
  const [accountType, setAccountType] = useState<'bank' | 'cash' | 'card'>(
    account?.account_type || 'bank'
  );
  const [currency, setCurrency] = useState<'BRL' | 'USD' | 'EUR'>(
    account?.currency || 'BRL'
  );
  const [initialBalance, setInitialBalance] = useState(account?.initial_balance || '0.00');
  const [includeInBalance, setIncludeInBalance] = useState(
    account?.include_in_balance ?? true
  );

  const { data: bacenBanks = [], isLoading: bacenBanksLoading, isError: bacenBanksError } = useQuery({
    queryKey: ['bacen-banks'],
    queryFn: fetchBacenBanks,
    enabled: isOpen,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const bankSuggestions = useMemo(() => {
    const query = normalizeSearch(name.trim());
    if (query.length === 0) return bacenBanks.slice(0, 8);

    return bacenBanks
      .filter((bank) => {
        const bankName = normalizeSearch(bank.name);
        const segment = normalizeSearch(bank.segment);
        return bankName.includes(query) || segment.includes(query);
      })
      .slice(0, 8);
  }, [bacenBanks, name]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await onSave({
        name,
        account_type: accountType,
        currency,
        initial_balance: initialBalance,
        credit_limit: null,
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

  const modal = (
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

          <div style={{ marginBottom: 'var(--space-md)', position: 'relative' }}>
            <label className="label">Nome da Conta</label>
            <input
              type="text"
              className="input"
              placeholder="Digite para buscar no Bacen ou informe manualmente"
              value={name}
              onChange={(e) => setName(e.target.value)}
              onFocus={() => setBankFocused(true)}
              onBlur={() => setBankFocused(false)}
              autoComplete="off"
              required
            />
            <div style={{ marginTop: 6, fontSize: '0.74rem', color: 'var(--color-text-muted)' }}>
              Busque pelo nome do banco cadastrado no Bacen ou digite o nome da conta.
            </div>
            {bankFocused && (bankSuggestions.length > 0 || bacenBanksLoading || bacenBanksError) && (
              <div
                style={{
                  position: 'absolute',
                  top: 'calc(100% + 6px)',
                  left: 0,
                  right: 0,
                  zIndex: 70,
                  maxHeight: 260,
                  overflowY: 'auto',
                  background: 'var(--color-bg-elevated)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  boxShadow: 'var(--shadow-lg)',
                  padding: 4,
                }}
              >
                {bacenBanksLoading ? (
                  <div style={{ padding: '8px 10px', color: 'var(--color-text-secondary)', fontSize: '0.78rem', fontWeight: 700 }}>
                    Carregando bancos...
                  </div>
                ) : bacenBanksError ? (
                  <div style={{ padding: '8px 10px', color: 'var(--color-danger)', fontSize: '0.78rem', fontWeight: 700 }}>
                    Lista do Bacen indisponivel.
                  </div>
                ) : (
                  bankSuggestions.map((bank) => (
                    <button
                      key={bank.cnpj || bank.name}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setName(bank.name);
                        setBankFocused(false);
                      }}
                      style={{
                        display: 'block',
                        width: '100%',
                        textAlign: 'left',
                        background: 'transparent',
                        border: 'none',
                        borderRadius: 'var(--radius-sm)',
                        color: 'var(--color-text-primary)',
                        cursor: 'pointer',
                        padding: '8px 10px',
                      }}
                    >
                      <div style={{ fontSize: '0.82rem', fontWeight: 700, lineHeight: 1.25 }}>
                        {bank.name}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>
                        {bank.segment}
                      </div>
                    </button>
                  ))
                )}
              </div>
            )}
          </div>

          <div style={{ marginBottom: 'var(--space-md)', width: '100%' }}>
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

            <div style={{ flex: 1 }}>
              <label className="label">Moeda</label>
              <select
                className="select"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as any)}
              >
                <option value="BRL">Real (BRL)</option>
                <option value="USD">Dólar (USD)</option>
                <option value="EUR">Euro (EUR)</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 'var(--space-md)', width: '100%' }}>
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

  return createPortal(modal, document.body);
}
