import { useState } from 'react';
import { createPortal } from 'react-dom';
import type { CattleLot, CattleLotPayload } from '../../api/cattle';
import { firstApiError } from '../../utils/apiError';
import { todayInBrasilia } from '../../utils/date';

interface CattleLotModalProps {
  lot: CattleLot | null;
  onClose: () => void;
  onSave: (payload: CattleLotPayload) => Promise<void>;
  // Só pede a exclusão — a confirmação e a chamada à API ficam com a página.
  onDelete?: () => void;
}

export default function CattleLotModal({ lot, onClose, onSave, onDelete }: CattleLotModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState(lot?.name || '');
  const [system, setSystem] = useState<CattleLot['system']>(lot?.system || 'feedlot');
  const [status, setStatus] = useState<CattleLot['status']>(lot?.status || 'open');
  const [location, setLocation] = useState(lot?.location || '');
  const [startDate, setStartDate] = useState(lot?.start_date || todayInBrasilia());
  const [endDate, setEndDate] = useState(lot?.end_date || '');
  const [notes, setNotes] = useState(lot?.notes || '');

  const handleStatusChange = (next: CattleLot['status']) => {
    setStatus(next);
    // Encerrar o lote sem data de saída deixaria os dias de cocho correndo.
    if (next === 'closed' && !endDate) setEndDate(todayInBrasilia());
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await onSave({
        name,
        system,
        status,
        location,
        start_date: startDate,
        end_date: endDate || null,
        notes,
      });
      onClose();
    } catch (err: any) {
      setError(firstApiError(err.response?.data) || 'Erro ao salvar lote.');
    } finally {
      setLoading(false);
    }
  };

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-content" role="dialog" aria-modal="true" aria-label={lot ? 'Editar lote' : 'Novo lote'}>
        <div className="modal-header">
          <h2 className="modal-title">{lot ? 'Editar Lote' : 'Novo Lote'}</h2>
          <button className="btn-ghost btn-icon" onClick={onClose} aria-label="Fechar">×</button>
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
            <label className="label" htmlFor="cattle-lot-name">Nome do lote</label>
            <input
              id="cattle-lot-name"
              type="text"
              className="input"
              placeholder="Ex.: Lote 01 - Nelore"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div className="form-amount-date-grid" style={{ gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
            <div>
              <label className="label" htmlFor="cattle-lot-system">Sistema</label>
              <select
                id="cattle-lot-system"
                className="select"
                value={system}
                onChange={(e) => setSystem(e.target.value as CattleLot['system'])}
              >
                <option value="feedlot">Confinamento</option>
                <option value="semi_feedlot">Semiconfinamento</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="cattle-lot-status">Status</label>
              <select
                id="cattle-lot-status"
                className="select"
                value={status}
                onChange={(e) => handleStatusChange(e.target.value as CattleLot['status'])}
              >
                <option value="open">Em andamento</option>
                <option value="closed">Encerrado</option>
              </select>
            </div>
          </div>

          <div className="form-amount-date-grid" style={{ gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
            <div>
              <label className="label" htmlFor="cattle-lot-start">Data de entrada</label>
              <input
                id="cattle-lot-start"
                type="date"
                className="input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </div>
            <div>
              <label className="label" htmlFor="cattle-lot-end">Data de saída</label>
              <input
                id="cattle-lot-end"
                type="date"
                className="input"
                value={endDate}
                min={startDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div style={{ marginBottom: 'var(--space-md)' }}>
            <label className="label" htmlFor="cattle-lot-location">Local / Curral</label>
            <input
              id="cattle-lot-location"
              type="text"
              className="input"
              placeholder="Opcional"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>

          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <label className="label" htmlFor="cattle-lot-notes">Observações</label>
            <textarea
              id="cattle-lot-notes"
              className="input"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {lot && onDelete ? (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ color: 'var(--color-danger)' }}
                onClick={onDelete}
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
