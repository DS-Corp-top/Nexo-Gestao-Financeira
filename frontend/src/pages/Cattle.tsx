import { useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Beef, Edit2, Plus, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import {
  createCattleLot,
  createCattleLotEntry,
  deleteCattleLot,
  deleteCattleLotEntry,
  entryTypeLabels,
  fetchCattleLot,
  fetchCattleLots,
  statusLabels,
  systemLabels,
  updateCattleLot,
  type CattleEntryType,
  type CattleLot,
  type CattleLotPayload,
} from '../api/cattle';
import CattleLotModal from '../components/Cattle/CattleLotModal';
import CurrencyInput from '../components/CurrencyInput';
import { firstApiError } from '../utils/apiError';
import { todayInBrasilia } from '../utils/date';

function formatCurrency(value: string | number | null | undefined): string {
  if (value == null) return '••••••';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatPercent(value: string | number | null | undefined): string {
  if (value == null) return '—';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return `${num.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;
}

function formatKg(value: string | null | undefined): string {
  if (value == null) return '—';
  return `${parseFloat(value).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} kg`;
}

function toNumber(value: string | null | undefined): number {
  return value == null ? 0 : parseFloat(value);
}

function signedClass(value: string | number | null | undefined): string {
  if (value == null) return '';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  if (num > 0) return 'positive';
  if (num < 0) return 'negative';
  return '';
}

const COST_TYPES: CattleEntryType[] = ['acquisition', 'feed', 'medicine', 'vaccine', 'freight', 'other_cost'];
const HEAD_COUNT_TYPES: CattleEntryType[] = ['acquisition', 'sale'];

const descriptionPlaceholders: Partial<Record<CattleEntryType, string>> = {
  feed: 'Ex.: ração, silagem, núcleo',
  medicine: 'Ex.: ivermectina, antibiótico',
  vaccine: 'Ex.: aftosa, clostridiose',
  freight: 'Ex.: transporte até a fazenda',
  other_cost: 'Ex.: mão de obra, energia',
};

const entryBadgeClass: Record<CattleEntryType, string> = {
  acquisition: 'badge-info',
  feed: 'badge-warning',
  medicine: 'badge-danger',
  vaccine: 'badge-danger',
  freight: 'badge-warning',
  other_cost: 'badge-warning',
  sale: 'badge-success',
};

function ConfirmDialog({
  title, message, isPending, isError, errorMessage, onCancel, onConfirm,
}: {
  title: string;
  message: React.ReactNode;
  isPending: boolean;
  isError: boolean;
  errorMessage?: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return createPortal(
    <div
      onClick={() => !isPending && onCancel()}
      style={{
        position: 'fixed', inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        zIndex: 9999, padding: '1rem',
      }}
    >
      <div
        className="card"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
        style={{ width: '100%', maxWidth: 400, padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}
      >
        <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0 }}>{title}</h3>
        <p style={{ fontSize: '0.88rem', color: 'var(--color-text-secondary)', margin: 0 }}>{message}</p>
        {isError && (
          <p style={{ fontSize: '0.85rem', color: 'var(--color-danger)', margin: 0 }}>
            {errorMessage || 'Não foi possível excluir. Tente novamente.'}
          </p>
        )}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
          <button type="button" className="btn" onClick={onCancel} disabled={isPending}>Cancelar</button>
          <button type="button" className="btn btn-danger" onClick={onConfirm} disabled={isPending}>
            {isPending ? 'Excluindo...' : 'Excluir'}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}

export default function Cattle() {
  const queryClient = useQueryClient();
  const [selectedLotId, setSelectedLotId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingLot, setEditingLot] = useState<CattleLot | null>(null);
  const [deletingLot, setDeletingLot] = useState<CattleLot | null>(null);
  const [deletingEntryId, setDeletingEntryId] = useState<number | null>(null);
  const [filterStatus, setFilterStatus] = useState<'' | CattleLot['status']>('open');
  const [filterSystem, setFilterSystem] = useState<'' | CattleLot['system']>('');

  // Formulário de lançamento
  const [entryType, setEntryType] = useState<CattleEntryType>('acquisition');
  const [entryDate, setEntryDate] = useState(todayInBrasilia());
  const [entryAmount, setEntryAmount] = useState('');
  const [entryHeads, setEntryHeads] = useState('');
  const [entryWeight, setEntryWeight] = useState('');
  const [entryDescription, setEntryDescription] = useState('');
  const [entryError, setEntryError] = useState('');

  const { data: lots = [], isLoading: lotsLoading, isError: lotsError } = useQuery({
    queryKey: ['cattle-lots'],
    queryFn: fetchCattleLots,
  });

  const { data: currentLot, isLoading: lotLoading } = useQuery({
    queryKey: ['cattle-lot', selectedLotId],
    queryFn: () => fetchCattleLot(selectedLotId!),
    enabled: !!selectedLotId,
  });

  const invalidateLots = () => {
    queryClient.invalidateQueries({ queryKey: ['cattle-lots'] });
    queryClient.invalidateQueries({ queryKey: ['cattle-lot', selectedLotId] });
  };

  const createMutation = useMutation({ mutationFn: createCattleLot, onSuccess: invalidateLots });
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: CattleLotPayload }) => updateCattleLot(id, payload),
    onSuccess: invalidateLots,
  });
  const deleteMutation = useMutation({
    mutationFn: deleteCattleLot,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cattle-lots'] });
      setSelectedLotId(null);
      setDeletingLot(null);
    },
  });
  const createEntryMutation = useMutation({
    mutationFn: createCattleLotEntry,
    onSuccess: () => {
      invalidateLots();
      setEntryAmount('');
      setEntryHeads('');
      setEntryWeight('');
      setEntryDescription('');
    },
    onError: (err: any) => setEntryError(firstApiError(err.response?.data) || 'Erro ao salvar lançamento.'),
  });
  const deleteEntryMutation = useMutation({
    mutationFn: deleteCattleLotEntry,
    onSuccess: () => {
      invalidateLots();
      setDeletingEntryId(null);
    },
  });

  const filtered = useMemo(
    () => lots.filter((lot) => (
      (!filterStatus || lot.status === filterStatus) &&
      (!filterSystem || lot.system === filterSystem)
    )),
    [lots, filterStatus, filterSystem]
  );

  const totals = useMemo(() => {
    const sum = (key: keyof CattleLot) => filtered.reduce((acc, lot) => acc + toNumber(lot[key] as string | null), 0);
    const revenue = sum('sales_revenue');
    const profit = sum('profit');
    return {
      cost: sum('total_cost'),
      revenue,
      profit,
      margin: revenue ? (profit / revenue) * 100 : null,
      heads: filtered.reduce((acc, lot) => acc + lot.heads_on_hand, 0),
      // Mascarado (superusuário sem vínculo): não somar nulls como zero.
      masked: filtered.some((lot) => lot.total_cost == null),
    };
  }, [filtered]);

  const handleOpenNew = () => {
    setEditingLot(null);
    setModalOpen(true);
  };

  const handleOpenEdit = (lot: CattleLot, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingLot(lot);
    setModalOpen(true);
  };

  const handleRequestDelete = (lot: CattleLot, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setModalOpen(false);
    deleteMutation.reset();
    setDeletingLot(lot);
  };

  const handleSave = async (payload: CattleLotPayload) => {
    if (editingLot) {
      await updateMutation.mutateAsync({ id: editingLot.id, payload });
    } else {
      await createMutation.mutateAsync(payload);
    }
  };

  const handleSelectLot = (lot: CattleLot) => {
    setSelectedLotId(lot.id);
    setEntryType(lot.heads_purchased ? 'feed' : 'acquisition');
    setEntryError('');
  };

  const needsHeads = HEAD_COUNT_TYPES.includes(entryType);

  const handleCreateEntry = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedLotId) return;
    setEntryError('');
    if (!(Number(entryAmount) > 0)) {
      setEntryError('Informe um valor maior que zero.');
      return;
    }
    createEntryMutation.mutate({
      lot: selectedLotId,
      entry_type: entryType,
      date: entryDate,
      amount: entryAmount,
      head_count: needsHeads && entryHeads ? Number(entryHeads) : null,
      weight_kg: needsHeads && entryWeight ? entryWeight : null,
      description: entryDescription,
    });
  };

  const lotModal = modalOpen && (
    <CattleLotModal
      lot={editingLot}
      onClose={() => setModalOpen(false)}
      onSave={handleSave}
      onDelete={editingLot ? () => handleRequestDelete(editingLot) : undefined}
    />
  );

  const deleteLotDialog = deletingLot && (
    <ConfirmDialog
      title="Excluir lote"
      message={<>Excluir <strong style={{ color: 'var(--color-text-primary)' }}>{deletingLot.name}</strong> apaga também todas as aquisições, tratos, custos e vendas lançados nele. Esta ação não pode ser desfeita.</>}
      isPending={deleteMutation.isPending}
      isError={deleteMutation.isError}
      onCancel={() => setDeletingLot(null)}
      onConfirm={() => deleteMutation.mutate(deletingLot.id)}
    />
  );

  if (selectedLotId) {
    if (lotLoading || !currentLot) return <div className="page-header"><span className="spinner" /></div>;
    const entries = currentLot.entries || [];

    return (
      <div className="animate-slide-in cattle-page">
        <div className="page-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
            <button className="btn-ghost btn-icon" onClick={() => setSelectedLotId(null)} aria-label="Voltar para lotes">
              <ArrowLeft size={20} />
            </button>
            <div>
              <h2 className="page-title" style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                {currentLot.name}
                <span className="badge" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>
                  {systemLabels[currentLot.system]}
                </span>
                <span className={`badge ${currentLot.status === 'open' ? 'badge-success' : 'badge-info'}`}>
                  {statusLabels[currentLot.status]}
                </span>
              </h2>
              <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                {[
                  currentLot.location,
                  `Entrada ${format(parseISO(currentLot.start_date), 'dd/MM/yyyy')}`,
                  currentLot.end_date ? `Saída ${format(parseISO(currentLot.end_date), 'dd/MM/yyyy')}` : null,
                  `${currentLot.days_on_feed} dias`,
                ].filter(Boolean).join(' · ')}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 'var(--space-sm)' }}>
            <button type="button" className="btn btn-secondary" onClick={() => handleOpenEdit(currentLot)} aria-label="Editar lote">
              <Edit2 size={16} />
              Editar
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              style={{ color: 'var(--color-danger)' }}
              onClick={() => handleRequestDelete(currentLot)}
              aria-label="Excluir lote"
            >
              <Trash2 size={16} />
              Excluir
            </button>
          </div>
        </div>

        <div className="kpi-grid" style={{ marginBottom: 'var(--space-md)' }}>
          <div className="kpi-card">
            <div className="kpi-label">Custo de aquisição</div>
            <div className="kpi-value negative">{formatCurrency(currentLot.acquisition_cost)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Custo de trato</div>
            <div className="kpi-value negative">{formatCurrency(currentLot.feed_cost)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Remédios</div>
            <div className="kpi-value negative">{formatCurrency(currentLot.medicine_cost)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Vacinas</div>
            <div className="kpi-value negative">{formatCurrency(currentLot.vaccine_cost)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Frete</div>
            <div className="kpi-value negative">{formatCurrency(currentLot.freight_cost)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Outros custos</div>
            <div className="kpi-value negative">{formatCurrency(currentLot.other_costs)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Custo total</div>
            <div className="kpi-value negative">{formatCurrency(currentLot.total_cost)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Receita de venda</div>
            <div className="kpi-value positive">{formatCurrency(currentLot.sales_revenue)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Lucro</div>
            <div className={`kpi-value ${signedClass(currentLot.profit)}`}>{formatCurrency(currentLot.profit)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Margem de lucro</div>
            <div className={`kpi-value ${signedClass(currentLot.margin_percent)}`}>{formatPercent(currentLot.margin_percent)}</div>
          </div>
        </div>

        <div className="kpi-grid" style={{ marginBottom: 'var(--space-lg)' }}>
          <div className="kpi-card">
            <div className="kpi-label">Cabeças (compradas / vendidas)</div>
            <div className="kpi-value">{currentLot.heads_purchased} / {currentLot.heads_sold}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Em estoque</div>
            <div className="kpi-value accent">{currentLot.heads_on_hand} cab.</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Custo por cabeça</div>
            <div className="kpi-value">{currentLot.cost_per_head == null && currentLot.total_cost != null ? '—' : formatCurrency(currentLot.cost_per_head)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Trato / cabeça / dia</div>
            <div className="kpi-value">{currentLot.feed_cost_per_head_day == null && currentLot.feed_cost != null ? '—' : formatCurrency(currentLot.feed_cost_per_head_day)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Peso médio (entrada / saída)</div>
            <div className="kpi-value" style={{ fontSize: '1.1rem' }}>
              {formatKg(currentLot.avg_purchase_weight_kg)} / {formatKg(currentLot.avg_sale_weight_kg)}
            </div>
          </div>
        </div>

        <div className="card" style={{ marginBottom: 'var(--space-md)' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-md)' }}>Novo lançamento</h3>
          {entryError && (
            <div
              role="alert"
              style={{
                background: 'var(--color-danger-muted)',
                color: 'var(--color-danger)',
                padding: '10px 14px',
                borderRadius: 'var(--radius-md)',
                fontSize: '0.85rem',
                marginBottom: 'var(--space-md)',
              }}
            >
              {entryError}
            </div>
          )}
          <form className="cattle-entry-form" onSubmit={handleCreateEntry}>
            <select
              className="select cattle-field-type"
              aria-label="Tipo de lançamento"
              value={entryType}
              onChange={(e) => setEntryType(e.target.value as CattleEntryType)}
            >
              {(Object.keys(entryTypeLabels) as CattleEntryType[]).map((type) => (
                <option key={type} value={type}>{entryTypeLabels[type]}</option>
              ))}
            </select>
            <input
              type="date"
              className="input cattle-field-date"
              aria-label="Data"
              value={entryDate}
              onChange={(e) => setEntryDate(e.target.value)}
              required
            />
            <CurrencyInput
              value={entryAmount}
              onChange={setEntryAmount}
              className="input cattle-field-amount"
              placeholder="Valor (R$)"
              required
            />
            {needsHeads && (
              <>
                <input
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  className="input cattle-field-heads"
                  aria-label="Cabeças"
                  placeholder="Cabeças"
                  value={entryHeads}
                  onChange={(e) => setEntryHeads(e.target.value)}
                  required
                />
                <input
                  type="number"
                  min={0}
                  step="0.01"
                  inputMode="decimal"
                  className="input cattle-field-weight"
                  aria-label="Peso total (kg)"
                  placeholder="Peso (kg)"
                  value={entryWeight}
                  onChange={(e) => setEntryWeight(e.target.value)}
                />
              </>
            )}
            <input
              type="text"
              className="input cattle-field-desc"
              aria-label="Descrição"
              placeholder={descriptionPlaceholders[entryType] || 'Descrição (opcional)'}
              value={entryDescription}
              onChange={(e) => setEntryDescription(e.target.value)}
            />
            <button type="submit" className="btn btn-primary cattle-field-submit" disabled={createEntryMutation.isPending}>
              {createEntryMutation.isPending ? 'Salvando...' : 'Adicionar'}
            </button>
          </form>
        </div>

        <div className="card">
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-md)' }}>Histórico de lançamentos</h3>
          {entries.length === 0 ? (
            <div className="empty-state" style={{ padding: 'var(--space-lg)' }}>
              <p className="empty-state-text">Nenhum lançamento registrado. Comece pela aquisição dos animais.</p>
            </div>
          ) : (
            <>
            <div className="table-wrapper cattle-history-table">
              <table className="table">
                <thead>
                  <tr>
                    <th>Data</th>
                    <th>Tipo</th>
                    <th>Descrição</th>
                    <th style={{ textAlign: 'right' }}>Cabeças</th>
                    <th style={{ textAlign: 'right' }}>Peso</th>
                    <th style={{ textAlign: 'right' }}>Valor</th>
                    <th style={{ width: 40 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {entries.map((entry) => {
                    const isCost = COST_TYPES.includes(entry.entry_type);
                    return (
                      <tr key={entry.id}>
                        <td>{format(parseISO(entry.date), 'dd/MM/yyyy')}</td>
                        <td><span className={`badge ${entryBadgeClass[entry.entry_type]}`}>{entryTypeLabels[entry.entry_type]}</span></td>
                        <td>{entry.description || '-'}</td>
                        <td style={{ textAlign: 'right' }}>{entry.head_count ?? '-'}</td>
                        <td className="cattle-amount" style={{ textAlign: 'right' }}>{entry.weight_kg ? formatKg(entry.weight_kg) : '-'}</td>
                        <td className="cattle-amount" style={{ textAlign: 'right', fontWeight: 600, color: isCost ? 'var(--color-danger)' : 'var(--color-success)' }}>
                          {isCost ? '-' : '+'}{formatCurrency(entry.amount)}
                        </td>
                        <td>
                          <button
                            className="btn-ghost btn-icon"
                            aria-label="Excluir lançamento"
                            onClick={() => { deleteEntryMutation.reset(); setDeletingEntryId(entry.id); }}
                          >
                            <Trash2 size={16} style={{ color: 'var(--color-danger)' }} />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <ul className="cattle-history-list">
              {entries.map((entry) => {
                const isCost = COST_TYPES.includes(entry.entry_type);
                const details = [
                  entry.head_count != null ? `${entry.head_count} cab.` : null,
                  entry.weight_kg ? formatKg(entry.weight_kg) : null,
                  entry.description || null,
                ].filter(Boolean).join(' · ');
                return (
                  <li key={entry.id} className="cattle-history-item">
                    <div className="cattle-history-item-main">
                      <div className="cattle-history-item-head">
                        <span className={`badge ${entryBadgeClass[entry.entry_type]}`}>{entryTypeLabels[entry.entry_type]}</span>
                        <span className="cattle-history-item-date">{format(parseISO(entry.date), 'dd/MM/yyyy')}</span>
                      </div>
                      {details && <div className="cattle-history-item-details">{details}</div>}
                    </div>
                    <div className="cattle-history-item-amount" style={{ color: isCost ? 'var(--color-danger)' : 'var(--color-success)' }}>
                      {isCost ? '-' : '+'}{formatCurrency(entry.amount)}
                    </div>
                    <button
                      className="btn-ghost btn-icon"
                      aria-label="Excluir lançamento"
                      onClick={() => { deleteEntryMutation.reset(); setDeletingEntryId(entry.id); }}
                    >
                      <Trash2 size={16} style={{ color: 'var(--color-danger)' }} />
                    </button>
                  </li>
                );
              })}
            </ul>
            </>
          )}
        </div>

        {lotModal}
        {deleteLotDialog}
        {deletingEntryId !== null && (
          <ConfirmDialog
            title="Excluir lançamento"
            message="Tem certeza que deseja excluir este lançamento? Esta ação não pode ser desfeita."
            isPending={deleteEntryMutation.isPending}
            isError={deleteEntryMutation.isError}
            errorMessage={firstApiError((deleteEntryMutation.error as any)?.response?.data)}
            onCancel={() => setDeletingEntryId(null)}
            onConfirm={() => deleteEntryMutation.mutate(deletingEntryId)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="animate-fade-in cattle-page">
      <div className="page-header">
        <div>
          <h2 className="page-title">Confinamento</h2>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
            Custos de aquisição e trato, vendas e margem por lote
          </div>
        </div>
        <button className="btn btn-primary" onClick={handleOpenNew} aria-label="Novo lote">
          <Plus size={18} />
          Novo lote
        </button>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 'var(--space-md)' }}>
        <div className="kpi-card">
          <div className="kpi-label">Custo total</div>
          <div className="kpi-value negative">{formatCurrency(totals.masked ? null : totals.cost)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Receita de venda</div>
          <div className="kpi-value positive">{formatCurrency(totals.masked ? null : totals.revenue)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Lucro</div>
          <div className={`kpi-value ${totals.masked ? '' : signedClass(totals.profit)}`}>{formatCurrency(totals.masked ? null : totals.profit)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Margem de lucro</div>
          <div className={`kpi-value ${signedClass(totals.margin)}`}>{totals.masked ? '••••••' : formatPercent(totals.margin)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Cabeças em estoque</div>
          <div className="kpi-value accent">{totals.heads}</div>
        </div>
      </div>

      <div className="cattle-filters">
        <select
          className="select"
          aria-label="Filtrar por status"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value as '' | CattleLot['status'])}
        >
          <option value="open">Em andamento</option>
          <option value="closed">Encerrados</option>
          <option value="">Todos os status</option>
        </select>
        <select
          className="select"
          aria-label="Filtrar por sistema"
          value={filterSystem}
          onChange={(e) => setFilterSystem(e.target.value as '' | CattleLot['system'])}
        >
          <option value="">Todos os sistemas</option>
          <option value="feedlot">Confinamento</option>
          <option value="semi_feedlot">Semiconfinamento</option>
        </select>
      </div>

      {lotsError ? (
        <div className="empty-state">
          <Beef className="empty-state-icon" />
          <h3 className="empty-state-title">Erro ao carregar lotes</h3>
          <p className="empty-state-text">Recarregue a página ou verifique sua conexão.</p>
        </div>
      ) : lotsLoading ? (
        <div className="cattle-list-grid">
          {[1, 2, 3].map((i) => <div key={i} className="skeleton" style={{ height: 180 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <Beef className="empty-state-icon" />
          <h3 className="empty-state-title">Nenhum lote encontrado</h3>
          <p className="empty-state-text">
            {lots.length ? 'Tente ajustar os filtros.' : 'Cadastre um lote para lançar aquisição, trato e vendas.'}
          </p>
        </div>
      ) : (
        <div className="cattle-list-grid">
          {filtered.map((lot) => (
            <div
              key={lot.id}
              className="card"
              style={{ cursor: 'pointer', opacity: lot.status === 'open' ? 1 : 0.75 }}
              onClick={() => handleSelectLot(lot)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-sm)' }}>
                <div>
                  <h3 style={{ fontSize: '1.1rem', fontWeight: 600 }}>{lot.name}</h3>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                    {[systemLabels[lot.system], statusLabels[lot.status], `${lot.days_on_feed} dias`].join(' · ')}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    onClick={(e) => handleOpenEdit(lot, e)}
                    aria-label={`Editar ${lot.name}`}
                    title="Editar"
                  >
                    <Edit2 size={16} />
                  </button>
                  <button
                    type="button"
                    className="btn btn-ghost btn-icon"
                    onClick={(e) => handleRequestDelete(lot, e)}
                    aria-label={`Excluir ${lot.name}`}
                    title="Excluir"
                  >
                    <Trash2 size={16} style={{ color: 'var(--color-danger)' }} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)', marginTop: 'var(--space-md)', fontSize: '0.85rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Cabeças em estoque</span>
                  <span>{lot.heads_on_hand} de {lot.heads_purchased}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Aquisição</span>
                  <span style={{ color: 'var(--color-danger)' }}>{formatCurrency(lot.acquisition_cost)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Trato e demais custos</span>
                  <span style={{ color: 'var(--color-danger)' }}>
                    {lot.total_cost == null || lot.acquisition_cost == null ? '••••••' : formatCurrency(toNumber(lot.total_cost) - toNumber(lot.acquisition_cost))}
                  </span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Vendas</span>
                  <span style={{ color: 'var(--color-success)' }}>{formatCurrency(lot.sales_revenue)}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--color-border)' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Lucro · Margem</span>
                  <span style={{ fontWeight: 600, color: toNumber(lot.profit) < 0 ? 'var(--color-danger)' : 'var(--color-accent)' }}>
                    {formatCurrency(lot.profit)} · {formatPercent(lot.margin_percent)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {lotModal}
      {deleteLotDialog}
    </div>
  );
}
