import { useState } from 'react';
import { createPortal } from 'react-dom';
import { type Category, type CreateCategoryPayload } from '../../api/categories';

interface CategoryModalProps {
  category: Category | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: CreateCategoryPayload) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
}

export default function CategoryModal({ category, isOpen, onClose, onSave, onDelete }: CategoryModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Form state
  const [name, setName] = useState(category?.name || '');
  const [categoryType, setCategoryType] = useState<'income' | 'expense'>(
    category?.category_type || 'expense'
  );
  const [expenseKind, setExpenseKind] = useState<'operating' | 'cost'>(
    category?.expense_kind || 'operating'
  );

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await onSave({
        name,
        category_type: categoryType,
        expense_kind: categoryType === 'expense' ? expenseKind : 'operating',
      });
      onClose();
    } catch (err: any) {
      setError(err.response?.data?.detail || 'Erro ao salvar categoria.');
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!category || !onDelete) return;
    if (!window.confirm('Tem certeza que deseja excluir esta categoria? As transações vinculadas poderão ser afetadas.')) return;
    
    setLoading(true);
    try {
      await onDelete(category.id);
      onClose();
    } catch (err: any) {
      setError('Erro ao excluir categoria. Ela pode estar em uso.');
      setLoading(false);
    }
  };

  return createPortal(
    <div className="modal-overlay">
      <div className="modal-content">
        <div className="modal-header">
          <h2 className="modal-title">{category ? 'Editar Categoria' : 'Nova Categoria'}</h2>
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
            <label className="label">Nome da Categoria</label>
            <input
              type="text"
              className="input"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </div>

          <div style={{ marginBottom: 'var(--space-lg)' }}>
            <label className="label">Tipo</label>
            <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="categoryType"
                  value="expense"
                  checked={categoryType === 'expense'}
                  onChange={() => setCategoryType('expense')}
                />
                <span>Despesa</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="categoryType"
                  value="income"
                  checked={categoryType === 'income'}
                  onChange={() => setCategoryType('income')}
                />
                <span>Receita</span>
              </label>
            </div>
          </div>

          {categoryType === 'expense' && (
            <div style={{ marginBottom: 'var(--space-lg)' }}>
              <label className="label">Natureza da Despesa</label>
              <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="expenseKind"
                    value="operating"
                    checked={expenseKind === 'operating'}
                    onChange={() => setExpenseKind('operating')}
                  />
                  <span>Despesa Operacional</span>
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
                  <input
                    type="radio"
                    name="expenseKind"
                    value="cost"
                    checked={expenseKind === 'cost'}
                    onChange={() => setExpenseKind('cost')}
                  />
                  <span>Custo do Serviço/Produto</span>
                </label>
              </div>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                Usado no DRE Gerencial para separar Lucro Bruto de Despesas Operacionais.
              </span>
            </div>
          )}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {category && onDelete ? (
              <button
                type="button"
                className="btn btn-ghost"
                style={{ color: 'var(--color-danger)' }}
                onClick={handleDelete}
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
