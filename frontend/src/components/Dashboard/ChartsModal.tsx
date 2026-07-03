import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  AreaChart, Area, CartesianGrid, ReferenceLine,
} from 'recharts';
import { fetchDashboard } from '../../api/dashboard';

const CHART_COLORS = ['#7abf00', '#60a5fa', '#fbbf24', '#fb7185', '#34d399', '#a78bfa', '#f472b6'];

function formatCurrency(value: string | number | null): string {
  if (value == null) return '••••••';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function getMonthParam(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function shiftMonth(current: string, delta: number): string {
  const [y, m] = current.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return getMonthParam(d);
}

type Tab = 'heatmap' | 'tendencia' | 'ranking';

const WEEKDAY_LABELS = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'];

function heatColor(value: number, mode: 'expense' | 'income' | 'unified', maxAbs: number): string {
  if (value === 0) return 'var(--color-bg-elevated)';
  const intensity = 0.15 + Math.min(1, Math.abs(value) / maxAbs) * 0.75;
  if (mode === 'expense') return `rgba(251, 113, 133, ${intensity})`;
  if (mode === 'income') return `rgba(34, 197, 94, ${intensity})`;
  return value >= 0 ? `rgba(34, 197, 94, ${intensity})` : `rgba(251, 113, 133, ${intensity})`;
}

interface ChartsModalProps {
  initialMonth: string;
  onClose: () => void;
}

export default function ChartsModal({ initialMonth, onClose }: ChartsModalProps) {
  const [tab, setTab] = useState<Tab>('tendencia');
  const [month, setMonth] = useState(initialMonth);
  const [mode, setMode] = useState<'expense' | 'income' | 'unified'>('unified');

  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-charts', month],
    queryFn: () => fetchDashboard(month),
  });

  const masked = data?.masked ?? false;

  const expenseCategories = masked ? [] : (data?.expense_by_category ?? []).map((c, i) => ({
    name: c.name,
    value: parseFloat(c.total ?? '0'),
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const incomeCategories = masked ? [] : (data?.income_by_category ?? []).map((c, i) => ({
    name: c.name,
    value: parseFloat(c.total ?? '0'),
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  const expenseTrend = masked ? [] : (data?.expense_trend ?? []).map((p) => ({
    label: p.label,
    total: parseFloat(p.total ?? '0'),
    isCurrent: p.is_current,
  }));

  const incomeTrend = masked ? [] : (data?.income_trend ?? []).map((p) => ({
    label: p.label,
    total: parseFloat(p.total ?? '0'),
    isCurrent: p.is_current,
  }));

  const unifiedCategories = [
    { name: 'Receitas', value: incomeCategories.reduce((s, c) => s + c.value, 0), fill: '#22c55e' },
    { name: 'Despesas', value: expenseCategories.reduce((s, c) => s + c.value, 0), fill: '#fb7185' },
  ].filter(c => c.value > 0);

  const unifiedTrend = expenseTrend.map((e, i) => {
    const inc = incomeTrend[i] || { label: e.label, total: 0, isCurrent: e.isCurrent };
    return {
      label: e.label,
      expense: e.total,
      expenseNeg: -e.total,
      income: inc.total,
      total: inc.total - e.total, // Balance
      isCurrent: e.isCurrent
    };
  });

  const activeCategories = mode === 'expense' ? expenseCategories : mode === 'income' ? incomeCategories : unifiedCategories;
  const activeTrend = mode === 'expense' ? expenseTrend : mode === 'income' ? incomeTrend : unifiedTrend;

  const [selYearStr, selMonthStr] = (data?.selected_month ?? `${month}-01`).split('-');
  const selYear = Number(selYearStr);
  const selMonthIndex = Number(selMonthStr) - 1;
  const daysInMonth = new Date(selYear, selMonthIndex + 1, 0).getDate();
  const firstWeekday = new Date(selYear, selMonthIndex, 1).getDay();

  const dailyExpenseMap = new Map((masked ? [] : data?.daily_expense ?? []).map((d) => [d.date, parseFloat(d.total ?? '0')]));
  const dailyIncomeMap = new Map((masked ? [] : data?.daily_income ?? []).map((d) => [d.date, parseFloat(d.total ?? '0')]));

  const heatmapDays = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const iso = `${selYear}-${String(selMonthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
    const exp = dailyExpenseMap.get(iso) ?? 0;
    const inc = dailyIncomeMap.get(iso) ?? 0;
    const value = mode === 'expense' ? exp : mode === 'income' ? inc : inc - exp;
    return { day, iso, value };
  });
  const heatmapMaxAbs = Math.max(1, ...heatmapDays.map((d) => Math.abs(d.value)));
  const hasHeatmapData = heatmapDays.some((d) => d.value !== 0);

  const ranking = [...activeCategories].sort((a, b) => b.value - a.value);
  const rankingTotal = ranking.reduce((s, c) => s + c.value, 0);

  const currentMonth = activeTrend.find((p) => p.isCurrent);
  const trendAvg = activeTrend.length ? activeTrend.reduce((s, p) => s + p.total, 0) / activeTrend.length : 0;
  const trendPeak = activeTrend.length ? activeTrend.reduce((max, p) => p.total > max.total ? p : max, activeTrend[0]) : null;
  const hasData = activeTrend.some((p) => p.total !== 0 || (p as any).income > 0 || (p as any).expense > 0);
  const tooltipStyle = { background: '#111', border: '1px solid rgba(255,255,255,0.12)', borderRadius: 8, fontSize: '0.8rem' };
  const tooltipLabelStyle = { color: '#fff', fontWeight: 700, marginBottom: 2 };
  const tooltipItemStyle = { color: 'rgba(255,255,255,0.7)' };

  const trendValues = activeTrend.map((p) => p.total);
  const trendYMax = Math.max(0, ...trendValues);
  const trendYMin = Math.min(0, ...trendValues);
  const trendGradientOffset = trendYMax === trendYMin ? 0.5 : trendYMax / (trendYMax - trendYMin);

  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        style={{ maxWidth: 680, width: '95vw', maxHeight: '90vh', overflowY: 'auto', overflowX: 'hidden' }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Gráficos</h2>
            <p style={{ fontSize: '0.7rem', color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.08em', marginTop: 2 }}>
              Leitura visual por período
            </p>
          </div>
          <button className="btn-ghost btn-icon" onClick={onClose}><X size={18} /></button>
        </div>

        {/* Toggle Mode */}
        <div style={{ display: 'flex', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
          <button
            onClick={() => setMode('unified')}
            style={{
              flex: 1, padding: '8px', borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: '0.8rem',
              background: mode === 'unified' ? '#3b82f6' : 'transparent',
              color: mode === 'unified' ? '#fff' : 'var(--color-text-muted)',
              border: `1px solid ${mode === 'unified' ? '#3b82f6' : 'var(--color-border)'}`,
              cursor: 'pointer'
            }}
          >
            Unificadas
          </button>
          <button
            onClick={() => setMode('income')}
            style={{
              flex: 1, padding: '8px', borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: '0.8rem',
              background: mode === 'income' ? '#22c55e' : 'transparent',
              color: mode === 'income' ? '#fff' : 'var(--color-text-muted)',
              border: `1px solid ${mode === 'income' ? '#22c55e' : 'var(--color-border)'}`,
              cursor: 'pointer'
            }}
          >
            Receitas
          </button>
          <button
            onClick={() => setMode('expense')}
            style={{
              flex: 1, padding: '8px', borderRadius: 'var(--radius-md)', fontWeight: 700, fontSize: '0.8rem',
              background: mode === 'expense' ? '#fb7185' : 'transparent',
              color: mode === 'expense' ? '#fff' : 'var(--color-text-muted)',
              border: `1px solid ${mode === 'expense' ? '#fb7185' : 'var(--color-border)'}`,
              cursor: 'pointer'
            }}
          >
            Despesas
          </button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
          {(['tendencia', 'ranking', 'heatmap'] as Tab[]).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                padding: '10px 0',
                borderRadius: 'var(--radius-md)',
                border: `1px solid ${tab === t ? '#3b82f6' : '#e5e7eb'}`,
                background: tab === t ? '#3b82f6' : '#fff',
                color: tab === t ? '#fff' : '#111',
                fontWeight: 700,
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.06em',
                cursor: 'pointer',
              }}
            >
              {t === 'heatmap' ? 'Mapa de Calor' : t === 'tendencia' ? 'Tendência' : 'Ranking'}
            </button>
          ))}
        </div>

        {/* Month nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 'var(--space-md)', marginBottom: 'var(--space-lg)' }}>
          <button className="btn btn-ghost btn-icon" onClick={() => setMonth(shiftMonth(month, -1))}>
            <ChevronLeft size={18} />
          </button>
          <span style={{ fontWeight: 700, fontSize: '1rem' }}>{data?.month_label ?? month}</span>
          <button className="btn btn-ghost btn-icon" onClick={() => setMonth(shiftMonth(month, 1))}>
            <ChevronRight size={18} />
          </button>
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="skeleton" style={{ height: 240 }} />
        ) : tab === 'heatmap' ? (
          masked ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-xl) 0', fontSize: '0.85rem' }}>
              Valores ocultos em modo de visualização.
            </p>
          ) : !hasHeatmapData ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-xl) 0', fontSize: '0.85rem' }}>
              Sem registros no mês selecionado.
            </p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-text-muted)', textAlign: 'center', textTransform: 'uppercase' }}>
                {WEEKDAY_LABELS.map((d, i) => <div key={i}>{d}</div>)}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4 }}>
                {Array.from({ length: firstWeekday }).map((_, i) => <div key={`blank-${i}`} />)}
                {heatmapDays.map(({ day, iso, value }) => (
                  <div
                    key={iso}
                    title={`Dia ${day} — ${formatCurrency(value)}`}
                    style={{
                      aspectRatio: '1',
                      borderRadius: 6,
                      background: heatColor(value, mode, heatmapMaxAbs),
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '0.7rem',
                      fontWeight: 600,
                      color: 'var(--color-text-primary)',
                    }}
                  >
                    {day}
                  </div>
                ))}
              </div>
              {mode === 'unified' ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 'var(--space-sm)' }}>
                  <span>Déficit</span>
                  {[0.9, 0.55, 0.15].map((op, i) => (
                    <div key={`neg-${i}`} style={{ width: 14, height: 14, borderRadius: 3, background: `rgba(251, 113, 133, ${op})` }} />
                  ))}
                  {[0.15, 0.55, 0.9].map((op, i) => (
                    <div key={`pos-${i}`} style={{ width: 14, height: 14, borderRadius: 3, background: `rgba(34, 197, 94, ${op})` }} />
                  ))}
                  <span>Superávit</span>
                </div>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontSize: '0.7rem', color: 'var(--color-text-muted)', marginTop: 'var(--space-sm)' }}>
                  <span>Menor</span>
                  {[0.15, 0.35, 0.55, 0.75, 0.9].map((op, i) => (
                    <div
                      key={i}
                      style={{
                        width: 14,
                        height: 14,
                        borderRadius: 3,
                        background: mode === 'expense' ? `rgba(251, 113, 133, ${op})` : `rgba(34, 197, 94, ${op})`,
                      }}
                    />
                  ))}
                  <span>Maior</span>
                </div>
              )}
            </div>
          )
        ) : tab === 'tendencia' ? (
          <div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 'var(--space-lg)' }}>
              {[
                { label: mode === 'unified' ? 'Saldo Atual' : 'Mês atual', value: formatCurrency(currentMonth?.total ?? 0), sub: 'Sem variação' },
                { label: 'Média', value: formatCurrency(trendAvg), sub: '6 meses' },
                { label: mode === 'unified' ? 'Maior Saldo' : 'Pico', value: formatCurrency(trendPeak?.total ?? 0), sub: trendPeak?.label ?? '-' },
              ].map((card) => (
                <div key={card.label} style={{ background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)', padding: '10px 8px', border: '1px solid var(--color-border)', minWidth: 0, overflow: 'hidden' }}>
                  <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{card.label}</div>
                  <div style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--color-text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{card.value}</div>
                  <div style={{ fontSize: '0.65rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{card.sub}</div>
                </div>
              ))}
            </div>
            {!hasData ? (
              <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-xl) 0', fontSize: '0.85rem' }}>
                {masked ? 'Valores ocultos em modo de visualização.' : 'Sem registros nos últimos meses.'}
              </p>
            ) : (
              <>
                <p style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                  {mode === 'unified' ? 'Receitas x Despesas' : mode === 'expense' ? 'Despesas por mês' : 'Receitas por mês'}
                </p>
                <ResponsiveContainer width="100%" height={150}>
                  <BarChart data={activeTrend} barCategoryGap="25%">
                    <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} />
                    <YAxis hide />
                    <Tooltip formatter={(val: any) => formatCurrency(val)} contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                    {mode === 'unified' ? (
                      <>
                        <Bar dataKey="income" name="Receitas" fill="#22c55e" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="expense" name="Despesas" fill="#fb7185" radius={[4, 4, 0, 0]} />
                      </>
                    ) : (
                      <Bar dataKey="total" radius={[4, 4, 0, 0]} minPointSize={3}>
                        {activeTrend.map((e, i) => (
                          <Cell key={i} fill={e.isCurrent ? (mode === 'expense' ? '#fb7185' : '#22c55e') : (mode === 'expense' ? '#2b2f3a' : '#14532d')} />
                        ))}
                      </Bar>
                    )}
                  </BarChart>
                </ResponsiveContainer>
                {mode === 'unified' && (
                  <div style={{ marginTop: 'var(--space-md)' }}>
                    <p style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                      Receita x Despesa (divergente)
                    </p>
                    <ResponsiveContainer width="100%" height={150}>
                      <BarChart data={activeTrend} barCategoryGap="25%" stackOffset="sign">
                        <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} />
                        <YAxis hide />
                        <Tooltip
                          formatter={(val: any, name: any) => [formatCurrency(name === 'Despesas' ? Math.abs(val) : val), name]}
                          contentStyle={tooltipStyle}
                          labelStyle={tooltipLabelStyle}
                          itemStyle={tooltipItemStyle}
                        />
                        <Bar dataKey="income" name="Receitas" fill="#22c55e" stackId="flow" radius={[4, 4, 0, 0]} />
                        <Bar dataKey="expenseNeg" name="Despesas" fill="#fb7185" stackId="flow" radius={[0, 0, 4, 4]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
                <div style={{ marginTop: 'var(--space-md)' }}>
                  <p style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--color-text-muted)', textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>
                    {mode === 'unified' ? 'Evolução do Saldo' : mode === 'expense' ? 'Evolução das Despesas' : 'Evolução das Receitas'}
                  </p>
                  <ResponsiveContainer width="100%" height={160}>
                    <AreaChart data={activeTrend} margin={{ top: 6, right: 8, left: 8, bottom: 0 }}>
                      <defs>
                        {mode === 'unified' ? (
                          <>
                            <linearGradient id="trendStroke" x1="0" y1="0" x2="0" y2="1">
                              <stop offset={trendGradientOffset} stopColor="#22c55e" />
                              <stop offset={trendGradientOffset} stopColor="#fb7185" />
                            </linearGradient>
                            <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset={trendGradientOffset} stopColor="#22c55e" stopOpacity={0.35} />
                              <stop offset={trendGradientOffset} stopColor="#fb7185" stopOpacity={0.35} />
                            </linearGradient>
                          </>
                        ) : (
                          <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={mode === 'expense' ? '#fb7185' : '#22c55e'} stopOpacity={0.4} />
                            <stop offset="100%" stopColor={mode === 'expense' ? '#fb7185' : '#22c55e'} stopOpacity={0} />
                          </linearGradient>
                        )}
                      </defs>
                      <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.07)" />
                      <XAxis dataKey="label" axisLine={false} tickLine={false} tick={{ fill: 'var(--color-text-muted)', fontSize: 10 }} />
                      <YAxis hide domain={mode === 'unified' ? [trendYMin, trendYMax] : [0, 'auto']} />
                      {mode === 'unified' && <ReferenceLine y={0} stroke="rgba(255,255,255,0.2)" />}
                      <Tooltip formatter={(val: any) => formatCurrency(val)} contentStyle={tooltipStyle} labelStyle={tooltipLabelStyle} itemStyle={tooltipItemStyle} />
                      <Area
                        type="monotone"
                        dataKey="total"
                        name={mode === 'unified' ? 'Saldo' : 'Total'}
                        stroke={mode === 'unified' ? 'url(#trendStroke)' : mode === 'expense' ? '#fb7185' : '#22c55e'}
                        strokeWidth={2.5}
                        fill="url(#trendFill)"
                        dot={mode === 'unified'
                          ? (props: any) => (
                              <circle key={props.index} cx={props.cx} cy={props.cy} r={3} fill={props.payload.total >= 0 ? '#22c55e' : '#fb7185'} stroke="none" />
                            )
                          : { r: 3, strokeWidth: 0, fill: mode === 'expense' ? '#fb7185' : '#22c55e' }}
                        activeDot={{ r: 5 }}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </div>
        ) : (
          ranking.length === 0 ? (
            <p style={{ textAlign: 'center', color: 'var(--color-text-muted)', padding: 'var(--space-xl) 0', fontSize: '0.85rem' }}>
              Sem registros cadastrados para montar ranking.
            </p>
          ) : (
            <div>
              <p style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--color-text-muted)', marginBottom: 'var(--space-md)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                Ranking de {mode === 'expense' ? 'maiores despesas' : mode === 'income' ? 'maiores receitas' : 'Receitas vs Despesas'}
              </p>
              {ranking.map((cat, i) => {
                const pct = rankingTotal > 0 ? (cat.value / rankingTotal) * 100 : 0;
                return (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)', padding: '10px 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: 700, color: 'var(--color-text-muted)', width: 24, textAlign: 'center' }}>{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                        <span>{cat.name}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', fontWeight: 600 }}>{pct.toFixed(1)}%</span>
                          <span style={{ fontWeight: 700 }}>{formatCurrency(cat.value)}</span>
                        </div>
                      </div>
                      <div style={{ height: 4, borderRadius: 2, background: 'var(--color-border)', overflow: 'hidden' }}>
                        <div style={{ height: '100%', background: cat.fill, width: `${pct}%`, borderRadius: 2 }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )
        )}
      </div>
    </div>,
    document.body
  );
}
