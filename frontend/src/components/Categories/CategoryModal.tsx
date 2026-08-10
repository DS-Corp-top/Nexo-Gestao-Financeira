import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { type Category, type CreateCategoryPayload } from '../../api/categories';

interface CategoryModalProps {
  category: Category | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: CreateCategoryPayload) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
}

export default function CategoryModal({
  category,
  isOpen,
  onClose,
  onSave,
  onDelete,
}: CategoryModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Form state
  const [name, setName] = useState(category?.name || '');
  const [categoryType, setCategoryType] = useState<'income' | 'expense' | null>(
    category?.category_type || null
  );
  const [expenseKind, setExpenseKind] = useState<'operating' | 'cost'>(
    category?.expense_kind || 'operating'
  );

  useEffect(() => {
    if (!isOpen) return;
    setLoading(false);
    setError('');
    setConfirmingDelete(false);
    setName(category?.name || '');
    setCategoryType(category?.category_type || null);
    setExpenseKind(category?.expense_kind || 'operating');
  }, [category, isOpen]);

  if (!isOpen) return null;

  const getErrorMessage = (err: any): string => {
    const data = err?.response?.data;
    if (typeof data?.detail === 'string') return data.detail;
    if (Array.isArray(data?.name) && typeof data.name[0] === 'string') return data.name[0];
    if (Array.isArray(data?.non_field_errors) && typeof data.non_field_errors[0] === 'string') return data.non_field_errors[0];
    if (typeof data === 'string') return data;
    return 'Erro ao salvar categoria.';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const trimmedName = name.trim();
    if (!trimmedName) {
      setError('Informe o nome da categoria.');
      return;
    }
    if (!categoryType) {
      setError('Selecione se a categoria é uma receita ou despesa.');
      return;
    }

    setLoading(true);

    try {
      await onSave({
        name: trimmedName,
        category_type: categoryType,
        expense_kind: categoryType === 'expense' ? expenseKind : 'operating',
      });
      onClose();
    } catch (err: any) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!category || !onDelete) return;

    setLoading(true);
    try {
      await onDelete(category.id);
      onClose();
    } catch (err: any) {
      setError('Erro ao excluir categoria. Ela pode estar em uso.');
      setConfirmingDelete(false);
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
            {!categoryType && (
              <span style={{ display: 'block', marginTop: '0.5rem', fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                Escolha se esta categoria é uma receita ou uma despesa.
              </span>
            )}
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
                style={{ color: 'var(--color-danger)', border: '1px solid var(--color-danger)' }}
                onClick={() => setConfirmingDelete(true)}
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
        {confirmingDelete && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(0, 0, 0, 0.74)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 'var(--space-lg)',
              borderRadius: 'inherit',
            }}
          >
            <div
              className="card"
              style={{
                width: '100%',
                maxWidth: 420,
                padding: '1.25rem',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.9rem',
              }}
            >
              <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>Excluir categoria</h3>
              <p style={{ margin: 0, fontSize: '0.88rem', color: 'var(--color-text-secondary)', lineHeight: 1.6 }}>
                Tem certeza que deseja excluir esta categoria? As transações vinculadas poderão ser afetadas.
              </p>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setConfirmingDelete(false)}
                  disabled={loading}
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  onClick={handleDelete}
                  disabled={loading}
                >
                  {loading ? 'Excluindo...' : 'Confirmar'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
}
