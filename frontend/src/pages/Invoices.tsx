import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Plus, CheckCircle2, FileText, Ban, Edit2 } from 'lucide-react';
import { fetchInvoices, payInvoice, cancelInvoice, type Invoice } from '../api/invoices';
import { fetchAccounts } from '../api/accounts';
import InvoiceModal from '../components/Invoices/InvoiceModal';

function formatCurrency(value: string | number): string {
  if (value == null) return '';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export default function Invoices() {
  const [modalOpen, setModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);

  const queryClient = useQueryClient();

  const { data: invoices, isLoading } = useQuery({
    queryKey: ['invoices'],
    queryFn: fetchInvoices,
  });

  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts });

  const payMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { paid_at: string; account: number } }) => payInvoice(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });

  const cancelMutation = useMutation({
    mutationFn: cancelInvoice,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });

  const handleOpenNew = () => {
    setEditingInvoice(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (inv: Invoice) => {
    setEditingInvoice(inv);
    setModalOpen(true);
  };

  const handlePay = async (invoice: Invoice) => {
    if (!accounts?.length) {
      alert('Você precisa criar uma conta primeiro para registrar o pagamento.');
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    
    // Simplification for the prompt — normally this would be a custom modal too
    const accountIdStr = prompt(`Pagar fatura ${invoice.number_display}\nValor: ${formatCurrency(invoice.net_value)}\n\nDigite o ID da conta de recebimento (Contas ativas: ${accounts.filter(a => a.is_active).map(a => `${a.id}=${a.name}`).join(', ')}):`, invoice.expected_account?.toString() || '');
    
    if (accountIdStr) {
      payMutation.mutate({ id: invoice.id, payload: { paid_at: today, account: Number(accountIdStr) } });
    }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <h2 className="page-title">Faturas</h2>
        <button className="btn btn-primary" onClick={handleOpenNew}>
          <Plus size={18} /> Nova Fatura
        </button>
      </div>

      <div className="card" style={{ padding: 0 }}>
        {isLoading ? (
          <div style={{ padding: 'var(--space-xl)', display: 'flex', justifyContent: 'center' }}>
            <span className="spinner" />
          </div>
        ) : invoices?.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-2xl)' }}>
            <FileText className="empty-state-icon" />
            <h3 className="empty-state-title">Nenhuma fatura</h3>
            <p className="empty-state-text">Você ainda não emitiu nenhuma fatura.</p>
          </div>
        ) : (
          <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Nº</th>
                  <th>Status</th>
                  <th>Cliente</th>
                  <th>Emissão / Vencimento</th>
                  <th style={{ textAlign: 'right' }}>Valor Bruto</th>
                  <th style={{ textAlign: 'right' }}>Valor Líquido</th>
                  <th style={{ textAlign: 'center' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {invoices?.map((inv) => (
                  <tr key={inv.id} style={{ opacity: inv.status === 'cancelled' ? 0.6 : 1 }}>
                    <td><strong style={{ cursor: 'pointer' }} onClick={() => handleOpenEdit(inv)}>{inv.number_display}</strong></td>
                    <td>
                      {inv.status === 'draft' && <span className="badge badge-warning">Rascunho</span>}
                      {inv.status === 'issued' && <span className="badge badge-info">Emitida</span>}
                      {inv.status === 'paid' && <span className="badge badge-success">Paga</span>}
                      {inv.status === 'cancelled' && <span className="badge badge-danger">Cancelada</span>}
                    </td>
                    <td>
                      <div style={{ fontWeight: 500 }}>{inv.client_name}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{inv.client_document}</div>
                    </td>
                    <td style={{ fontSize: '0.85rem' }}>
                      {format(parseISO(inv.issue_date), 'dd/MM')} &rarr; {format(parseISO(inv.due_date), 'dd/MM')}
                    </td>
                    <td style={{ textAlign: 'right' }}>{formatCurrency(inv.gross_value)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-accent)' }}>
                      {formatCurrency(inv.net_value)}
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
                        {inv.status === 'issued' && (
                          <button className="btn-ghost btn-icon" title="Marcar como Paga" onClick={() => handlePay(inv)}>
                            <CheckCircle2 size={16} style={{ color: 'var(--color-success)' }} />
                          </button>
                        )}
                        <button className="btn-ghost btn-icon" title="Editar Fatura" onClick={() => handleOpenEdit(inv)}>
                          <Edit2 size={16} />
                        </button>
                        {inv.status !== 'cancelled' && (
                          <button className="btn-ghost btn-icon" title="Cancelar Fatura" onClick={() => { if(window.confirm('Cancelar fatura?')) cancelMutation.mutate(inv.id); }}>
                            <Ban size={16} style={{ color: 'var(--color-danger)' }} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <InvoiceModal
          invoice={editingInvoice}
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
        />
      )}
    </div>
  );
}
