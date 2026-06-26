import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Wallet, CalendarClock } from 'lucide-react';
import { fetchAccounts, createAccount, updateAccount, upsertCardMonthlyLimit, type Account } from '../api/accounts';
import AccountModal from '../components/Accounts/AccountModal';

function formatCurrency(value: string | number): string {
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function Accounts() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<Account | null>(null);
  
  const queryClient = useQueryClient();

  const { data: accounts, isLoading } = useQuery({
    queryKey: ['accounts'],
    queryFn: fetchAccounts,
  });

  const createMutation = useMutation({
    mutationFn: createAccount,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => updateAccount(id, payload),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['accounts'] }),
  });

  const cardLimitMutation = useMutation({
    mutationFn: upsertCardMonthlyLimit,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['accounts'] });
      queryClient.invalidateQueries({ queryKey: ['statement_summary'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });

  const handleOpenNew = () => {
    setEditingAccount(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (account: Account) => {
    setEditingAccount(account);
    setModalOpen(true);
  };

  const handleSave = async (payload: any) => {
    if (editingAccount) {
      await updateMutation.mutateAsync({ id: editingAccount.id, payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
  };

  const handleMonthlyLimit = (account: Account) => {
    const now = new Date();
    const monthValue = prompt('Mês do limite (AAAA-MM):', `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
    if (!monthValue) return;
    const [year, month] = monthValue.split('-').map(Number);
    if (!year || !month || month < 1 || month > 12) {
      alert('Informe o mês no formato AAAA-MM.');
      return;
    }
    const amount = prompt(`Limite de ${account.name} em ${monthValue}:`, account.credit_limit || '0.00');
    if (amount === null || amount.trim() === '') return;
    cardLimitMutation.mutate({ account: account.id, year, month, amount });
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">Contas</h2>
        <button className="btn btn-primary" onClick={handleOpenNew}>
          <Plus size={18} /> Nova Conta
        </button>
      </div>

      {isLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-md)' }}>
          {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 160 }} />)}
        </div>
      ) : accounts?.length === 0 ? (
        <div className="empty-state">
          <Wallet className="empty-state-icon" />
          <h3 className="empty-state-title">Nenhuma conta cadastrada</h3>
          <p className="empty-state-text">Crie sua primeira conta para começar a registrar transações.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 'var(--space-md)' }}>
          {accounts?.map((account) => (
            <div key={account.id} className="card">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-md)' }}>
                <div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 600 }}>{account.name}</h3>
                  <span className="badge badge-info" style={{ marginTop: 4 }}>
                    {account.account_type === 'card' ? 'Cartão de Crédito' : account.account_type === 'cash' ? 'Dinheiro' : 'Conta Corrente'}
                  </span>
                </div>
                <button
                  className="btn-ghost btn-icon"
                  onClick={() => handleOpenEdit(account)}
                  title="Editar Conta"
                >
                  <Edit2 size={16} />
                </button>
                {account.account_type === 'card' && (
                  <button
                    className="btn-ghost btn-icon"
                    onClick={() => handleMonthlyLimit(account)}
                    title="Limite mensal"
                  >
                    <CalendarClock size={16} />
                  </button>
                )}
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Saldo Atual</span>
                  <span style={{ fontWeight: 600, color: parseFloat(account.balance) >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {formatCurrency(account.balance)}
                  </span>
                </div>
                
                {account.account_type === 'card' && account.credit_limit && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Limite Total</span>
                    <span>{formatCurrency(account.credit_limit)}</span>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <AccountModal
          account={editingAccount}
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
