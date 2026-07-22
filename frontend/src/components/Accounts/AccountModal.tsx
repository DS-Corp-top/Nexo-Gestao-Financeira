import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { type Account, type CreateAccountPayload } from '../../api/accounts';
import { fetchBacenBanks, fetchInvestments } from '../../api/investments';
import CurrencyInput from '../CurrencyInput';

interface AccountModalProps {
  account: Account | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: CreateAccountPayload) => Promise<void>;
  onDelete?: () => Promise<void>;
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export default function AccountModal({ account, isOpen, onClose, onSave, onDelete }: AccountModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [bankFocused, setBankFocused] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form state
  const [name, setName] = useState(account?.name || '');
  const [accountType, setAccountType] = useState<'bank' | 'cash' | 'card'>(
    account?.account_type || 'bank'
  );
  const [currency, setCurrency] = useState<'BRL' | 'USD' | 'EUR'>(
    account?.currency || 'BRL'
  );
  const [initialBalance, setInitialBalance] = useState(account?.initial_balance || '0.00');
  const [creditLimit, setCreditLimit] = useState(account?.credit_limit || '');
  const [backingInvestmentId, setBackingInvestmentId] = useState(
    account?.backing_investment != null ? String(account.backing_investment) : ''
  );
  const [includeInBalance, setIncludeInBalance] = useState(
    account?.include_in_balance ?? true
  );
  const [isActive, setIsActive] = useState(account?.is_active ?? true);

  const { data: bacenBanks = [], isLoading: bacenBanksLoading, isError: bacenBanksError } = useQuery({
    queryKey: ['bacen-banks'],
    queryFn: fetchBacenBanks,
    enabled: isOpen,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const { data: investments = [] } = useQuery({
    queryKey: ['investments'],
    queryFn: fetchInvestments,
    enabled: isOpen && accountType === 'card',
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
        credit_limit: accountType === 'card' && creditLimit ? creditLimit : null,
        backing_investment: accountType === 'card' && backingInvestmentId ? Number(backingInvestmentId) : null,
        include_in_balance: includeInBalance,
        is_active: isActive,
      });
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao salvar conta.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete) return;
    setError('');
    setDeleting(true);
    try {
      await onDelete();
      onClose();
    } catch (err: any) {
      setConfirmingDelete(false);
      setError(err.response?.data?.detail || 'Erro ao excluir conta.');
    } finally {
      setDeleting(false);
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
              <label className="label" htmlFor="account-initial-balance">Saldo Inicial</label>
              <CurrencyInput
                id="account-initial-balance"
                className="input"
                value={initialBalance}
                onChange={setInitialBalance}
                required
                disabled={!!account} // Não permite alterar após criação
              />
            </div>
          </div>

          {accountType === 'card' && (
            <div style={{ marginBottom: 'var(--space-md)', width: '100%' }}>
              <label className="label" htmlFor="account-backing-investment">Limite garantido por investimento (opcional)</label>
              <select
                id="account-backing-investment"
                className="select"
                value={backingInvestmentId}
                onChange={(e) => setBackingInvestmentId(e.target.value)}
              >
                <option value="">Nenhum — usar limite fixo</option>
                {investments.map((inv) => (
                  <option key={inv.id} value={inv.id}>
                    {inv.name} (R$ {Number(inv.total_balance).toLocaleString('pt-BR', { minimumFractionDigits: 2 })} de saldo líquido)
                  </option>
                ))}
              </select>
              <div style={{ marginTop: 6, fontSize: '0.74rem', color: 'var(--color-text-muted)' }}>
                Quando escolhido, o limite disponível vira o valor líquido aplicado nesse investimento
                (aportes − resgates), no lugar do limite fixo abaixo.
              </div>
            </div>
          )}

          {accountType === 'card' && !backingInvestmentId && (
            <div style={{ marginBottom: 'var(--space-md)', width: '100%' }}>
              <div>
                <label className="label" htmlFor="account-credit-limit">Limite do Cartão</label>
                <CurrencyInput
                  id="account-credit-limit"
                  className="input"
                  placeholder="0,00"
                  value={creditLimit}
                  onChange={setCreditLimit}
                />
              </div>
            </div>
          )}

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-sm)' }}>
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

          {account && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-lg)' }}>
              <input
                type="checkbox"
                id="isActive"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
              />
              <label htmlFor="isActive" style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                Conta ativa (desmarque para arquivar sem perder o histórico)
              </label>
            </div>
          )}

          {onDelete && confirmingDelete && (
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
                padding: '10px 14px',
                marginBottom: 'var(--space-md)',
                background: 'var(--color-danger-muted)',
                borderRadius: 'var(--radius-md)',
              }}
            >
              <span style={{ fontSize: '0.85rem', color: 'var(--color-danger)' }}>
                Tem certeza que deseja excluir esta conta? Isso não pode ser desfeito.
              </span>
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" className="btn btn-secondary" onClick={() => setConfirmingDelete(false)} disabled={deleting}>
                  Cancelar
                </button>
                <button type="button" className="btn btn-danger" onClick={handleDelete} disabled={deleting}>
                  {deleting ? 'Excluindo...' : 'Sim, excluir'}
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--space-sm)' }}>
            {onDelete && !confirmingDelete ? (
              <button type="button" className="btn btn-danger" onClick={() => setConfirmingDelete(true)} disabled={loading}>
                Excluir Conta
              </button>
            ) : <span />}
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>
                Cancelar
              </button>
              <button type="submit" className="btn btn-primary" disabled={loading}>
                {loading ? 'Salvando...' : 'Salvar'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
