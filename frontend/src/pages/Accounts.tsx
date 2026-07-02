import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit2, Wallet } from 'lucide-react';
import { fetchAccounts, createAccount, updateAccount, type Account } from '../api/accounts';
import AccountModal from '../components/Accounts/AccountModal';
import { useIsAdmin } from '../hooks/useIsAdmin';

function formatCurrency(value: string | number | null, currency: string = 'BRL'): string {
  if (value == null) return '••••••';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('pt-BR', { style: 'currency', currency });
}

export default function Accounts() {
  const isAdmin = useIsAdmin();
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



  return (
    <div className="animate-fade-in">
      <div className="page-header">
        {isAdmin && (
          <button className="btn btn-primary" onClick={handleOpenNew}>
            <Plus size={18} /> Nova Conta
          </button>
        )}
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
                  <div style={{ display: 'flex', gap: '8px', marginTop: 4 }}>
                    <span className="badge badge-info">
                      {account.account_type === 'card' ? 'Cartão de Crédito' : account.account_type === 'cash' ? 'Dinheiro' : 'Conta Corrente'}
                    </span>
                    {account.currency && (
                      <span className="badge" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>
                        {account.currency}
                      </span>
                    )}
                  </div>
                </div>
                {isAdmin && (
                  <button
                    className="btn-ghost btn-icon"
                    onClick={() => handleOpenEdit(account)}
                    title="Editar Conta"
                  >
                    <Edit2 size={16} />
                  </button>
                )}

              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Saldo Atual</span>
                  <span style={{ fontWeight: 600, color: account.balance == null || parseFloat(account.balance) >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                    {formatCurrency(account.balance, account.currency)}
                  </span>
                </div>
                
                {account.account_type === 'card' && account.credit_limit && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ color: 'var(--color-text-secondary)' }}>Limite Total</span>
                    <span>{formatCurrency(account.credit_limit, account.currency)}</span>
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
