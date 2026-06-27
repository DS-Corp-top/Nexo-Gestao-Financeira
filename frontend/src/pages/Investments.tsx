import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, ArrowLeft, TrendingUp, PiggyBank, Edit2, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { 
  fetchInvestments, fetchInvestment, createInvestment, updateInvestment, deleteInvestment,
  createInvestmentEntry, deleteInvestmentEntry, type Investment 
} from '../api/investments';
import InvestmentModal from '../components/Investments/InvestmentModal';

function formatCurrency(value: string | number): string {
  if (value == null) return '';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function Investments() {
  const [selectedInvId, setSelectedInvId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingInv, setEditingInv] = useState<Investment | null>(null);

  const queryClient = useQueryClient();

  const { data: investments, isLoading: invsLoading } = useQuery({
    queryKey: ['investments'],
    queryFn: fetchInvestments,
  });

  const { data: currentInv, isLoading: invLoading } = useQuery({
    queryKey: ['investment', selectedInvId],
    queryFn: () => fetchInvestment(selectedInvId!),
    enabled: !!selectedInvId,
  });

  const createMutation = useMutation({
    mutationFn: createInvestment,
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['investments'] }); },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: any }) => updateInvestment(id, payload),
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ['investments'] }); 
      queryClient.invalidateQueries({ queryKey: ['investment', selectedInvId] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteInvestment,
    onSuccess: () => { 
      queryClient.invalidateQueries({ queryKey: ['investments'] }); 
      setSelectedInvId(null);
    },
  });

  const createEntryMutation = useMutation({
    mutationFn: createInvestmentEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investment', selectedInvId] });
      queryClient.invalidateQueries({ queryKey: ['investments'] });
    },
  });

  const deleteEntryMutation = useMutation({
    mutationFn: deleteInvestmentEntry,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['investment', selectedInvId] });
      queryClient.invalidateQueries({ queryKey: ['investments'] });
    },
  });

  const handleOpenNew = () => {
    setEditingInv(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (inv: Investment, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingInv(inv);
    setModalOpen(true);
  };

  const handleSave = async (payload: any) => {
    if (editingInv) {
      await updateMutation.mutateAsync({ id: editingInv.id, payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
  };

  const handleCreateEntry = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!selectedInvId) return;
    
    const formData = new FormData(e.currentTarget);
    const entry_type = formData.get('entry_type') as string;
    const date = formData.get('date') as string;
    const amount = Number(formData.get('amount'));
    const description = formData.get('description') as string;

    if (amount > 0) {
      createEntryMutation.mutate({
        investment: selectedInvId,
        entry_type: entry_type as any,
        date,
        amount: amount.toString(),
        description,
      });
      e.currentTarget.reset();
      // default date back to today
      const dateInput = e.currentTarget.elements.namedItem('date') as HTMLInputElement;
      if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];
    }
  };

  if (selectedInvId) {
    // Detail View
    if (invLoading) return <div className="page-header"><span className="spinner"/></div>;
    
    return (
      <div className="animate-slide-in">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            <button className="btn-ghost btn-icon" onClick={() => setSelectedInvId(null)}>
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {currentInv?.name}
                <button className="btn-ghost btn-icon" style={{ width: 24, height: 24, padding: 4 }} onClick={() => handleOpenEdit(currentInv!)}>
                  <Edit2 size={14} />
                </button>
              </h2>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                {currentInv?.broker} • {currentInv?.investment_type}
              </div>
            </div>
          </div>
        </div>

        <div className="kpi-grid" style={{ marginBottom: 'var(--space-lg)' }}>
          <div className="kpi-card">
            <div className="kpi-label">Aportes (Total)</div>
            <div className="kpi-value">{formatCurrency(currentInv?.total_invested || 0)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Resgates (Total)</div>
            <div className="kpi-value negative">{formatCurrency(currentInv?.total_withdrawn || 0)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Rendimentos / Div.</div>
            <div className="kpi-value positive">{formatCurrency(currentInv?.total_earnings || 0)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Saldo Líquido (Aportes)</div>
            <div className="kpi-value accent">{formatCurrency(currentInv?.net_invested || 0)}</div>
          </div>
        </div>

        <div className="card">
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-md)' }}>Novo Lançamento</h3>
          <form onSubmit={handleCreateEntry} style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap', marginBottom: 'var(--space-xl)' }}>
            <select name="entry_type" className="select" style={{ width: 140 }} required>
              <option value="deposit">Aporte</option>
              <option value="withdrawal">Resgate</option>
              <option value="dividend">Dividendo</option>
              <option value="yield">Rendimento</option>
            </select>
            <input type="date" name="date" className="input" defaultValue={new Date().toISOString().split('T')[0]} style={{ width: 140 }} required />
            <input type="number" step="0.01" min="0.01" name="amount" className="input" placeholder="Valor (R$)" style={{ width: 140 }} required />
            <input type="text" name="description" className="input" placeholder="Descrição (opcional)" style={{ flex: 1, minWidth: 200 }} />
            <button type="submit" className="btn btn-primary" disabled={createEntryMutation.isPending}>
              Adicionar
            </button>
          </form>

          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-md)' }}>Histórico de Lançamentos</h3>
          {currentInv?.entries?.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--space-lg)' }}>
              <p className="empty-state-text">Nenhum lançamento registrado.</p>
            </div>
          ) : (
            <div className="table-wrapper">
              <table className="table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Tipo</th>
                    <th>Descrição</th>
                    <th style={{ textAlign: 'right' }}>Valor</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {currentInv?.entries?.map((entry) => (
                    <tr key={entry.id}>
                      <td>{format(parseISO(entry.date), 'dd/MM/yyyy')}</td>
                      <td>
                        {entry.entry_type === 'deposit' && <span className="badge badge-success">Aporte</span>}
                        {entry.entry_type === 'withdrawal' && <span className="badge badge-danger">Resgate</span>}
                        {entry.entry_type === 'dividend' && <span className="badge badge-info">Dividendo</span>}
                        {entry.entry_type === 'yield' && <span className="badge badge-info">Rendimento</span>}
                      </td>
                      <td>{entry.description || '-'}</td>
                      <td style={{ textAlign: 'right', fontWeight: 600, color: entry.entry_type === 'withdrawal' ? 'var(--color-danger)' : 'var(--color-success)' }}>
                        {entry.entry_type === 'withdrawal' ? '-' : '+'}{formatCurrency(entry.amount)}
                      </td>
                      <td>
                        <button 
                          className="btn-ghost btn-icon" 
                          onClick={() => { if(window.confirm('Excluir lançamento?')) deleteEntryMutation.mutate(entry.id); }}
                        >
                          <Trash2 size={16} style={{ color: 'var(--color-danger)' }} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        
        {modalOpen && (
          <InvestmentModal
            investment={editingInv}
            isOpen={modalOpen}
            onClose={() => setModalOpen(false)}
            onSave={handleSave}
            onDelete={(id) => deleteMutation.mutateAsync(id)}
          />
        )}
      </div>
    );
  }

  // List View
  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <button className="btn btn-primary" onClick={handleOpenNew}>
          <Plus size={18} /> Novo Investimento
        </button>
      </div>

      {invsLoading ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-md)' }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 160 }} />)}
        </div>
      ) : investments?.length === 0 ? (
        <div className="empty-state">
          <TrendingUp className="empty-state-icon" />
          <h3 className="empty-state-title">Nenhum investimento</h3>
          <p className="empty-state-text">Comece a registrar seus investimentos e controle seus aportes.</p>
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-md)' }}>
          {investments?.map((inv) => (
            <div 
              key={inv.id} 
              className="card" 
              style={{ cursor: 'pointer', opacity: inv.is_active ? 1 : 0.6 }}
              onClick={() => setSelectedInvId(inv.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-sm)' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{inv.name}</h3>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                    {inv.broker} • {inv.investment_type}
                  </div>
                </div>
                <PiggyBank style={{ color: 'var(--color-accent)', opacity: 0.5 }} />
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)', marginTop: 'var(--space-md)' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Total Aportado</span>
                  <span>{formatCurrency(inv.total_invested)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Rendimentos</span>
                  <span className="positive">{formatCurrency(inv.total_earnings)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--color-border)' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Saldo Líquido</span>
                  <span style={{ fontWeight: 600, color: 'var(--color-accent)' }}>{formatCurrency(inv.net_invested)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {modalOpen && (
        <InvestmentModal
          investment={editingInv}
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSave={handleSave}
        />
      )}
    </div>
  );
}
