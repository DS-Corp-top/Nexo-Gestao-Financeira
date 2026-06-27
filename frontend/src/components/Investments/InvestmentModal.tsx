import { useState } from 'react';
import { createPortal } from 'react-dom';
import { type Investment, type CreateInvestmentPayload } from '../../api/investments';

interface InvestmentModalProps {
  investment: Investment | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: CreateInvestmentPayload) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
}

export default function InvestmentModal({ investment, isOpen, onClose, onSave, onDelete }: InvestmentModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [name, setName] = useState(investment?.name || '');
  const [investmentType, setInvestmentType] = useState<Investment['investment_type']>(
    investment?.investment_type || 'other'
  );
  const [broker, setBroker] = useState(investment?.broker || '');
  const [isActive, setIsActive] = useState(investment?.is_active ?? true);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await onSave({
        name,
        investment_type: investmentType,
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
              <label className="label">Corretora / Banco</label>
              <input
                type="text"
                className="input"
                value={broker}
                onChange={(e) => setBroker(e.target.value)}
              />
            </div>
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
