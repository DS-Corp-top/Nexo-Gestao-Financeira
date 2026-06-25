import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  ChevronLeft,
  ChevronRight,
  Wallet,
  TrendingUp,
  TrendingDown,
  CreditCard,
  PiggyBank,
  FileText,
} from 'lucide-react';
import { fetchDashboard, type DashboardData } from '../api/dashboard';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  Cell,
  PieChart,
  Pie,
} from 'recharts';

function formatCurrency(value: string | number): string {
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

const CHART_COLORS = ['#7abf00', '#60a5fa', '#fbbf24', '#fb7185', '#34d399', '#a78bfa', '#f472b6'];

export default function Dashboard() {
  const [searchParams, setSearchParams] = useSearchParams();
  const monthParam = searchParams.get('month') || getMonthParam(new Date());
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetchDashboard(monthParam)
      .then(setData)
      .finally(() => setLoading(false));
  }, [monthParam]);

  const navigateMonth = (delta: number) => {
    setSearchParams({ month: shiftMonth(monthParam, delta) });
  };

  if (loading || !data) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-md)' }}>
        <div className="skeleton" style={{ height: 40, width: 300 }} />
        <div className="kpi-grid">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="skeleton" style={{ height: 100 }} />
          ))}
        </div>
        <div className="skeleton" style={{ height: 300 }} />
      </div>
    );
  }

  const { kpis } = data;
  const balance = parseFloat(kpis.monthly_balance);

  const expenseTrend = data.expense_trend.map((p) => ({
    label: p.label,
    total: parseFloat(p.total),
    isCurrent: p.is_current,
  }));

  const expenseCategories = data.expense_by_category.map((c, i) => ({
    name: c.name,
    value: parseFloat(c.total),
    fill: CHART_COLORS[i % CHART_COLORS.length],
  }));

  return (
    <div className="animate-fade-in">
      {/* Month Navigation */}
      <div className="page-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <button className="btn btn-ghost btn-icon" onClick={() => navigateMonth(-1)}>
            <ChevronLeft size={20} />
          </button>
          <h2 className="page-title">{data.month_label}</h2>
          <button className="btn btn-ghost btn-icon" onClick={() => navigateMonth(1)}>
            <ChevronRight size={20} />
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="kpi-grid stagger" style={{ marginBottom: 'var(--space-xl)' }}>
        <div className="kpi-card">
          <div className="kpi-label"><Wallet size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Saldo Total</div>
          <div className={`kpi-value ${parseFloat(kpis.user_balance) >= 0 ? 'positive' : 'negative'}`}>
            {formatCurrency(kpis.user_balance)}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label"><TrendingUp size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Receitas</div>
          <div className="kpi-value positive">{formatCurrency(kpis.monthly_income)}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label"><TrendingDown size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Despesas</div>
          <div className="kpi-value negative">{formatCurrency(kpis.monthly_expense)}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label">Balanço do Mês</div>
          <div className={`kpi-value ${balance >= 0 ? 'positive' : 'negative'}`}>
            {formatCurrency(kpis.monthly_balance)}
          </div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label"><CreditCard size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Limite Disponível</div>
          <div className="kpi-value accent">{formatCurrency(kpis.credit_available)}</div>
        </div>

        <div className="kpi-card">
          <div className="kpi-label"><PiggyBank size={14} style={{ marginRight: 4, verticalAlign: 'middle' }} /> Investimentos</div>
          <div className="kpi-value accent">{formatCurrency(kpis.investments_total)}</div>
        </div>
      </div>

      {/* Charts Row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)', marginBottom: 'var(--space-xl)' }}>
        {/* Expense Trend */}
        <div className="card">
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
            Tendência de Despesas
          </h3>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={expenseTrend}>
              <XAxis
                dataKey="label"
                axisLine={false}
                tickLine={false}
                tick={{ fill: 'var(--color-text-muted)', fontSize: 11 }}
              />
              <YAxis hide />
              <Tooltip
                formatter={(val: any) => formatCurrency(val)}
                contentStyle={{
                  background: 'var(--color-bg-elevated)',
                  border: '1px solid var(--color-border)',
                  borderRadius: 'var(--radius-md)',
                  color: 'var(--color-text-primary)',
                  fontSize: '0.8rem',
                }}
              />
              <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                {expenseTrend.map((entry, index) => (
                  <Cell
                    key={index}
                    fill={entry.isCurrent ? '#fb7185' : '#2b2f3a'}
                  />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Expense by Category */}
        <div className="card">
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
            Despesas por Categoria
          </h3>
          {expenseCategories.length > 0 ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-md)' }}>
              <ResponsiveContainer width={160} height={160}>
                <PieChart>
                  <Pie
                    data={expenseCategories}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={70}
                    dataKey="value"
                    stroke="none"
                  >
                    {expenseCategories.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1 }}>
                {expenseCategories.slice(0, 5).map((cat, i) => (
                  <div
                    key={i}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '4px 0',
                      fontSize: '0.8rem',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', background: cat.fill }} />
                      <span style={{ color: 'var(--color-text-secondary)' }}>{cat.name}</span>
                    </div>
                    <span style={{ fontWeight: 600 }}>{formatCurrency(cat.value)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="empty-state" style={{ padding: 'var(--space-lg)' }}>
              <p className="empty-state-text">Sem despesas neste mês</p>
            </div>
          )}
        </div>
      </div>

      {/* Accounts + Invoices Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-md)' }}>
        {/* Accounts */}
        <div className="card">
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
            <Wallet size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Contas
          </h3>
          {data.accounts.map((acct) => (
            <div
              key={acct.id}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                padding: '8px 0',
                borderBottom: '1px solid var(--color-border)',
                fontSize: '0.85rem',
              }}
            >
              <div>
                <span>{acct.name}</span>
                <span
                  className="badge badge-info"
                  style={{ marginLeft: 8, fontSize: '0.65rem' }}
                >
                  {acct.account_type}
                </span>
              </div>
              <span style={{ fontWeight: 600, color: parseFloat(acct.balance) >= 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>
                {formatCurrency(acct.balance)}
              </span>
            </div>
          ))}
        </div>

        {/* Invoices */}
        <div className="card">
          <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
            <FileText size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Faturas do Mês
          </h3>
          <div className="kpi-card" style={{ borderColor: 'transparent', padding: 'var(--space-md)' }}>
            <div className="kpi-label">Total Faturado</div>
            <div className="kpi-value accent">{formatCurrency(data.invoices.total_gross)}</div>
            <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: 4 }}>
              {data.invoices.count} {data.invoices.count === 1 ? 'fatura' : 'faturas'}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
