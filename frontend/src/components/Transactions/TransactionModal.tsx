import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { type Transaction, type CreateTransactionPayload } from '../../api/transactions';
import { fetchAccounts } from '../../api/accounts';
import { fetchCategories } from '../../api/categories';

type RecurrenceType = CreateTransactionPayload['recurrence_type'];

interface TransactionModalProps {
  transaction: Transaction | null;
  isOpen: boolean;
  onClose: () => void;
  onSave: (payload: CreateTransactionPayload) => Promise<void>;
  onDelete?: (id: number) => Promise<void>;
}

export default function TransactionModal({ transaction, isOpen, onClose, onSave, onDelete }: TransactionModalProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts });
  const { data: categories } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });

  const todayStr = new Date().toISOString().split('T')[0];

  // Form state
  const [type, setType] = useState<'income' | 'expense' | 'transfer'>(transaction?.transaction_type || 'expense');
  const [date, setDate] = useState(transaction?.date || todayStr);
  const [amount, setAmount] = useState(transaction?.amount || '');
  const [description, setDescription] = useState(transaction?.description || '');
  const [account, setAccount] = useState<number | string>(transaction?.account || '');
  const [destinationAccount, setDestinationAccount] = useState<number | string>(transaction?.destination_account || '');
  const [category, setCategory] = useState<number | string>(transaction?.category || '');
  const [isCleared, setIsCleared] = useState(transaction?.is_cleared ?? false);
  const [isIgnored, setIsIgnored] = useState(transaction?.is_ignored ?? false);
  
  const [recurrenceType, setRecurrenceType] = useState<RecurrenceType>(transaction?.recurrence_type || 'once');
  const [installmentCount, setInstallmentCount] = useState(transaction?.installment_count || '');

  // Update default category type when transaction type changes
  useEffect(() => {
    if (transaction) return; // don't mess with existing trans
    setCategory('');
  }, [type, transaction]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    
    if (!account) {
      setError('Selecione uma conta.');
      return;
    }

    if (type === 'transfer' && !destinationAccount) {
      setError('Selecione uma conta de destino para a transferência.');
      return;
    }

    if (type === 'transfer' && account === destinationAccount) {
      setError('A conta de origem e destino não podem ser a mesma.');
      return;
    }

    setLoading(true);

    try {
      await onSave({
        transaction_type: type,
        date,
        amount,
        description,
        account: Number(account),
        destination_account: type === 'transfer' ? Number(destinationAccount) : null,
        category: category ? Number(category) : null,
        is_cleared: isCleared,
        is_ignored: isIgnored,
        recurrence_type: recurrenceType,
        recurrence_interval: 1,
        recurrence_interval_unit: 'month',
        installment_count: recurrenceType === 'installment' ? Number(installmentCount) : null,
      });
      onClose();
    } catch (err: any) {
      const msgs = err.response?.data ? Object.values(err.response.data).flat().join(' ') : 'Erro ao salvar transação.';
      setError(msgs);
    } finally {
      setLoading(false);
    }
  };

  const activeAccounts = accounts?.filter(a => a.is_active) || [];
  const filteredCategories = categories?.filter(c => type === 'transfer' ? false : c.category_type === type) || [];

  return (
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 640 }}>
        <div className="modal-header">
          <h2 className="modal-title">{transaction ? 'Editar Transação' : 'Nova Transação'}</h2>
          <button className="btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>

        <form onSubmit={handleSubmit}>
          {error && (
            <div style={{ background: 'var(--color-danger-muted)', color: 'var(--color-danger)', padding: '10px 14px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', marginBottom: 'var(--space-md)' }}>
              {error}
            </div>
          )}

          {/* Type Selector */}
          {!transaction && (
            <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '10px 16px', border: `1px solid ${type === 'expense' ? 'var(--color-danger)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', background: type === 'expense' ? 'var(--color-danger-muted)' : 'transparent', flex: 1, justifyContent: 'center', transition: 'all 0.2s' }}>
                <input type="radio" name="type" value="expense" checked={type === 'expense'} onChange={() => setType('expense')} style={{ display: 'none' }} />
                <span style={{ fontWeight: type === 'expense' ? 600 : 400, color: type === 'expense' ? 'var(--color-danger)' : 'var(--color-text-secondary)' }}>Despesa</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '10px 16px', border: `1px solid ${type === 'income' ? 'var(--color-success)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', background: type === 'income' ? 'var(--color-success-muted)' : 'transparent', flex: 1, justifyContent: 'center', transition: 'all 0.2s' }}>
                <input type="radio" name="type" value="income" checked={type === 'income'} onChange={() => setType('income')} style={{ display: 'none' }} />
                <span style={{ fontWeight: type === 'income' ? 600 : 400, color: type === 'income' ? 'var(--color-success)' : 'var(--color-text-secondary)' }}>Receita</span>
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '10px 16px', border: `1px solid ${type === 'transfer' ? 'var(--color-info)' : 'var(--color-border)'}`, borderRadius: 'var(--radius-md)', background: type === 'transfer' ? 'var(--color-info-muted)' : 'transparent', flex: 1, justifyContent: 'center', transition: 'all 0.2s' }}>
                <input type="radio" name="type" value="transfer" checked={type === 'transfer'} onChange={() => setType('transfer')} style={{ display: 'none' }} />
                <span style={{ fontWeight: type === 'transfer' ? 600 : 400, color: type === 'transfer' ? 'var(--color-info)' : 'var(--color-text-secondary)' }}>Transferência</span>
              </label>
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
            <div>
              <label className="label">Descrição</label>
              <input type="text" className="input" value={description} onChange={(e) => setDescription(e.target.value)} required />
            </div>
            <div>
              <label className="label">Valor (R$)</label>
              <input type="number" step="0.01" min="0.01" className="input" value={amount} onChange={(e) => setAmount(e.target.value)} required style={{ color: type === 'expense' ? 'var(--color-danger)' : type === 'income' ? 'var(--color-success)' : 'var(--color-info)', fontWeight: 600 }} />
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
            <div>
              <label className="label">Data</label>
              <input type="date" className="input" value={date} onChange={(e) => setDate(e.target.value)} required />
            </div>
            {type !== 'transfer' && (
              <div>
                <label className="label">Categoria</label>
                <select className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                  <option value="">Selecione...</option>
                  {filteredCategories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: type === 'transfer' ? '1fr 1fr' : '1fr', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
            <div>
              <label className="label">{type === 'transfer' ? 'Conta de Origem' : 'Conta'}</label>
              <select className="select" value={account} onChange={(e) => setAccount(e.target.value)} required>
                <option value="">Selecione...</option>
                {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            {type === 'transfer' && (
              <div>
                <label className="label">Conta de Destino</label>
                <select className="select" value={destinationAccount} onChange={(e) => setDestinationAccount(e.target.value)} required>
                  <option value="">Selecione...</option>
                  {activeAccounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            )}
          </div>

          {!transaction && type !== 'transfer' && (
            <div style={{ marginBottom: 'var(--space-md)' }}>
              <label className="label">Recorrência</label>
              <div style={{ display: 'flex', gap: 'var(--space-md)' }}>
                <select className="select" value={recurrenceType} onChange={(e) => setRecurrenceType(e.target.value as RecurrenceType)}>
                  <option value="once">Única</option>
                  <option value="monthly">Recorrente (Mensal)</option>
                  <option value="installment">Parcelada (Mensal)</option>
                </select>
                {recurrenceType === 'installment' && (
                  <input type="number" min="2" max="480" placeholder="Qtd. Parcelas" className="input" value={installmentCount} onChange={(e) => setInstallmentCount(e.target.value)} required />
                )}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', gap: 'var(--space-lg)', marginBottom: 'var(--space-xl)' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={isCleared} onChange={(e) => setIsCleared(e.target.checked)} />
              <span style={{ fontSize: '0.85rem' }}>Efetivado (pago/recebido)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <input type="checkbox" checked={isIgnored} onChange={(e) => setIsIgnored(e.target.checked)} />
              <span style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>Ignorar em gráficos/dashboard</span>
            </label>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            {transaction && onDelete ? (
              <button type="button" className="btn btn-ghost" style={{ color: 'var(--color-danger)' }} onClick={() => { if(window.confirm('Excluir transação?')) onDelete(transaction.id); }} disabled={loading}>
                Excluir
              </button>
            ) : <div />}
            <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
              <button type="button" className="btn btn-secondary" onClick={onClose} disabled={loading}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
