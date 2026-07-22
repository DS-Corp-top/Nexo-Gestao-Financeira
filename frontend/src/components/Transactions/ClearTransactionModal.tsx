import { useState, useEffect } from 'react';
import { type Transaction } from '../../api/transactions';
import { type Category } from '../../api/categories';
import CurrencyInput from '../CurrencyInput';

interface ClearTransactionModalProps {
  transaction: Transaction | null;
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    id: number,
    date: string,
    unlockPassword?: string,
    overrides?: { amount?: string; account?: number; description?: string; category?: number | null }
  ) => Promise<void>;
  requireUnlockPassword?: boolean;
  accounts?: { id: number; name: string }[];
  categories?: Category[];
}

export default function ClearTransactionModal({ transaction, isOpen, onClose, onConfirm, requireUnlockPassword = false, accounts = [], categories = [] }: ClearTransactionModalProps) {
  const [clearedDate, setClearedDate] = useState('');
  const [unlockPassword, setUnlockPassword] = useState('');
  const [amount, setAmount] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [description, setDescription] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (transaction) {
      setClearedDate(transaction.date || new Date().toISOString().split('T')[0]);
      setUnlockPassword('');
      setAmount(transaction.amount);
      setAccountId(String(transaction.account));
      setCategoryId(transaction.category ? String(transaction.category) : '');
      setDescription(transaction.description || '');
    }
  }, [transaction]);

  if (!isOpen || !transaction) return null;

  const isTransfer = transaction.transaction_type === 'transfer';
  const categoryOptions = categories.filter((c) => c.category_type === transaction.transaction_type);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setLoading(true);
      await onConfirm(transaction.id, clearedDate, unlockPassword || undefined, {
        amount,
        account: accountId ? Number(accountId) : undefined,
        description,
        category: isTransfer ? undefined : (categoryId ? Number(categoryId) : null),
      });
      onClose();
    } catch (err: any) {
      console.error('Falha ao baixar transação:', err.response?.status);
      alert(err.response?.data?.detail || 'Erro ao baixar transação');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (val: string | number) => {
    return Number(val).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  };

  return (
    <div className="modal-overlay">
      <div className="app-modal-content clear-modal">
        <div className="clear-modal-head">
          <div>
            <p className="clear-modal-kicker">Baixar transacao</p>
            <h3 className="clear-modal-title">{transaction.display_title || transaction.description || 'Sem descrição'}</h3>
          </div>
          <button type="button" onClick={onClose} className="clear-modal-close" aria-label="Fechar modal">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" width="20" height="20">
              <path d="M18 6L6 18"></path>
              <path d="M6 6l12 12"></path>
            </svg>
          </button>
        </div>

        <div className="clear-modal-summary">
          <span>Original: {transaction.account_name}</span>
          <strong style={{ color: transaction.transaction_type === 'income' ? '#86efac' : '#fda4af' }}>
            {formatCurrency(transaction.amount)}
          </strong>
        </div>

        <form onSubmit={handleSubmit} className="clear-modal-form">
          <label className="clear-modal-label" htmlFor={`modal-description-${transaction.id}`}>Descrição</label>
          <input
            id={`modal-description-${transaction.id}`}
            className="clear-modal-date"
            type="text"
            autoFocus
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />

          <label className="clear-modal-label" htmlFor={`modal-account-${transaction.id}`}>Conta</label>
          <select
            id={`modal-account-${transaction.id}`}
            className="clear-modal-date"
            required
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
          >
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>{acc.name}</option>
            ))}
          </select>

          {!isTransfer && (
            <>
              <label className="clear-modal-label" htmlFor={`modal-category-${transaction.id}`}>Categoria</label>
              <select
                id={`modal-category-${transaction.id}`}
                className="clear-modal-date"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
              >
                <option value="">Sem categoria</option>
                {categoryOptions.map((cat) => (
                  <option key={cat.id} value={cat.id}>{cat.name}</option>
                ))}
              </select>
            </>
          )}

          <label className="clear-modal-label" htmlFor={`modal-amount-${transaction.id}`}>Valor</label>
          <CurrencyInput
            id={`modal-amount-${transaction.id}`}
            className="clear-modal-date"
            required
            value={amount}
            onChange={setAmount}
          />

          <label className="clear-modal-label" htmlFor={`modal-cleared-date-${transaction.id}`}>Data da baixa</label>
          <input
            id={`modal-cleared-date-${transaction.id}`}
            className="clear-modal-date"
            type="date"
            required
            value={clearedDate}
            onChange={(e) => setClearedDate(e.target.value)}
          />

          {requireUnlockPassword && (
            <>
              <label className="clear-modal-label" htmlFor={`modal-unlock-password-${transaction.id}`}>Senha para mês fechado</label>
              <input
                id={`modal-unlock-password-${transaction.id}`}
                className="clear-modal-date"
                type="password"
                required
                value={unlockPassword}
                onChange={(e) => setUnlockPassword(e.target.value)}
              />
            </>
          )}

          <button type="submit" className="clear-modal-submit" disabled={loading}>
            {loading ? 'Aguarde...' : 'Confirmar baixa'}
          </button>
        </form>
      </div>
    </div>
  );
}
