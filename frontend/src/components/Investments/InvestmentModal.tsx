import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchBacenBanks, type Investment, type CreateInvestmentPayload } from '../../api/investments';

interface InvestmentModalProps {
  investment: Investment | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: CreateInvestmentPayload) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
}

function normalizeSearch(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

export default function InvestmentModal({ investment, isOpen, onClose, onSave, onDelete }: InvestmentModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [brokerFocused, setBrokerFocused] = useState(false);

  // Form state
  const [name, setName] = useState(investment?.name || '');
  const [investmentType, setInvestmentType] = useState<Investment['investment_type']>(
    investment?.investment_type || 'other'
  );
  const [currency, setCurrency] = useState<Investment['currency']>(
    investment?.currency || 'BRL'
  );
  const [broker, setBroker] = useState(investment?.broker || '');
  const [isActive, setIsActive] = useState(investment?.is_active ?? true);

  const { data: bacenBanks = [], isLoading: bacenBanksLoading, isError: bacenBanksError } = useQuery({
    queryKey: ['bacen-banks'],
    queryFn: fetchBacenBanks,
    enabled: isOpen,
    staleTime: 24 * 60 * 60 * 1000,
  });

  const brokerSuggestions = useMemo(() => {
    const query = normalizeSearch(broker.trim());
    if (query.length === 0) return bacenBanks.slice(0, 8);

    return bacenBanks
      .filter((bank) => {
        const name = normalizeSearch(bank.name);
        const segment = normalizeSearch(bank.segment);
        return name.includes(query) || segment.includes(query);
      })
      .slice(0, 8);
  }, [bacenBanks, broker]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await onSave({
        name,
        investment_type: investmentType,
        currency,
        broker,
        is_active: isActive,
      });
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao salvar investimento.');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2 className="modal-title">{investment ? 'Editar Investimento' : 'Novo Investimento'}</h2>
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
            <label className="label">Nome</label>
            <input
              type="text"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-amount-date-grid" style={{ gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
            <div>
              <label className="label">Tipo</label>
              <select
                className="select"
                value={investmentType}
                onChange={(e) => setInvestmentType(e.target.value as any)}
              >
                <option value="stocks">Ações</option>
                <option value="fii">FII</option>
                <option value="fixed_income">Renda Fixa</option>
                <option value="crypto">Cripto</option>
                <option value="savings">Poupança</option>
                <option value="emergency">Reserva de Emergência</option>
                <option value="other">Outro</option>
              </select>
            </div>

            <div>
              <label className="label">Moeda</label>
              <select
                className="select"
                value={currency}
                onChange={(e) => setCurrency(e.target.value as Investment['currency'])}
              >
                <option value="BRL">Real (BRL)</option>
                <option value="USD">Dolar (USD)</option>
                <option value="EUR">Euro (EUR)</option>
              </select>
            </div>
          </div>

          <div style={{ marginBottom: 'var(--space-md)', position: 'relative' }}>
            <label className="label">Corretora / Banco</label>
            <input
              type="text"
              className="input"
              placeholder="Digite para buscar no Bacen ou informe manualmente"
              value={broker}
              onChange={(e) => setBroker(e.target.value)}
              onFocus={() => setBrokerFocused(true)}
              onBlur={() => setBrokerFocused(false)}
              autoComplete="off"
            />
            <div style={{ marginTop: 6, fontSize: '0.74rem', color: 'var(--color-text-muted)' }}>
              Busque pelo nome do banco cadastrado no Bacen ou digite o nome da corretora.
            </div>
            {brokerFocused && (brokerSuggestions.length > 0 || bacenBanksLoading || bacenBanksError) && (
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
                  brokerSuggestions.map((bank) => (
                    <button
                      key={bank.cnpj || bank.name}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        setBroker(bank.name);
                        setBrokerFocused(false);
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

          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 'var(--space-lg)' }}>
            <input
              type="checkbox"
              id="isActive"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
            />
            <label htmlFor="isActive" style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
              Investimento Ativo
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {investment && onDelete ? (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ color: 'var(--color-danger)' }}
                onClick={() => { if(window.confirm('Excluir investimento?')) onDelete(investment.id); }}
                disabled={loading}
              >
                Excluir
              </button>
            ) : <div />}

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
    </div>,
    document.body
  );
}
