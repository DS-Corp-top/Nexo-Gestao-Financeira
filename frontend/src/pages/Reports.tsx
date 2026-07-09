import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { FileBarChart, FileText, TrendingUp, Wallet, Printer, Loader2, Landmark } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';

import { fetchAccounts } from '../api/accounts';
import { fetchCategories } from '../api/categories';
import { fetchInvoices, type Invoice } from '../api/invoices';
import { fetchTenantProfile } from '../api/tenant';
import { useAuth } from '../contexts/AuthContext';
import { useViewMode } from '../contexts/ViewModeContext';
import {
  fetchDREReport,
  fetchInvestmentsReport,
  fetchSummaryReport,
  fetchTransactionsReport,
  type CategoryTotal,
  type DREReport,
  type InvestmentsReport,
  type SummaryReport,
  type TransactionsReport,
} from '../api/reports';
import {
  buildKpiCardsHtml,
  buildPieChartCard,
  buildPrintShell,
  CHART_COLORS,
  escapeHtml,
  formatCurrencyHtml,
  formatDateHtml,
  openPrintWindow,
  resolveMediaUrl,
  writePrintDocument,
} from '../utils/printDocument';

type ReportType = 'transactions' | 'summary' | 'invoices' | 'investments' | 'dre';

// Faturas Emitidas depende do módulo de Fatura de Serviços, restrito a
// superusuários (ver invoices/api_views.py) — filtrado abaixo. O DRE
// Gerencial é montado em cima de Transações, então fica liberado pra
// qualquer membro do tenant.
const SUPERUSER_ONLY_REPORTS: ReportType[] = ['invoices'];

const REPORT_TYPES: { key: ReportType; label: string; icon: typeof FileBarChart }[] = [
  { key: 'transactions', label: 'Extrato de Transações', icon: Wallet },
  { key: 'summary', label: 'Resumo Financeiro', icon: FileBarChart },
  { key: 'dre', label: 'DRE Gerencial', icon: Landmark },
  { key: 'invoices', label: 'Faturas Emitidas', icon: FileText },
  { key: 'investments', label: 'Investimentos', icon: TrendingUp },
];

const INVOICE_STATUS_LABEL: Record<string, string> = { issued: 'Emitida', paid: 'Paga' };

function formatCurrency(value: string | number | null | undefined): string {
  if (value == null) return 'R$ 0,00';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(num) ? 'R$ 0,00' : num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function lastOfMonth() {
  const d = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function periodLabel(dateStart: string, dateEnd: string) {
  return `Período: ${formatDateHtml(dateStart)} a ${formatDateHtml(dateEnd)}`;
}

function tableRow(cells: string[], alignLastRight = true): string {
  return `<tr>${cells.map((c, i) => `<td${alignLastRight && i === cells.length - 1 ? ' style="text-align:right"' : ''}>${c}</td>`).join('')}</tr>`;
}

function totalsBlock(rows: { label: string; value: string; grand?: boolean }[]): string {
  return `<div style="max-width:380px;margin-left:auto;margin-top:22px">${rows
    .map(
      (r) =>
        `<div class="totals-row${r.grand ? ' grand' : ''}"><span class="label">${escapeHtml(r.label)}</span><span class="value">${r.value}</span></div>`
    )
    .join('')}</div>`;
}

function buildTransactionsReportBody(report: TransactionsReport): string {
  const rows = report.transactions.length
    ? report.transactions
        .map((t) =>
          tableRow([
            formatDateHtml(t.date),
            escapeHtml(t.description),
            escapeHtml(t.account || '—'),
            escapeHtml(t.category || '—'),
            t.transaction_type === 'income' ? 'Receita' : t.transaction_type === 'expense' ? 'Despesa' : 'Transferência',
            `${t.transaction_type === 'expense' ? '− ' : ''}${formatCurrencyHtml(t.amount)}`,
          ])
        )
        .join('')
    : `<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:20px 0">Nenhuma transação no período.</td></tr>`;

  return `
<div class="section-label">${escapeHtml(report.account ? `Conta: ${report.account}` : 'Todas as contas')}</div>
<table>
  <thead><tr><th>Data</th><th>Descrição</th><th>Conta</th><th>Categoria</th><th>Tipo</th><th style="text-align:right">Valor</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
${totalsBlock([
  { label: 'Saldo Inicial', value: formatCurrencyHtml(report.opening_balance) },
  { label: 'Total de Receitas', value: formatCurrencyHtml(report.total_income) },
  { label: 'Total de Despesas', value: `− ${formatCurrencyHtml(report.total_expense)}` },
  { label: 'Saldo Final', value: formatCurrencyHtml(report.closing_balance), grand: true },
])}`;
}

function toPieSlices(rows: CategoryTotal[]) {
  return rows.map((r, i) => ({ name: r.name, value: parseFloat(r.total) || 0, fill: CHART_COLORS[i % CHART_COLORS.length] }));
}

function buildSummaryReportBody(report: SummaryReport): string {
  const balancePositive = parseFloat(report.balance) >= 0;

  const kpiCards = buildKpiCardsHtml([
    { label: 'Total de Receitas', value: formatCurrencyHtml(report.total_income), tone: 'positive' },
    { label: 'Total de Despesas', value: formatCurrencyHtml(report.total_expense), tone: 'negative' },
    { label: 'Saldo do Período', value: formatCurrencyHtml(report.balance), tone: balancePositive ? 'positive' : 'negative' },
  ]);

  const incomeChart = buildPieChartCard({
    title: 'Receitas por Categoria',
    data: toPieSlices(report.income_by_category),
    emptyLabel: 'Nenhuma receita no período.',
  });
  const expenseChart = buildPieChartCard({
    title: 'Despesas por Categoria',
    data: toPieSlices(report.expense_by_category),
    emptyLabel: 'Nenhuma despesa no período.',
  });

  return `
${kpiCards}
<div style="display:flex;gap:32px;flex-wrap:wrap">
  ${incomeChart}
  ${expenseChart}
</div>`;
}

function buildDREReportBody(report: DREReport): string {
  const netResultPositive = parseFloat(report.net_result) >= 0;

  const kpiCards = buildKpiCardsHtml([
    { label: 'Receita Bruta', value: formatCurrencyHtml(report.total_income), tone: 'positive' },
    { label: 'Custo do Serviço/Produto', value: `− ${formatCurrencyHtml(report.total_cost)}`, tone: 'negative' },
    { label: 'Lucro Bruto', value: formatCurrencyHtml(report.gross_profit), tone: 'neutral' },
    { label: 'Despesas Operacionais', value: `− ${formatCurrencyHtml(report.total_operating_expenses)}`, tone: 'negative' },
    { label: 'Resultado Líquido', value: formatCurrencyHtml(report.net_result), tone: netResultPositive ? 'positive' : 'negative' },
  ]);

  const dreTable = `<table>
    <tbody>
      ${tableRow(['Receita Bruta', formatCurrencyHtml(report.total_income)])}
      ${tableRow(['(−) Custo do Serviço/Produto', `− ${formatCurrencyHtml(report.total_cost)}`])}
      ${tableRow(['<strong>= Lucro Bruto</strong>', `<strong>${formatCurrencyHtml(report.gross_profit)}</strong>`])}
      ${tableRow(['(−) Despesas Operacionais', `− ${formatCurrencyHtml(report.total_operating_expenses)}`])}
      ${tableRow(['<strong>= Resultado Líquido do Período</strong>', `<strong>${formatCurrencyHtml(report.net_result)}</strong>`])}
    </tbody>
  </table>`;

  const costChart = buildPieChartCard({
    title: 'Custos por Categoria',
    data: toPieSlices(report.costs_by_category),
    emptyLabel: 'Nenhum custo direto no período.',
  });
  const expenseChart = buildPieChartCard({
    title: 'Despesas Operacionais por Categoria',
    data: toPieSlices(report.operating_expenses),
    emptyLabel: 'Nenhuma despesa operacional no período.',
  });

  return `
${kpiCards}
<div style="margin-bottom:26px">
  <div class="section-label">Demonstração do Resultado</div>
  ${dreTable}
</div>
<div style="display:flex;gap:32px;flex-wrap:wrap">
  ${costChart}
  ${expenseChart}
</div>`;
}

function buildInvoicesReportBody(invoices: Invoice[]): string {
  const rows = invoices.length
    ? invoices
        .map((inv) =>
          tableRow([
            escapeHtml(inv.number_display),
            formatDateHtml(inv.issue_date),
            escapeHtml(inv.client_name),
            INVOICE_STATUS_LABEL[inv.status] || inv.status,
            formatCurrencyHtml(inv.gross_value),
            formatCurrencyHtml(inv.net_value),
          ])
        )
        .join('')
    : `<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:20px 0">Nenhuma fatura no período.</td></tr>`;

  const totalGross = invoices.reduce((sum, inv) => sum + parseFloat(inv.gross_value || '0'), 0);
  const totalNet = invoices.reduce((sum, inv) => sum + parseFloat(inv.net_value || '0'), 0);

  return `
<table>
  <thead><tr><th>Número</th><th>Emissão</th><th>Cliente</th><th>Status</th><th style="text-align:right">Valor Bruto</th><th style="text-align:right">Valor Líquido</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
${totalsBlock([
  { label: 'Quantidade de Faturas', value: String(invoices.length) },
  { label: 'Total Bruto', value: formatCurrencyHtml(totalGross) },
  { label: 'Total Líquido', value: formatCurrencyHtml(totalNet), grand: true },
])}`;
}

function buildInvestmentsReportBody(report: InvestmentsReport): string {
  const rows = report.investments.length
    ? report.investments
        .map((inv) =>
          tableRow([
            escapeHtml(inv.name),
            escapeHtml(inv.investment_type_display),
            escapeHtml(inv.broker || '—'),
            formatCurrencyHtml(inv.total_invested),
            formatCurrencyHtml(inv.total_withdrawn),
            formatCurrencyHtml(inv.total_earnings),
            formatCurrencyHtml(inv.net_invested),
          ])
        )
        .join('')
    : `<tr><td colspan="7" style="text-align:center;color:#9ca3af;padding:20px 0">Nenhuma movimentação no período.</td></tr>`;

  return `
<table>
  <thead><tr><th>Investimento</th><th>Tipo</th><th>Corretora</th><th style="text-align:right">Aportes</th><th style="text-align:right">Resgates</th><th style="text-align:right">Rendimentos</th><th style="text-align:right">Líquido</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
${totalsBlock([
  { label: 'Total Aportado', value: formatCurrencyHtml(report.total_invested) },
  { label: 'Total Resgatado', value: `− ${formatCurrencyHtml(report.total_withdrawn)}` },
  { label: 'Total de Rendimentos', value: formatCurrencyHtml(report.total_earnings) },
  { label: 'Líquido Investido no Período', value: formatCurrencyHtml(report.net_invested), grand: true },
])}`;
}

export default function Reports() {
  const { user } = useAuth();
  const availableReportTypes = REPORT_TYPES.filter((r) => !SUPERUSER_ONLY_REPORTS.includes(r.key) || user?.is_superuser);
  const [reportType, setReportType] = useState<ReportType>('transactions');
  const [dateStart, setDateStart] = useState(firstOfMonth());
  const [dateEnd, setDateEnd] = useState(lastOfMonth());
  const [accountFilter, setAccountFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('');
  const [investmentTypeFilter, setInvestmentTypeFilter] = useState('');
  const [generated, setGenerated] = useState(false);
  const [printing, setPrinting] = useState(false);

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts });
  const { data: categories = [] } = useQuery({ queryKey: ['categories'], queryFn: fetchCategories });
  const { data: tenant } = useQuery({ queryKey: ['tenantProfile'], queryFn: fetchTenantProfile });

  const transactionsQuery = useQuery({
    queryKey: ['reports', 'transactions', dateStart, dateEnd, accountFilter, categoryFilter],
    queryFn: () =>
      fetchTransactionsReport({
        date_start: dateStart,
        date_end: dateEnd,
        account: accountFilter ? Number(accountFilter) : undefined,
        category: categoryFilter ? Number(categoryFilter) : undefined,
      }),
    enabled: generated && reportType === 'transactions',
  });

  const summaryQuery = useQuery({
    queryKey: ['reports', 'summary', dateStart, dateEnd],
    queryFn: () => fetchSummaryReport({ date_start: dateStart, date_end: dateEnd }),
    enabled: generated && reportType === 'summary',
  });

  const invoicesQuery = useQuery({
    queryKey: ['reports', 'invoices', dateStart, dateEnd, invoiceStatusFilter],
    queryFn: () => fetchInvoices({ start: dateStart, end: dateEnd, status: invoiceStatusFilter || undefined }),
    enabled: generated && reportType === 'invoices',
  });

  const investmentsQuery = useQuery({
    queryKey: ['reports', 'investments', dateStart, dateEnd, investmentTypeFilter],
    queryFn: () =>
      fetchInvestmentsReport({
        date_start: dateStart,
        date_end: dateEnd,
        investment_type: investmentTypeFilter || undefined,
      }),
    enabled: generated && reportType === 'investments',
  });

  const dreQuery = useQuery({
    queryKey: ['reports', 'dre', dateStart, dateEnd],
    queryFn: () => fetchDREReport({ date_start: dateStart, date_end: dateEnd }),
    enabled: generated && reportType === 'dre',
  });

  const activeQuery = { transactions: transactionsQuery, summary: summaryQuery, invoices: invoicesQuery, investments: investmentsQuery, dre: dreQuery }[reportType];

  const handleGenerate = () => setGenerated(true);

  const handleChangeType = (type: ReportType) => {
    setReportType(type);
    setGenerated(false);
  };

  const handlePrint = async () => {
    const issuerName = tenant?.name || 'Empresa';
    const logoUrl = resolveMediaUrl(tenant?.logo);
    const subtitle = periodLabel(dateStart, dateEnd);
    const reportMeta = REPORT_TYPES.find((r) => r.key === reportType)!;

    setPrinting(true);
    try {
      let bodyHtml = '';
      if (reportType === 'transactions') {
        const data = transactionsQuery.data ?? (await fetchTransactionsReport({
          date_start: dateStart, date_end: dateEnd,
          account: accountFilter ? Number(accountFilter) : undefined,
          category: categoryFilter ? Number(categoryFilter) : undefined,
        }));
        bodyHtml = buildTransactionsReportBody(data);
      } else if (reportType === 'summary') {
        const data = summaryQuery.data ?? (await fetchSummaryReport({ date_start: dateStart, date_end: dateEnd }));
        bodyHtml = buildSummaryReportBody(data);
      } else if (reportType === 'invoices') {
        const data = invoicesQuery.data ?? (await fetchInvoices({ start: dateStart, end: dateEnd, status: invoiceStatusFilter || undefined }));
        bodyHtml = buildInvoicesReportBody(data);
      } else if (reportType === 'dre') {
        const data = dreQuery.data ?? (await fetchDREReport({ date_start: dateStart, date_end: dateEnd }));
        bodyHtml = buildDREReportBody(data);
      } else {
        const data = investmentsQuery.data ?? (await fetchInvestmentsReport({
          date_start: dateStart, date_end: dateEnd, investment_type: investmentTypeFilter || undefined,
        }));
        bodyHtml = buildInvestmentsReportBody(data);
      }

      const html = buildPrintShell({
        documentTitle: `${reportMeta.label} — ${issuerName}`,
        logoUrl,
        issuerName,
        reportTitle: reportMeta.label,
        subtitle,
        bodyHtml,
      });

      const printWindow = openPrintWindow();
      if (!printWindow) {
        alert('Permita popups para imprimir o relatório.');
        return;
      }
      writePrintDocument(printWindow, html);
    } finally {
      setPrinting(false);
    }
  };

  return (
    <div className="animate-fade-in" style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
          {availableReportTypes.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => handleChangeType(key)}
              className="btn"
              style={{
                flexDirection: 'column',
                gap: 8,
                padding: '1rem 0.75rem',
                background: reportType === key ? 'var(--color-accent-muted)' : 'var(--color-bg-elevated)',
                borderColor: reportType === key ? 'var(--color-accent)' : 'var(--color-border)',
                color: reportType === key ? 'var(--color-accent)' : 'var(--color-text-primary)',
              }}
            >
              <Icon size={20} />
              <span style={{ fontSize: '0.8rem', fontWeight: 600, textAlign: 'center' }}>{label}</span>
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-md)' }}>
          <div>
            <label className="label">Data Inicial</label>
            <input type="date" className="input" value={dateStart} onChange={(e) => { setDateStart(e.target.value); setGenerated(false); }} />
          </div>
          <div>
            <label className="label">Data Final</label>
            <input type="date" className="input" value={dateEnd} onChange={(e) => { setDateEnd(e.target.value); setGenerated(false); }} />
          </div>

          {reportType === 'transactions' && (
            <>
              <div>
                <label className="label">Conta</label>
                <select className="input" value={accountFilter} onChange={(e) => { setAccountFilter(e.target.value); setGenerated(false); }}>
                  <option value="">Todas</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Categoria</label>
                <select className="input" value={categoryFilter} onChange={(e) => { setCategoryFilter(e.target.value); setGenerated(false); }}>
                  <option value="">Todas</option>
                  {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            </>
          )}

          {reportType === 'invoices' && (
            <div>
              <label className="label">Status</label>
              <select className="input" value={invoiceStatusFilter} onChange={(e) => { setInvoiceStatusFilter(e.target.value); setGenerated(false); }}>
                <option value="">Todos</option>
                <option value="issued">Emitida</option>
                <option value="paid">Paga</option>
              </select>
            </div>
          )}

          {reportType === 'investments' && (
            <div>
              <label className="label">Tipo</label>
              <select className="input" value={investmentTypeFilter} onChange={(e) => { setInvestmentTypeFilter(e.target.value); setGenerated(false); }}>
                <option value="">Todos</option>
                <option value="stocks">Ações</option>
                <option value="fii">FII</option>
                <option value="fixed_income">Renda Fixa</option>
                <option value="crypto">Cripto</option>
                <option value="savings">Poupança</option>
                <option value="emergency">Reserva de Emergência</option>
                <option value="other">Outro</option>
              </select>
            </div>
          )}
        </div>

        <div style={{ display: 'flex', gap: 'var(--space-sm)', marginTop: 'var(--space-lg)' }}>
          <button className="btn btn-primary" onClick={handleGenerate} disabled={activeQuery.isFetching}>
            {activeQuery.isFetching ? <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> : <FileBarChart size={16} />}
            Gerar Relatório
          </button>
          {generated && activeQuery.data && (
            <button className="btn" onClick={handlePrint} disabled={printing}>
              <Printer size={16} />
              Imprimir
            </button>
          )}
        </div>
      </div>

      {generated && activeQuery.isError && (
        <div className="card" style={{ color: 'var(--color-danger)' }}>
          Não foi possível gerar o relatório. Confira os filtros e tente novamente.
        </div>
      )}

      {generated && activeQuery.data && (
        <div className="card">
          {reportType === 'transactions' && transactionsQuery.data && (
            <TransactionsPreview report={transactionsQuery.data} />
          )}
          {reportType === 'summary' && summaryQuery.data && <SummaryPreview report={summaryQuery.data} />}
          {reportType === 'invoices' && invoicesQuery.data && <InvoicesPreview invoices={invoicesQuery.data} />}
          {reportType === 'dre' && dreQuery.data && <DREPreview report={dreQuery.data} />}
          {reportType === 'investments' && investmentsQuery.data && <InvestmentsPreview report={investmentsQuery.data} />}
        </div>
      )}
    </div>
  );
}

function StatRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--color-border)' }}>
      <span style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem' }}>{label}</span>
      <span style={{ fontWeight: strong ? 800 : 600, fontSize: strong ? '1rem' : '0.85rem' }}>{value}</span>
    </div>
  );
}

function TransactionsPreview({ report }: { report: TransactionsReport }) {
  return (
    <div>
      <StatRow label="Saldo Inicial" value={formatCurrency(report.opening_balance)} />
      <StatRow label="Total de Receitas" value={formatCurrency(report.total_income)} />
      <StatRow label="Total de Despesas" value={`− ${formatCurrency(report.total_expense)}`} />
      <StatRow label="Saldo Final" value={formatCurrency(report.closing_balance)} strong />
      <div style={{ marginTop: 'var(--space-md)', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
        {report.transactions.length} transação(ões) no período.
      </div>
    </div>
  );
}

function CategoryPieCard({ title, rows }: { title: string; rows: CategoryTotal[] }) {
  const { isMobile } = useViewMode();
  const data = rows
    .map((r, i) => ({ name: r.name, value: parseFloat(r.total) || 0, fill: CHART_COLORS[i % CHART_COLORS.length] }))
    .filter((d) => d.value > 0);

  return (
    <div className="card">
      <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>{title}</h3>
      {data.length > 0 ? (
        <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', alignItems: isMobile ? 'stretch' : 'center', gap: 'var(--space-md)' }}>
          <ResponsiveContainer width={isMobile ? '100%' : 160} height={isMobile ? 180 : 160}>
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={isMobile ? 50 : 40} outerRadius={isMobile ? 80 : 70} dataKey="value" stroke="none">
                {data.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div style={{ flex: 1 }}>
            {data.slice(0, 6).map((cat, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '6px 0', borderBottom: '1px solid var(--color-border)', fontSize: '0.8rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: cat.fill, flexShrink: 0 }} />
                  <span style={{ color: 'var(--color-text-secondary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cat.name}</span>
                </div>
                <span style={{ fontWeight: 600, marginLeft: 8, whiteSpace: 'nowrap' }}>{formatCurrency(cat.value)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="empty-state" style={{ padding: 'var(--space-lg)' }}>
          <p className="empty-state-text">Sem movimentações no período</p>
        </div>
      )}
    </div>
  );
}

function SummaryPreview({ report }: { report: SummaryReport }) {
  const { isMobile } = useViewMode();
  const balancePositive = parseFloat(report.balance) >= 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Total de Receitas</div>
          <div className="kpi-value positive">{formatCurrency(report.total_income)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total de Despesas</div>
          <div className="kpi-value negative">{formatCurrency(report.total_expense)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Saldo do Período</div>
          <div className={`kpi-value ${balancePositive ? 'positive' : 'negative'}`}>{formatCurrency(report.balance)}</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 'var(--space-md)' }}>
        <CategoryPieCard title="Receitas por Categoria" rows={report.income_by_category} />
        <CategoryPieCard title="Despesas por Categoria" rows={report.expense_by_category} />
      </div>
    </div>
  );
}

function DREPreview({ report }: { report: DREReport }) {
  const { isMobile } = useViewMode();
  const netResultPositive = parseFloat(report.net_result) >= 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Receita Bruta</div>
          <div className="kpi-value positive">{formatCurrency(report.total_income)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Custo do Serviço/Produto</div>
          <div className="kpi-value negative">− {formatCurrency(report.total_cost)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Lucro Bruto</div>
          <div className="kpi-value accent">{formatCurrency(report.gross_profit)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Despesas Operacionais</div>
          <div className="kpi-value negative">− {formatCurrency(report.total_operating_expenses)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Resultado Líquido</div>
          <div className={`kpi-value ${netResultPositive ? 'positive' : 'negative'}`}>{formatCurrency(report.net_result)}</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--color-text-secondary)', marginBottom: 'var(--space-md)' }}>
          Demonstração do Resultado
        </h3>
        <StatRow label="Receita Bruta" value={formatCurrency(report.total_income)} />
        <StatRow label="(−) Custo do Serviço/Produto" value={`− ${formatCurrency(report.total_cost)}`} />
        <StatRow label="= Lucro Bruto" value={formatCurrency(report.gross_profit)} strong />
        <StatRow label="(−) Despesas Operacionais" value={`− ${formatCurrency(report.total_operating_expenses)}`} />
        <StatRow label="= Resultado Líquido do Período" value={formatCurrency(report.net_result)} strong />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 'var(--space-md)' }}>
        <CategoryPieCard title="Custos por Categoria" rows={report.costs_by_category} />
        <CategoryPieCard title="Despesas Operacionais por Categoria" rows={report.operating_expenses} />
      </div>
    </div>
  );
}

function InvoicesPreview({ invoices }: { invoices: Invoice[] }) {
  const totalGross = invoices.reduce((sum, inv) => sum + parseFloat(inv.gross_value || '0'), 0);
  const totalNet = invoices.reduce((sum, inv) => sum + parseFloat(inv.net_value || '0'), 0);
  return (
    <div>
      <StatRow label="Quantidade de Faturas" value={String(invoices.length)} />
      <StatRow label="Total Bruto" value={formatCurrency(totalGross)} />
      <StatRow label="Total Líquido" value={formatCurrency(totalNet)} strong />
    </div>
  );
}

function InvestmentsPreview({ report }: { report: InvestmentsReport }) {
  return (
    <div>
      <StatRow label="Total Aportado" value={formatCurrency(report.total_invested)} />
      <StatRow label="Total Resgatado" value={`− ${formatCurrency(report.total_withdrawn)}`} />
      <StatRow label="Total de Rendimentos" value={formatCurrency(report.total_earnings)} />
      <StatRow label="Líquido no Período" value={formatCurrency(report.net_invested)} strong />
      <div style={{ marginTop: 'var(--space-md)', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
        {report.investments.length} investimento(s) com movimentação no período.
      </div>
    </div>
  );
}
