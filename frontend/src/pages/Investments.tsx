import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { Plus, ArrowLeft, TrendingUp, PiggyBank, Edit2, Trash2, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import {
  fetchInvestments, fetchInvestment, fetchInvestmentEntries, fetchInvestmentExchangeRates, createInvestment, updateInvestment, deleteInvestment,
  createInvestmentEntry, deleteInvestmentEntry, type Currency, type Investment
} from '../api/investments';
import InvestmentModal from '../components/Investments/InvestmentModal';

function getMonthParam(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(current: string, delta: number): string {
  const [y, m] = current.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return getMonthParam(d);
}

function getMonthBounds(monthStr: string) {
  const [y, m] = monthStr.split('-').map(Number);
  const start = new Date(y, m - 1, 1).toISOString().split('T')[0];
  const end = new Date(y, m, 0).toISOString().split('T')[0];
  return { start, end };
}

const currencyOrder: Currency[] = ['BRL', 'USD', 'EUR'];
const currencyLabels: Record<Currency, string> = {
  BRL: 'Real',
  USD: 'Dolar',
  EUR: 'Euro',
};

function getCurrency(currency?: Currency | null): Currency {
  return currency || 'BRL';
}

function formatCurrency(value: string | number | null, currency: Currency = 'BRL'): string {
  if (value == null) return '••••••';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('pt-BR', { style: 'currency', currency });
}

function parseAmount(value: string | number): number {
  return typeof value === 'string' ? parseFloat(value || '0') : value;
}

function getCurrencyTotals(items: Investment[], getValue: (investment: Investment) => number): Record<Currency, number> {
  return items.reduce<Record<Currency, number>>(
    (totals, investment) => {
      const currency = getCurrency(investment.currency);
      totals[currency] += getValue(investment);
      return totals;
    },
    { BRL: 0, USD: 0, EUR: 0 }
  );
}

export default function Investments() {
  const [searchParams, setSearchParams] = useSearchParams();
  const monthParam = searchParams.get('month') || getMonthParam(new Date());
  const { start: monthStart, end: monthEnd } = getMonthBounds(monthParam);
  const navigateMonth = (delta: number) => setSearchParams({ month: shiftMonth(monthParam, delta) });
  const selectedMonthLabel = useMemo(() => {
    const [y, m] = monthParam.split('-').map(Number);
    const text = format(new Date(y, m - 1, 1), 'MMMM yyyy', { locale: ptBR });
    return text.charAt(0).toUpperCase() + text.slice(1);
  }, [monthParam]);

  const [selectedInvId, setSelectedInvId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingInv, setEditingInv] = useState<Investment | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [entryFormOpen, setEntryFormOpen] = useState(false);
  const [entryHistoryOpen, setEntryHistoryOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<Investment['investment_type'] | ''>('');
  const [filterCurrency, setFilterCurrency] = useState('');
  const [filterStatus, setFilterStatus] = useState('active');

  const queryClient = useQueryClient();

  const { data: investments = [], isLoading: invsLoading, isError: invsError } = useQuery({
    queryKey: ['investments'],
    queryFn: fetchInvestments,
  });

  const { data: currentInv, isLoading: invLoading } = useQuery({
    queryKey: ['investment', selectedInvId],
    queryFn: () => fetchInvestment(selectedInvId!),
    enabled: !!selectedInvId,
  });

  const { data: allEntries = [] } = useQuery({
    queryKey: ['investment-entries'],
    queryFn: fetchInvestmentEntries,
    enabled: !selectedInvId,
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

  const typeLabels: Record<Investment['investment_type'], string> = {
    stocks: 'Acoes',
    fii: 'FII',
    fixed_income: 'Renda Fixa',
    crypto: 'Cripto',
    savings: 'Poupanca',
    emergency: 'Reserva',
    other: 'Outros',
  };

  const investmentList = Array.isArray(investments) ? investments : [];

  const filtered = useMemo(() => {
    return investmentList.filter((inv) => {
      const name = inv.name || '';
      const broker = inv.broker || '';
      if (filterStatus === 'active' && !inv.is_active) return false;
      if (filterStatus === 'inactive' && inv.is_active) return false;
      if (filterType && inv.investment_type !== filterType) return false;
      if (filterCurrency && inv.currency !== filterCurrency) return false;
      if (search && !name.toLowerCase().includes(search.toLowerCase()) && !broker.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [investmentList, filterStatus, filterType, filterCurrency, search]);

  const totalInvested = getCurrencyTotals(filtered, (i) => parseFloat(i.total_invested || '0'));
  const totalWithdrawn = getCurrencyTotals(filtered, (i) => parseFloat(i.total_withdrawn || '0'));
  const totalEarnings = getCurrencyTotals(filtered, (i) => parseFloat(i.total_earnings || '0'));
  const totalNet = getCurrencyTotals(filtered, (i) => (
    parseFloat(i.total_invested || '0') -
    parseFloat(i.total_withdrawn || '0') +
    parseFloat(i.total_earnings || '0')
  ));

  const currencyByInvestment = useMemo(
    () => new Map(filtered.map((inv) => [inv.id, getCurrency(inv.currency)])),
    [filtered]
  );

  const monthEntries = useMemo(
    () => allEntries.filter((entry) => (
      currencyByInvestment.has(entry.investment) &&
      entry.date >= monthStart &&
      entry.date <= monthEnd
    )),
    [allEntries, currencyByInvestment, monthStart, monthEnd]
  );

  const monthlyDeposited: Record<Currency, number> = { BRL: 0, USD: 0, EUR: 0 };
  const monthlyWithdrawn: Record<Currency, number> = { BRL: 0, USD: 0, EUR: 0 };
  for (const entry of monthEntries) {
    const currency = currencyByInvestment.get(entry.investment) || 'BRL';
    if (entry.entry_type === 'deposit') monthlyDeposited[currency] += parseAmount(entry.amount);
    if (entry.entry_type === 'withdrawal') monthlyWithdrawn[currency] += parseAmount(entry.amount);
  }

  const hasForeignCurrency = filtered.some((investment) => getCurrency(investment.currency) !== 'BRL');
  const {
    data: exchangeRates,
    isLoading: exchangeRatesLoading,
    isError: exchangeRatesError,
  } = useQuery({
    queryKey: ['investment-exchange-rates'],
    queryFn: fetchInvestmentExchangeRates,
    enabled: hasForeignCurrency,
    staleTime: 5 * 60 * 1000,
  });

  const canConvertTotals = !hasForeignCurrency || !!exchangeRates;
  const convertTotalsToBrl = (totals: Record<Currency, number>) => currencyOrder.reduce((sum, currency) => {
    const rate = currency === 'BRL' ? 1 : parseAmount(exchangeRates?.rates[currency] || 0);
    return sum + totals[currency] * rate;
  }, 0);
  const consolidatedWithdrawnBrl = convertTotalsToBrl(totalWithdrawn);
  const consolidatedEarningsBrl = convertTotalsToBrl(totalEarnings);
  const consolidatedNetBrl = convertTotalsToBrl(totalNet);
  const consolidatedMonthlyWithdrawnBrl = convertTotalsToBrl(monthlyWithdrawn);

  const renderCurrencyTotals = (totals: Record<Currency, number>, color: string) => {
    const visibleCurrencies = currencyOrder.filter((currency) => totals[currency] !== 0);
    const currencies: Currency[] = visibleCurrencies.length > 0 ? visibleCurrencies : ['BRL'];
    return (
      <div style={{ display: 'grid', gap: 2 }}>
        {currencies.map((currency) => (
          <div key={currency} style={{ fontSize: '1.3rem', fontWeight: 800, color }}>
            {formatCurrency(totals[currency], currency)}
          </div>
        ))}
      </div>
    );
  };

  const renderForeignInvestedTotal = (currency: Currency) => (
    <div style={{ display: 'grid', gap: 2 }}>
      <div style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>
        {formatCurrency(totalInvested[currency], currency)}
      </div>
    </div>
  );

  const renderConvertedBrlTotal = (value: number, color: string) => {
    if (!canConvertTotals) {
      return (
        <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text-secondary)' }}>
          {exchangeRatesLoading ? 'Carregando cotacao...' : exchangeRatesError ? 'Cotacao indisponivel' : 'Aguardando cotacao'}
        </div>
      );
    }

    return (
      <div style={{ display: 'grid', gap: 2 }}>
        <div style={{ fontSize: '1.3rem', fontWeight: 800, color }}>
          {formatCurrency(value, 'BRL')}
        </div>
        {hasForeignCurrency && exchangeRates && (
          <div style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--color-text-muted)' }}>
            USD {Number(exchangeRates.rates.USD).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} - EUR {Number(exchangeRates.rates.EUR).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}
          </div>
        )}
      </div>
    );
  };

  const renderConsolidatedNet = () => renderConvertedBrlTotal(consolidatedNetBrl, 'var(--color-accent)');

  if (selectedInvId) {
    // Detail View
    if (invLoading) return <div className="page-header"><span className="spinner"/></div>;
    const currentCurrency = getCurrency(currentInv?.currency);
    const currentTotalInvested = parseFloat(currentInv?.total_invested || '0');
    const currentTotalWithdrawn = parseFloat(currentInv?.total_withdrawn || '0');
    const currentTotalEarnings = parseFloat(currentInv?.total_earnings || '0');
    const currentLiquidBalance = currentTotalInvested - currentTotalWithdrawn + currentTotalEarnings;
    
    return (
      <div className="animate-slide-in investments-page">
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
                <span className="badge" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>
                  {currentCurrency}
                </span>
              </h2>
              <div className="investment-detail-meta" style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)' }}>
                {[currentInv?.broker, currentInv ? typeLabels[currentInv.investment_type] : null].filter(Boolean).join(' - ')}
              </div>
            </div>
          </div>
        </div>

        <div className="kpi-grid" style={{ marginBottom: 'var(--space-lg)' }}>
          <div className="kpi-card">
            <div className="kpi-label">Aportes (Total)</div>
            <div className="kpi-value">{formatCurrency(currentInv?.total_invested || 0, currentCurrency)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Resgates (Total)</div>
            <div className="kpi-value negative">{formatCurrency(currentInv?.total_withdrawn || 0, currentCurrency)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Rendimentos / Div.</div>
            <div className="kpi-value positive">{formatCurrency(currentInv?.total_earnings || 0, currentCurrency)}</div>
          </div>
          <div className="kpi-card">
            <div className="kpi-label">Saldo Líquido</div>
            <div className="kpi-value accent">{formatCurrency(currentLiquidBalance, currentCurrency)}</div>
          </div>
        </div>

        <div className="card investment-entry-card">
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-md)' }}>Novo Lançamento</h3>
          <button
            type="button"
            onClick={() => setEntryFormOpen((open) => !open)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-sm)',
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-primary)',
              padding: 0,
              marginBottom: 0,
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: '1rem', fontWeight: 600 }}>Novo lançamento</span>
            {entryFormOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          {entryFormOpen && (
          <form className="investment-entry-form" onSubmit={handleCreateEntry} style={{ display: 'flex', gap: 'var(--space-md)', flexWrap: 'wrap' }}>
            <select name="entry_type" className="select" style={{ width: 140 }} required>
              <option value="deposit">Aporte</option>
              <option value="withdrawal">Resgate</option>
              <option value="dividend">Dividendo</option>
              <option value="yield">Rendimento</option>
            </select>
            <input type="date" name="date" className="input" defaultValue={new Date().toISOString().split('T')[0]} style={{ width: 140 }} required />
            <input type="number" step="0.01" min="0.01" name="amount" className="input" placeholder={`Valor (${currentCurrency})`} style={{ width: 140 }} required />
            <input type="text" name="description" className="input" placeholder="Descrição (opcional)" style={{ flex: 1, minWidth: 200 }} />
            <button type="submit" className="btn btn-primary" disabled={createEntryMutation.isPending}>
              Adicionar
            </button>
          </form>
          )}

        </div>

        <div className="card investment-history-card">
          <button
            type="button"
            onClick={() => setEntryHistoryOpen((open) => !open)}
            style={{
              width: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 'var(--space-sm)',
              background: 'transparent',
              border: 'none',
              color: 'var(--color-text-primary)',
              padding: 0,
              cursor: 'pointer',
            }}
          >
            <span style={{ fontSize: '1rem', fontWeight: 600 }}>Histórico de lançamentos</span>
            {entryHistoryOpen ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
          <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: 'var(--space-md)' }}>Histórico de Lançamentos</h3>
          {entryHistoryOpen && (
          <>
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
                        {entry.entry_type === 'withdrawal' ? '-' : '+'}{formatCurrency(entry.amount, currentCurrency)}
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
          </>
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

  const typeLabelsDuplicate: Record<string, string> = {
    stocks: 'Ações', fii: 'FII', fixed_income: 'Renda Fixa',
    crypto: 'Cripto', savings: 'Poupança', emergency: 'Reserva', other: 'Outros',
  };
  void typeLabelsDuplicate;

  return (
    <div className="animate-fade-in investments-page">
      <div className="page-header">
        <button className="btn btn-primary" onClick={handleOpenNew}>
          <Plus size={18} /> Novo Investimento
        </button>
      </div>

      {/* ── Aportes e Resgates do Mês ── */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-md)', flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-icon" onClick={() => navigateMonth(-1)} aria-label="Mês anterior">
          <ChevronLeft size={18} />
        </button>
        <span style={{ fontWeight: 700, fontSize: '1rem', textAlign: 'center' }}>{selectedMonthLabel}</span>
        <button className="btn btn-ghost btn-icon" onClick={() => navigateMonth(1)} aria-label="Mês seguinte">
          <ChevronRight size={18} />
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6 }}>Aportado no Mês</div>
          {renderCurrencyTotals(monthlyDeposited, 'var(--color-success)')}
        </div>
        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6 }}>Resgatado no Mês</div>
          {renderConvertedBrlTotal(consolidatedMonthlyWithdrawnBrl, 'var(--color-danger)')}
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6 }}>Total Aportado</div>
          {renderCurrencyTotals(totalInvested, 'var(--color-text-primary)')}
        </div>
        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6 }}>Investido USD</div>
          {renderForeignInvestedTotal('USD')}
        </div>
        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6 }}>Investido EUR</div>
          {renderForeignInvestedTotal('EUR')}
        </div>
        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6 }}>Resgates</div>
          {renderConvertedBrlTotal(consolidatedWithdrawnBrl, 'var(--color-danger)')}
        </div>
        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6 }}>Rendimentos</div>
          {renderConvertedBrlTotal(consolidatedEarningsBrl, 'var(--color-success)')}
        </div>
        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6 }}>Patrimônio Líquido</div>
          {renderConsolidatedNet()}
        </div>
      </div>

      {/* ── Filtros ── */}
      <div className="card" style={{ marginBottom: 'var(--space-md)', padding: 0, overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: 'var(--space-sm) var(--space-md)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
        >
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-accent)' }}>Filtros</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
              {[
                filterStatus === 'active' ? 'Ativos' : filterStatus === 'inactive' ? 'Inativos' : 'Todos',
                filterType ? typeLabels[filterType] : '',
                filterCurrency ? `${currencyLabels[filterCurrency as Currency]} (${filterCurrency})` : '',
                search ? `"${search}"` : '',
              ].filter(Boolean).join(' · ')}
            </div>
          </div>
          {filtersOpen ? <ChevronUp size={16} style={{ color: 'var(--color-text-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--color-text-muted)' }} />}
        </button>

        {filtersOpen && (
          <div style={{ borderTop: '1px solid var(--color-border)', padding: 'var(--space-md)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', color: 'var(--color-text-muted)', pointerEvents: 'none' }} />
                <input
                  type="text"
                  className="input"
                  placeholder="Buscar por nome ou corretora…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  style={{ paddingLeft: 32 }}
                />
              </div>
              <div>
                <select className="input" value={filterType} onChange={(e) => setFilterType(e.target.value as Investment['investment_type'] | '')}>
                  <option value="">Todos os tipos</option>
                  {Object.entries(typeLabels).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </div>
              <div>
                <select className="input" value={filterCurrency} onChange={(e) => setFilterCurrency(e.target.value)}>
                  <option value="">Todas as moedas</option>
                  {currencyOrder.map((currency) => (
                    <option key={currency} value={currency}>{currencyLabels[currency]} ({currency})</option>
                  ))}
                </select>
              </div>
              <div>
                <select className="input" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                  <option value="active">Somente ativos</option>
                  <option value="inactive">Somente inativos</option>
                  <option value="">Todos</option>
                </select>
              </div>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => { setSearch(''); setFilterType(''); setFilterCurrency(''); setFilterStatus('active'); }}
              >
                Limpar
              </button>
            </div>
          </div>
        )}
      </div>

      {invsError ? (
        <div className="empty-state">
          <TrendingUp className="empty-state-icon" />
          <h3 className="empty-state-title">Erro ao carregar investimentos</h3>
          <p className="empty-state-text">Recarregue a pagina ou verifique sua conexao.</p>
        </div>
      ) : invsLoading ? (
        <div className="investment-list-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-md)' }}>
          {[1, 2, 3].map(i => <div key={i} className="skeleton" style={{ height: 160 }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <TrendingUp className="empty-state-icon" />
          <h3 className="empty-state-title">Nenhum investimento encontrado</h3>
          <p className="empty-state-text">{investments?.length ? 'Tente ajustar os filtros.' : 'Comece a registrar seus investimentos e controle seus aportes.'}</p>
        </div>
      ) : (
        <div className="investment-list-grid" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 'var(--space-md)' }}>
          {filtered.map((inv) => {
            const invCurrency = getCurrency(inv.currency);
            const liquidBalance =
              parseFloat(inv.total_invested || '0') -
              parseFloat(inv.total_withdrawn || '0') +
              parseFloat(inv.total_earnings || '0');
            return (
            <div 
              key={inv.id} 
              className="card" 
              style={{ cursor: 'pointer', opacity: inv.is_active ? 1 : 0.6 }}
              onClick={() => setSelectedInvId(inv.id)}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 'var(--space-sm)' }}>
                <div>
                  <h3 className="investment-card-title" style={{ fontSize: '1.1rem', fontWeight: 600 }}>{inv.name}</h3>
                  <div className="investment-card-meta" style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>
                    {[inv.broker, typeLabels[inv.investment_type]].filter(Boolean).join(' - ')}
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <span className="badge" style={{ background: 'var(--color-bg-tertiary)', color: 'var(--color-text-secondary)' }}>
                    {invCurrency}
                  </span>
                  <PiggyBank style={{ color: 'var(--color-accent)', opacity: 0.5 }} />
                </div>
              </div>
              
              <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-xs)', marginTop: 'var(--space-md)' }}>
                <div className="investment-card-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Total Aportado</span>
                  <span>{formatCurrency(inv.total_invested, invCurrency)}</span>
                </div>
                <div className="investment-card-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Resgates</span>
                  <span style={{ color: 'var(--color-danger)' }}>{formatCurrency(inv.total_withdrawn, invCurrency)}</span>
                </div>
                <div className="investment-card-row" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Rendimentos</span>
                  <span style={{ color: 'var(--color-success)' }}>{formatCurrency(inv.total_earnings, invCurrency)}</span>
                </div>
                <div className="investment-card-total" style={{ display: 'flex', justifyContent: 'space-between', fontSize: '1rem', marginTop: 8, paddingTop: 8, borderTop: '1px solid var(--color-border)' }}>
                  <span style={{ color: 'var(--color-text-secondary)' }}>Saldo Líquido</span>
                  <span style={{ fontWeight: 600, color: 'var(--color-accent)' }}>{formatCurrency(liquidBalance, invCurrency)}</span>
                </div>
              </div>
            </div>
            );
          })}
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
