import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import {
  Activity,
  AlertCircle,
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  Info,
  Loader2,
  MinusCircle,
  Sparkles,
} from 'lucide-react';
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { useViewMode } from '../contexts/ViewModeContext';
import {
  fetchMonthDiagnosis,
  fetchOscillationsReport,
  type DiagnosisDriver,
  type ExpenseKind,
  type InsightTone,
  type MonthDiagnosis,
  type MonthFlag,
  type OscillationMonth,
  type ReportStatusFilter,
  type VerdictLevel,
} from '../api/reports';

// Mesmas cores de receita/despesa dos gráficos do Dashboard (ChartsModal).
const INCOME_COLOR = '#22c55e';
const EXPENSE_COLOR = '#fb7185';
const NET_COLOR = '#ffffff';

const MONTH_SHORT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTH_LONG = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

// Só os meses fora do padrão ganham etiqueta — "normal" e "empty" ficam sem,
// para os desvios saltarem aos olhos na lista.
const FLAG_META: Partial<Record<MonthFlag, { label: string; color: string; background: string }>> = {
  deficit: { label: 'No vermelho', color: 'var(--color-danger)', background: 'var(--color-danger-muted)' },
  heavy: { label: 'Pesado', color: 'var(--color-warning)', background: 'var(--color-warning-muted)' },
  surplus: { label: 'Sobra', color: 'var(--color-success)', background: 'var(--color-success-muted)' },
};

const VERDICT_META: Record<VerdictLevel, { color: string; background: string; Icon: typeof Activity }> = {
  critical: { color: 'var(--color-danger)', background: 'var(--color-danger-muted)', Icon: AlertTriangle },
  attention: { color: 'var(--color-warning)', background: 'var(--color-warning-muted)', Icon: AlertTriangle },
  good: { color: 'var(--color-info)', background: 'var(--color-info-muted)', Icon: CheckCircle2 },
  excellent: { color: 'var(--color-success)', background: 'var(--color-success-muted)', Icon: Sparkles },
  empty: { color: 'var(--color-text-muted)', background: 'var(--color-bg-elevated)', Icon: MinusCircle },
};

const TONE_META: Record<InsightTone, { color: string; Icon: typeof Activity }> = {
  negative: { color: 'var(--color-danger)', Icon: AlertCircle },
  positive: { color: 'var(--color-success)', Icon: CheckCircle2 },
  neutral: { color: 'var(--color-info)', Icon: Info },
};

const KIND_LABEL: Record<ExpenseKind, string> = {
  recurring: 'Recorrente',
  installment: 'Parcela',
  one_off: 'Pontual',
};

const KIND_COLOR: Record<ExpenseKind, string> = {
  recurring: '#60a5fa',
  installment: '#fbbf24',
  one_off: '#a78bfa',
};

const tooltipStyle = { background: '#111', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: '0.8rem' };
const tooltipLabelStyle = { color: '#fff', fontWeight: 700, marginBottom: 2 };
const tooltipItemStyle = { color: 'rgba(255,255,255,0.7)' };

function formatCurrency(value: string | number | null | undefined): string {
  if (value == null) return 'R$ 0,00';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(num) ? 'R$ 0,00' : num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function formatCompact(value: number): string {
  return value.toLocaleString('pt-BR', { notation: 'compact', maximumFractionDigits: 1 });
}

function formatPercent(ratio: number | null | undefined): string {
  if (ratio == null) return '—';
  return `${Math.round(Math.abs(ratio) * 100)}%`;
}

function currentMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function shortMonth(month: string): string {
  const [y, m] = month.split('-');
  return `${MONTH_SHORT[Number(m) - 1]}/${y.slice(2)}`;
}

function longMonth(month: string): string {
  const [y, m] = month.split('-');
  return `${MONTH_LONG[Number(m) - 1]} de ${y}`;
}

function formatDay(iso: string): string {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
}

export default function Diagnosis() {
  const { isMobile } = useViewMode();
  const [endMonth, setEndMonth] = useState(currentMonth());
  const [months, setMonths] = useState(12);
  const [status, setStatus] = useState<ReportStatusFilter>('all');
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);

  const { data, isFetching, isError } = useQuery({
    queryKey: ['reports', 'oscillations', endMonth, months, status],
    queryFn: () => fetchOscillationsReport({ end_month: endMonth, months, status }),
    enabled: Boolean(endMonth),
  });

  const series = (data?.months ?? []).map((m) => ({
    ...m,
    label: shortMonth(m.month),
    incomeValue: parseFloat(m.income),
    expenseValue: parseFloat(m.expense),
    netValue: parseFloat(m.net),
  }));
  const activeMonths = series.filter((m) => m.flag !== 'empty');
  const heaviest = activeMonths.reduce<(typeof series)[number] | null>(
    (best, m) => (!best || m.expenseValue > best.expenseValue ? m : best), null,
  );
  const bestSurplus = activeMonths.reduce<(typeof series)[number] | null>(
    (best, m) => (!best || m.netValue > best.netValue ? m : best), null,
  );

  const handleChartClick = (state: { activeTooltipIndex?: number | string | null } | null) => {
    const index = state?.activeTooltipIndex;
    if (index == null) return;
    const row = series[Number(index)];
    if (row && row.flag !== 'empty') setSelectedMonth(row.month);
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-md)' }}>
          <div>
            <label className="label" htmlFor="diagnosis-end-month">Até o mês</label>
            <input
              id="diagnosis-end-month"
              type="month"
              className="input"
              value={endMonth}
              onChange={(e) => setEndMonth(e.target.value)}
            />
          </div>
          <div>
            <label className="label" htmlFor="diagnosis-period">Período</label>
            <select id="diagnosis-period" className="input" value={months} onChange={(e) => setMonths(Number(e.target.value))}>
              <option value={6}>Últimos 6 meses</option>
              <option value={12}>Últimos 12 meses</option>
              <option value={24}>Últimos 24 meses</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="diagnosis-status">Considerar</label>
            <select
              id="diagnosis-status"
              className="input"
              value={status}
              onChange={(e) => setStatus(e.target.value as ReportStatusFilter)}
            >
              <option value="all">Baixadas e previstas</option>
              <option value="cleared">Só baixadas</option>
              <option value="pending">Só previstas</option>
            </select>
          </div>
        </div>
      </div>

      {isError && (
        <div className="card" style={{ color: 'var(--color-danger)' }}>
          Não foi possível carregar as oscilações. Confira os filtros e tente novamente.
        </div>
      )}

      {data?.masked && (
        <div className="card" style={{ color: 'var(--color-text-muted)' }}>
          Valores ocultos: você está visualizando este cliente sem vínculo de membro.
        </div>
      )}

      {isFetching && !data && (
        <div className="card" style={{ textAlign: 'center', color: 'var(--color-text-muted)' }}>
          <Loader2 size={20} style={{ animation: 'spin 1s linear infinite' }} />
        </div>
      )}

      {data && !data.masked && (
        <>
          <div className="kpi-grid">
            <HighlightCard
              label="Mês mais pesado"
              month={heaviest?.month}
              value={heaviest ? `${formatCurrency(heaviest.expenseValue)} em despesas` : '—'}
              tone="negative"
              onOpen={setSelectedMonth}
            />
            <HighlightCard
              label="Maior sobra"
              month={bestSurplus && bestSurplus.netValue > 0 ? bestSurplus.month : undefined}
              value={bestSurplus && bestSurplus.netValue > 0 ? formatCurrency(bestSurplus.netValue) : '—'}
              tone="positive"
              onOpen={setSelectedMonth}
            />
            <div className="kpi-card">
              <div className="kpi-label">Despesa média mensal</div>
              <div className="kpi-value negative">{formatCurrency(data.average_expense)}</div>
            </div>
            <div className="kpi-card">
              <div className="kpi-label">Sobra média mensal</div>
              <div className={`kpi-value ${parseFloat(data.average_net ?? '0') >= 0 ? 'positive' : 'negative'}`}>
                {formatCurrency(data.average_net)}
              </div>
            </div>
          </div>

          <div className="card">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', marginBottom: 'var(--space-md)' }}>
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                Oscilação mensal
              </h3>
              <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                {isMobile ? 'Toque' : 'Clique'} em um mês para ver o diagnóstico
              </span>
            </div>
            {activeMonths.length ? (
              <ResponsiveContainer width="100%" height={isMobile ? 240 : 300}>
                <ComposedChart data={series} onClick={handleChartClick} style={{ cursor: 'pointer' }} barGap={2}>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.07)" />
                  <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    width={44}
                    tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }}
                    tickFormatter={formatCompact}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(255,255,255,0.06)' }}
                    formatter={(val: any) => formatCurrency(val)}
                    contentStyle={tooltipStyle}
                    labelStyle={tooltipLabelStyle}
                    itemStyle={tooltipItemStyle}
                  />
                  <Legend wrapperStyle={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)' }} />
                  <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />
                  <Bar dataKey="incomeValue" name="Receitas" fill={INCOME_COLOR} radius={[4, 4, 0, 0]} maxBarSize={18} />
                  <Bar dataKey="expenseValue" name="Despesas" fill={EXPENSE_COLOR} radius={[4, 4, 0, 0]} maxBarSize={18} />
                  <Line
                    dataKey="netValue"
                    name="Saldo do mês"
                    stroke={NET_COLOR}
                    strokeWidth={2}
                    dot={{ r: 4, fill: NET_COLOR, stroke: 'var(--color-bg-card)', strokeWidth: 2 }}
                    activeDot={{ r: 6 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            ) : (
              <div className="empty-state" style={{ padding: 'var(--space-lg)' }}>
                <p className="empty-state-text">Nenhuma receita ou despesa no período.</p>
              </div>
            )}
          </div>

          {activeMonths.length > 0 && (
            <div className="card">
              <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
                Mês a mês
              </h3>
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {[...series].reverse().map((m) => (
                  <MonthRow key={m.month} month={m} onOpen={setSelectedMonth} isMobile={isMobile} />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {selectedMonth && (
        <DiagnosisModal month={selectedMonth} status={status} onClose={() => setSelectedMonth(null)} />
      )}
    </div>
  );
}

function HighlightCard({
  label,
  month,
  value,
  tone,
  onOpen,
}: {
  label: string;
  month: string | undefined;
  value: string;
  tone: 'positive' | 'negative';
  onOpen: (month: string) => void;
}) {
  return (
    <button
      type="button"
      className="kpi-card"
      disabled={!month}
      onClick={() => month && onOpen(month)}
      style={{ textAlign: 'left', cursor: month ? 'pointer' : 'default', font: 'inherit', color: 'inherit' }}
    >
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${tone}`}>{month ? longMonth(month) : '—'}</div>
      <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: 4 }}>{value}</div>
    </button>
  );
}

function MonthRow({
  month,
  onOpen,
  isMobile,
}: {
  month: OscillationMonth & { netValue: number };
  onOpen: (month: string) => void;
  isMobile: boolean;
}) {
  const flag = FLAG_META[month.flag];
  const empty = month.flag === 'empty';
  return (
    <button
      type="button"
      onClick={() => !empty && onOpen(month.month)}
      disabled={empty}
      aria-label={`Diagnóstico de ${longMonth(month.month)}`}
      style={{
        display: 'grid',
        gridTemplateColumns: isMobile ? '1fr auto' : '160px 1fr 1fr 1fr 110px',
        alignItems: 'center',
        gap: 8,
        padding: '10px 6px',
        background: 'none',
        border: 'none',
        borderBottom: '1px solid var(--color-border)',
        color: 'inherit',
        font: 'inherit',
        fontSize: '0.85rem',
        textAlign: 'left',
        cursor: empty ? 'default' : 'pointer',
        opacity: empty ? 0.5 : 1,
      }}
    >
      <span style={{ fontWeight: 600 }}>{longMonth(month.month)}</span>
      {!isMobile && <span style={{ color: 'var(--color-success)' }}>{formatCurrency(month.income)}</span>}
      {!isMobile && <span style={{ color: 'var(--color-danger)' }}>− {formatCurrency(month.expense)}</span>}
      {!isMobile && (
        <span style={{ fontWeight: 700, color: month.netValue < 0 ? 'var(--color-danger)' : 'var(--color-text-primary)' }}>
          {formatCurrency(month.net)}
        </span>
      )}
      <span style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
        {isMobile && (
          <span style={{ fontWeight: 700, color: month.netValue < 0 ? 'var(--color-danger)' : 'var(--color-text-primary)' }}>
            {formatCurrency(month.net)}
          </span>
        )}
        {flag && <Chip color={flag.color} background={flag.background}>{flag.label}</Chip>}
      </span>
    </button>
  );
}

// Não usa .badge: o tema monocromático (index.css) força todo .badge a cinza
// com !important, e aqui a cor é justamente o que destaca o mês.
function Chip({ color, background, children }: { color: string; background: string; children: React.ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '2px 9px',
        borderRadius: 999,
        fontSize: '0.72rem',
        fontWeight: 600,
        whiteSpace: 'nowrap',
        color,
        background,
      }}
    >
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: color }} />
      {children}
    </span>
  );
}

function DiagnosisModal({ month, status, onClose }: { month: string; status: ReportStatusFilter; onClose: () => void }) {
  const { data, isFetching, isError } = useQuery({
    queryKey: ['reports', 'month-diagnosis', month, status],
    queryFn: () => fetchMonthDiagnosis({ month, status }),
  });

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-label={`Diagnóstico de ${longMonth(month)}`}
        style={{ maxWidth: 760 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <Activity size={18} />
            Diagnóstico — {longMonth(month)}
          </h3>
          <button className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fechar">
            ✕
          </button>
        </div>

        {isFetching && !data && (
          <div style={{ padding: 'var(--space-lg)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
            <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
            <div>Analisando o mês...</div>
          </div>
        )}
        {isError && (
          <div style={{ color: 'var(--color-danger)', fontSize: '0.85rem' }}>Não foi possível gerar o diagnóstico.</div>
        )}
        {data?.masked && (
          <div style={{ color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>Valores ocultos para este cliente.</div>
        )}
        {data && !data.masked && <DiagnosisBody diagnosis={data} />}
      </div>
    </div>,
    document.body,
  );
}

function DiagnosisBody({ diagnosis }: { diagnosis: MonthDiagnosis }) {
  const { isMobile } = useViewMode();
  const verdict = VERDICT_META[diagnosis.verdict.level];
  const hasBaseline = diagnosis.baseline.months > 0;
  const expenseTotal = parseFloat(diagnosis.expense) || 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <div
        data-testid="diagnosis-verdict"
        style={{
          display: 'flex',
          gap: 12,
          alignItems: 'flex-start',
          padding: '14px 16px',
          borderRadius: 'var(--radius-md)',
          background: verdict.background,
          borderLeft: `3px solid ${verdict.color}`,
        }}
      >
        <verdict.Icon size={20} style={{ color: verdict.color, flexShrink: 0, marginTop: 2 }} />
        <div>
          <div style={{ fontWeight: 700, color: verdict.color }}>{diagnosis.verdict.title}</div>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>{diagnosis.verdict.summary}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(3, minmax(0, 1fr))', gap: 'var(--space-sm)' }}>
        <ComparisonTile label="Receitas" value={diagnosis.income} average={diagnosis.baseline.income} hasBaseline={hasBaseline} higherIsGood />
        <ComparisonTile label="Despesas" value={diagnosis.expense} average={diagnosis.baseline.expense} hasBaseline={hasBaseline} higherIsGood={false} />
        <ComparisonTile label="Saldo do mês" value={diagnosis.net} average={diagnosis.baseline.net} hasBaseline={hasBaseline} higherIsGood />
      </div>
      {hasBaseline && (
        <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: -8 }}>
          {diagnosis.baseline.months > 1
            ? `Comparado com a média dos ${diagnosis.baseline.months} meses anteriores com movimentação.`
            : 'Comparado com o mês anterior com movimentação.'}
          {diagnosis.savings_rate != null && diagnosis.savings_rate > 0 && ` Você guardou ${formatPercent(diagnosis.savings_rate)} da receita.`}
        </p>
      )}

      {diagnosis.insights.length > 0 && (
        <Section title="Por que o mês ficou assim">
          <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {diagnosis.insights.map((insight, i) => {
              const tone = TONE_META[insight.tone];
              return (
                <li key={i} style={{ display: 'flex', gap: 10, fontSize: '0.85rem', lineHeight: 1.45 }}>
                  <tone.Icon size={16} style={{ color: tone.color, flexShrink: 0, marginTop: 2 }} aria-hidden />
                  <span>{insight.text}</span>
                </li>
              );
            })}
          </ul>
        </Section>
      )}

      {(diagnosis.expense_increases.length > 0 || diagnosis.expense_decreases.length > 0) && (
        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(2, minmax(0, 1fr))', gap: 'var(--space-md)' }}>
          <DriverList
            title="O que pesou"
            emptyLabel="Nenhuma categoria acima do normal."
            drivers={diagnosis.expense_increases}
            direction="up"
          />
          <DriverList
            title="O que aliviou"
            emptyLabel="Nenhuma categoria abaixo do normal."
            drivers={diagnosis.expense_decreases}
            direction="down"
          />
        </div>
      )}

      {diagnosis.income_changes.length > 0 && (
        <DriverList title="Variações nas receitas" emptyLabel="" drivers={diagnosis.income_changes} direction="mixed" />
      )}

      {expenseTotal > 0 && (
        <Section title="Composição das despesas">
          <div
            role="img"
            aria-label={diagnosis.composition.map((c) => `${c.label}: ${formatPercent(c.share)}`).join(', ')}
            style={{ display: 'flex', height: 10, borderRadius: 999, overflow: 'hidden', gap: 2, background: 'var(--color-bg-elevated)' }}
          >
            {diagnosis.composition
              .filter((c) => parseFloat(c.value) > 0)
              .map((c) => (
                <div key={c.kind} style={{ width: `${(c.share ?? 0) * 100}%`, background: KIND_COLOR[c.kind] }} />
              ))}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'minmax(0, 1fr)' : 'repeat(3, minmax(0, 1fr))', gap: 8, marginTop: 10 }}>
            {diagnosis.composition.map((c) => (
              <div key={c.kind} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: '0.8rem' }}>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: KIND_COLOR[c.kind], flexShrink: 0 }} />
                <span style={{ color: 'var(--color-text-secondary)' }}>{c.label}</span>
                <span style={{ fontWeight: 600, marginLeft: 'auto' }}>
                  {formatCurrency(c.value)} <span style={{ color: 'var(--color-text-muted)', fontWeight: 400 }}>({formatPercent(c.share)})</span>
                </span>
              </div>
            ))}
          </div>
          {(parseFloat(diagnosis.card_expense) > 0 || parseFloat(diagnosis.pending_expense) > 0) && (
            <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginTop: 10, fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
              {parseFloat(diagnosis.card_expense) > 0 && <span>No cartão: {formatCurrency(diagnosis.card_expense)}</span>}
              {parseFloat(diagnosis.pending_expense) > 0 && <span>A pagar: {formatCurrency(diagnosis.pending_expense)}</span>}
            </div>
          )}
        </Section>
      )}

      {diagnosis.top_expenses.length > 0 && (
        <Section title="Maiores despesas do mês">
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            {diagnosis.top_expenses.map((t) => (
              <div
                key={t.id}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.82rem' }}
              >
                <span style={{ color: 'var(--color-text-muted)', width: 40, flexShrink: 0 }}>{formatDay(t.date)}</span>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    title={t.description}
                    style={isMobile
                      ? { fontWeight: 600, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere' }
                      : { fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                  >
                    {t.description}
                  </div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>
                    {[t.category || 'Sem categoria', KIND_LABEL[t.kind], t.is_cleared ? null : 'a pagar'].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontWeight: 700, color: 'var(--color-danger)', whiteSpace: 'nowrap' }}>− {formatCurrency(t.value)}</div>
                  <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)' }}>{formatPercent(t.share)} do mês</div>
                </div>
              </div>
            ))}
          </div>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4 style={{ fontSize: '0.75rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--color-text-muted)', marginBottom: 10 }}>
        {title}
      </h4>
      {children}
    </div>
  );
}

function ComparisonTile({
  label,
  value,
  average,
  hasBaseline,
  higherIsGood,
}: {
  label: string;
  value: string;
  average: string;
  hasBaseline: boolean;
  higherIsGood: boolean;
}) {
  const current = parseFloat(value) || 0;
  const avg = parseFloat(average) || 0;
  const delta = current - avg;
  const good = higherIsGood ? delta >= 0 : delta <= 0;
  const Arrow = delta >= 0 ? ArrowUpRight : ArrowDownRight;

  return (
    <div style={{ padding: '10px 12px', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)' }}>
      <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: '1rem', fontWeight: 700 }}>{formatCurrency(current)}</div>
      {hasBaseline && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: '0.72rem', marginTop: 4, color: 'var(--color-text-muted)' }}>
          {Math.abs(delta) >= 0.01 && (
            <span style={{ display: 'inline-flex', alignItems: 'center', color: good ? 'var(--color-success)' : 'var(--color-danger)' }}>
              <Arrow size={12} aria-hidden />
              {formatCurrency(Math.abs(delta))}
            </span>
          )}
          <span>média {formatCurrency(avg)}</span>
        </div>
      )}
    </div>
  );
}

function DriverList({
  title,
  emptyLabel,
  drivers,
  direction,
}: {
  title: string;
  emptyLabel: string;
  drivers: DiagnosisDriver[];
  direction: 'up' | 'down' | 'mixed';
}) {
  const { isMobile } = useViewMode();
  const maxDelta = Math.max(...drivers.map((d) => Math.abs(parseFloat(d.delta) || 0)), 1);

  return (
    <Section title={title}>
      {drivers.length === 0 ? (
        <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>{emptyLabel}</p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {drivers.map((d) => {
            const delta = parseFloat(d.delta) || 0;
            // Despesa subindo é ruim; receita subindo é bom.
            const bad = direction === 'mixed' ? delta < 0 : direction === 'up';
            const color = bad ? 'var(--color-danger)' : 'var(--color-success)';
            return (
              <div key={`${d.category_id}-${d.name}`} style={{ fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                    <span
                      title={d.name}
                      style={isMobile
                        ? { fontWeight: 600, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflowWrap: 'anywhere', minWidth: 0 }
                        : { fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}
                    >
                      {d.name}
                    </span>
                    {d.is_new && (
                      <span style={{ flexShrink: 0 }}>
                        <Chip color="var(--color-info)" background="var(--color-info-muted)">novo</Chip>
                      </span>
                    )}
                  </span>
                  <span style={{ fontWeight: 700, color, whiteSpace: 'nowrap', flexShrink: 0 }}>
                    {delta >= 0 ? '+' : '−'} {formatCurrency(Math.abs(delta))}
                  </span>
                </div>
                <div style={{ height: 6, borderRadius: 999, background: 'var(--color-bg-elevated)', overflow: 'hidden' }}>
                  <div style={{ width: `${(Math.abs(delta) / maxDelta) * 100}%`, height: '100%', background: color, borderRadius: 999 }} />
                </div>
                <div style={{ fontSize: '0.72rem', color: 'var(--color-text-muted)', marginTop: 3 }}>
                  {formatCurrency(d.current)} no mês · média {formatCurrency(d.average)}
                  {d.delta_ratio != null && ` (${delta >= 0 ? '+' : '−'}${formatPercent(d.delta_ratio)})`}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Section>
  );
}
