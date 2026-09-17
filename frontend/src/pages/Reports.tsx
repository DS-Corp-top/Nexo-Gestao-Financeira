import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { FileBarChart, Printer, Loader2, ChevronRight, Wallet } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer } from 'recharts';

import { fetchAccounts } from '../api/accounts';
import { fetchInvoices, type Invoice } from '../api/invoices';
import { fetchTenantProfile } from '../api/tenant';
import { useAuth } from '../contexts/AuthContext';
import { useViewMode } from '../contexts/ViewModeContext';
import {
  fetchAccountsReport,
  fetchDREReport,
  fetchInvestmentsReport,
  fetchSummaryReport,
  fetchTransactionsReport,
  type AccountReportRow,
  type AccountsReport,
  type CategoryTotal,
  type DREReport,
  type InvestmentsReport,
  type ReportStatusFilter,
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

type ReportType = 'by_account' | 'summary' | 'invoices' | 'investments' | 'dre';

// Faturas Emitidas depende do módulo de Fatura de Serviços, restrito a
// superusuários (ver invoices/api_views.py) — filtrado abaixo. O DRE
// Gerencial é montado em cima de Transações, então fica liberado pra
// qualquer membro do tenant.
const SUPERUSER_ONLY_REPORTS: ReportType[] = ['invoices'];

const REPORT_TYPES: { key: ReportType; label: string }[] = [
  { key: 'by_account', label: 'Relatório por Conta' },
  { key: 'summary', label: 'Resumo Financeiro' },
  { key: 'dre', label: 'DRE Gerencial' },
  { key: 'invoices', label: 'Faturas Emitidas' },
  { key: 'investments', label: 'Investimentos' },
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

function transactionsTableHtml(transactions: TransactionsReport['transactions']): string {
  if (!transactions.length) {
    return `<p style="color:#9ca3af;text-align:center;padding:12px 0">Nenhuma transação no período.</p>`;
  }
  const rows = transactions
    .map((t) =>
      tableRow([
        formatDateHtml(t.date),
        escapeHtml(t.description),
        escapeHtml(t.category || '—'),
        t.transaction_type === 'income' ? 'Receita' : t.transaction_type === 'expense' ? 'Despesa' : 'Transferência',
        `${t.transaction_type === 'expense' ? '− ' : ''}${formatCurrencyHtml(t.amount)}`,
      ])
    )
    .join('');

  return `<table>
  <thead><tr><th>Data</th><th>Descrição</th><th>Categoria</th><th>Tipo</th><th style="text-align:right">Valor</th></tr></thead>
  <tbody>${rows}</tbody>
</table>`;
}

function toPieSlices(rows: CategoryTotal[]) {
  return rows.map((r, i) => ({ name: r.name, value: parseFloat(r.total) || 0, fill: CHART_COLORS[i % CHART_COLORS.length] }));
}

function buildAccountsReportBody(
  report: AccountsReport,
  transactionsByAccount: Record<number, TransactionsReport['transactions']>
): string {
  const rows = report.accounts.length
    ? report.accounts
        .map((a) =>
          tableRow([
            escapeHtml(a.name),
            escapeHtml(a.account_type_display),
            formatCurrencyHtml(a.opening_balance),
            formatCurrencyHtml(a.total_income),
            `− ${formatCurrencyHtml(a.total_expense)}`,
            formatCurrencyHtml(a.closing_balance),
          ])
        )
        .join('')
    : `<tr><td colspan="6" style="text-align:center;color:#9ca3af;padding:20px 0">Nenhuma conta ativa.</td></tr>`;

  const balanceChart = buildPieChartCard({
    title: 'Saldo Final por Conta',
    data: toPieSlices(report.accounts.map((a) => ({ name: a.name, total: a.closing_balance }))),
    emptyLabel: 'Nenhuma conta com saldo positivo no período.',
  });

  const accountStatements = report.accounts
    .map(
      (a) => `
<div class="section-label" style="margin-top:30px">Extrato — ${escapeHtml(a.name)}</div>
${transactionsTableHtml(transactionsByAccount[a.id] || [])}
${totalsBlock([
  { label: 'Saldo Inicial', value: formatCurrencyHtml(a.opening_balance) },
  { label: 'Total de Receitas', value: formatCurrencyHtml(a.total_income) },
  { label: 'Total de Despesas', value: `− ${formatCurrencyHtml(a.total_expense)}` },
  { label: 'Saldo Final', value: formatCurrencyHtml(a.closing_balance), grand: true },
])}`
    )
    .join('');

  return `
<table>
  <thead><tr><th>Conta</th><th>Tipo</th><th style="text-align:right">Saldo Inicial</th><th style="text-align:right">Receitas</th><th style="text-align:right">Despesas</th><th style="text-align:right">Saldo Final</th></tr></thead>
  <tbody>${rows}</tbody>
</table>
${totalsBlock([
  { label: 'Saldo Inicial Total', value: formatCurrencyHtml(report.total_opening_balance) },
  { label: 'Total de Receitas', value: formatCurrencyHtml(report.total_income) },
  { label: 'Total de Despesas', value: `− ${formatCurrencyHtml(report.total_expense)}` },
  { label: 'Saldo Final Total', value: formatCurrencyHtml(report.total_closing_balance), grand: true },
])}
<div style="display:flex;gap:32px;flex-wrap:wrap;margin-top:26px">
  ${balanceChart}
</div>
${accountStatements}`;
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
  const [reportType, setReportType] = useState<ReportType>('by_account');
  const [dateStart, setDateStart] = useState(firstOfMonth());
  const [dateEnd, setDateEnd] = useState(lastOfMonth());
  const [accountFilter, setAccountFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState<'' | 'income' | 'expense'>('');
  const [statusFilter, setStatusFilter] = useState<ReportStatusFilter>('cleared');
  const [invoiceStatusFilter, setInvoiceStatusFilter] = useState('');
  const [investmentTypeFilter, setInvestmentTypeFilter] = useState('');
  const [generated, setGenerated] = useState(false);
  const [printing, setPrinting] = useState(false);

  const { data: accounts = [] } = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts });
  const { data: tenant } = useQuery({ queryKey: ['tenantProfile'], queryFn: fetchTenantProfile });

  const accountsReportQuery = useQuery({
    queryKey: ['reports', 'by_account', dateStart, dateEnd, statusFilter],
    queryFn: () => fetchAccountsReport({ date_start: dateStart, date_end: dateEnd, status: statusFilter }),
    enabled: generated && reportType === 'by_account',
  });

  const summaryQuery = useQuery({
    queryKey: ['reports', 'summary', dateStart, dateEnd, typeFilter],
    queryFn: () => fetchSummaryReport({ date_start: dateStart, date_end: dateEnd, type: typeFilter || undefined }),
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

  const activeQuery = {
    by_account: accountsReportQuery,
    summary: summaryQuery,
    invoices: invoicesQuery,
    investments: investmentsQuery,
    dre: dreQuery,
  }[reportType];

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
      if (reportType === 'by_account') {
        const data = accountsReportQuery.data ?? (await fetchAccountsReport({ date_start: dateStart, date_end: dateEnd, status: statusFilter }));
        const transactionsByAccount: Record<number, TransactionsReport['transactions']> = Object.fromEntries(
          await Promise.all(
            data.accounts.map(async (a) => {
              const accountReport = await fetchTransactionsReport({
                date_start: dateStart, date_end: dateEnd, account: a.id, type: typeFilter || undefined, status: statusFilter,
              });
              return [a.id, accountReport.transactions] as const;
            })
          )
        );
        bodyHtml = buildAccountsReportBody(data, transactionsByAccount);
      } else if (reportType === 'summary') {
        const data = summaryQuery.data ?? (await fetchSummaryReport({ date_start: dateStart, date_end: dateEnd, type: typeFilter || undefined }));
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
        <div style={{ marginBottom: 'var(--space-lg)' }}>
          <label className="label" htmlFor="report-type-select">Tipo de Relatório</label>
          <select
            id="report-type-select"
            className="select"
            value={reportType}
            onChange={(e) => handleChangeType(e.target.value as ReportType)}
          >
            {availableReportTypes.map(({ key, label }) => (
              <option key={key} value={key}>{label}</option>
            ))}
          </select>
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

          {reportType === 'by_account' && (
            <>
              <div>
                <label className="label" htmlFor="account-filter-select">Conta</label>
                <select id="account-filter-select" className="input" value={accountFilter} onChange={(e) => setAccountFilter(e.target.value)}>
                  <option value="">Todas</option>
                  {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="type-filter-select">Tipo</label>
                <select
                  id="type-filter-select"
                  className="input"
                  value={typeFilter}
                  onChange={(e) => setTypeFilter(e.target.value as '' | 'income' | 'expense')}
                >
                  <option value="">Todos</option>
                  <option value="income">Receita</option>
                  <option value="expense">Despesa</option>
                </select>
              </div>
              <div>
                <label className="label" htmlFor="status-filter-select">Status</label>
                <select
                  id="status-filter-select"
                  className="input"
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value as ReportStatusFilter)}
                >
                  <option value="cleared">Baixadas</option>
                  <option value="pending">Provisões</option>
                  <option value="all">Todas</option>
                </select>
              </div>
            </>
          )}

          {reportType === 'summary' && (
            <div>
              <label className="label" htmlFor="type-filter-select">Tipo</label>
              <select
                id="type-filter-select"
                className="input"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value as '' | 'income' | 'expense')}
              >
                <option value="">Todos</option>
                <option value="income">Receita</option>
                <option value="expense">Despesa</option>
              </select>
            </div>
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
          {reportType === 'by_account' && accountsReportQuery.data && (
            <AccountsReportPreview
              report={accountsReportQuery.data}
              dateStart={dateStart}
              dateEnd={dateEnd}
              accountFilter={accountFilter}
              typeFilter={typeFilter}
              statusFilter={statusFilter}
            />
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

function formatDate(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

function AccountsReportPreview({
  report,
  dateStart,
  dateEnd,
  accountFilter,
  typeFilter,
  statusFilter,
}: {
  report: AccountsReport;
  dateStart: string;
  dateEnd: string;
  accountFilter: string;
  typeFilter: '' | 'income' | 'expense';
  statusFilter: ReportStatusFilter;
}) {
  const { isMobile } = useViewMode();
  const visibleAccounts = accountFilter ? report.accounts.filter((a) => String(a.id) === accountFilter) : report.accounts;
  const sumField = (field: 'opening_balance' | 'total_income' | 'total_expense' | 'closing_balance') =>
    visibleAccounts.reduce((acc, a) => acc + (parseFloat(a[field]) || 0), 0);
  const balanceRows: CategoryTotal[] = visibleAccounts.map((a) => ({ name: a.name, total: a.closing_balance }));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-lg)' }}>
      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-label">Saldo Inicial Total</div>
          <div className="kpi-value">{formatCurrency(sumField('opening_balance'))}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total de Receitas</div>
          <div className="kpi-value positive">{formatCurrency(sumField('total_income'))}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Total de Despesas</div>
          <div className="kpi-value negative">{formatCurrency(sumField('total_expense'))}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-label">Saldo Final Total</div>
          <div className="kpi-value accent">{formatCurrency(sumField('closing_balance'))}</div>
        </div>
      </div>

      {visibleAccounts.length ? (
        <div className="card" style={{ overflowX: 'auto' }}>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: 8 }}>
            Clique em uma conta para ver as transações do período.
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--color-text-secondary)' }}>Conta</th>
                {!isMobile && <th style={{ textAlign: 'left', padding: '8px 6px', color: 'var(--color-text-secondary)' }}>Tipo</th>}
                {!isMobile && <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--color-text-secondary)' }}>Saldo Inicial</th>}
                <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--color-text-secondary)' }}>Receitas</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--color-text-secondary)' }}>Despesas</th>
                <th style={{ textAlign: 'right', padding: '8px 6px', color: 'var(--color-text-secondary)' }}>Saldo Final</th>
              </tr>
            </thead>
            <tbody>
              {visibleAccounts.map((a) => (
                <AccountRowGroup
                  key={a.id}
                  account={a}
                  dateStart={dateStart}
                  dateEnd={dateEnd}
                  typeFilter={typeFilter}
                  statusFilter={statusFilter}
                />
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-state">
          <p className="empty-state-text">Nenhuma conta ativa.</p>
        </div>
      )}

      <CategoryPieCard title="Saldo Final por Conta" rows={balanceRows} />
    </div>
  );
}

function AccountRowGroup({
  account,
  dateStart,
  dateEnd,
  typeFilter,
  statusFilter,
}: {
  account: AccountReportRow;
  dateStart: string;
  dateEnd: string;
  typeFilter: '' | 'income' | 'expense';
  statusFilter: ReportStatusFilter;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const { isMobile } = useViewMode();
  const { data, isFetching } = useQuery({
    queryKey: ['reports', 'account-transactions', account.id, dateStart, dateEnd, typeFilter, statusFilter],
    queryFn: () =>
      fetchTransactionsReport({
        date_start: dateStart, date_end: dateEnd, account: account.id, type: typeFilter || undefined, status: statusFilter,
      }),
    enabled: modalOpen,
  });

  return (
    <>
      <tr
        onClick={() => setModalOpen(true)}
        style={{ borderBottom: '1px solid var(--color-border)', cursor: 'pointer' }}
      >
        <td style={{ padding: '8px 6px', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
          <ChevronRight size={14} />
          {account.name}
        </td>
        {!isMobile && <td style={{ padding: '8px 6px', color: 'var(--color-text-secondary)' }}>{account.account_type_display}</td>}
        {!isMobile && <td style={{ padding: '8px 6px', textAlign: 'right' }}>{formatCurrency(account.opening_balance)}</td>}
        <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--color-success)' }}>{formatCurrency(account.total_income)}</td>
        <td style={{ padding: '8px 6px', textAlign: 'right', color: 'var(--color-danger)' }}>− {formatCurrency(account.total_expense)}</td>
        <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700 }}>{formatCurrency(account.closing_balance)}</td>
      </tr>
      {modalOpen && createPortal(
        <div className="modal-overlay" onClick={() => setModalOpen(false)}>
          <div
            className="modal-content"
            style={{ maxWidth: 720, width: '100%' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="modal-header">
              <h3 className="modal-title" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <Wallet size={18} />
                {account.name}
              </h3>
              <button className="btn btn-ghost btn-icon" onClick={() => setModalOpen(false)} aria-label="Fechar">
                ✕
              </button>
            </div>

            {/* Account summary KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr 1fr' : 'repeat(4, 1fr)', gap: 'var(--space-sm)', marginBottom: 'var(--space-lg)' }}>
              <div style={{ padding: '10px 12px', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Saldo Inicial</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700 }}>{formatCurrency(account.opening_balance)}</div>
              </div>
              <div style={{ padding: '10px 12px', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Receitas</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-success)' }}>{formatCurrency(account.total_income)}</div>
              </div>
              <div style={{ padding: '10px 12px', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Despesas</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-danger)' }}>− {formatCurrency(account.total_expense)}</div>
              </div>
              <div style={{ padding: '10px 12px', background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
                <div style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--color-text-muted)', textTransform: 'uppercase', marginBottom: 4 }}>Saldo Final</div>
                <div style={{ fontSize: '0.95rem', fontWeight: 700, color: 'var(--color-accent)' }}>{formatCurrency(account.closing_balance)}</div>
              </div>
            </div>

            {/* Transactions table */}
            {isFetching ? (
              <div style={{ padding: 'var(--space-lg)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                <Loader2 size={20} style={{ animation: 'spin 1s linear infinite', marginBottom: 8 }} />
                <div>Carregando transações...</div>
              </div>
            ) : data && data.transactions.length ? (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.82rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                      <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--color-text-secondary)' }}>Data</th>
                      <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--color-text-secondary)' }}>Descrição</th>
                      {!isMobile && <th style={{ textAlign: 'left', padding: '8px 10px', color: 'var(--color-text-secondary)' }}>Categoria</th>}
                      <th style={{ textAlign: 'right', padding: '8px 10px', color: 'var(--color-text-secondary)' }}>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.transactions.map((t) => (
                      <tr key={t.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                        <td style={{ padding: '8px 10px' }}>{formatDate(t.date)}</td>
                        <td style={{ padding: '8px 10px' }}>{t.description}</td>
                        {!isMobile && <td style={{ padding: '8px 10px', color: 'var(--color-text-secondary)' }}>{t.category || '—'}</td>}
                        <td
                          style={{
                            padding: '8px 10px',
                            textAlign: 'right',
                            fontWeight: 600,
                            color: t.transaction_type === 'expense' ? 'var(--color-danger)' : 'var(--color-success)',
                          }}
                        >
                          {t.transaction_type === 'expense' ? '− ' : ''}
                          {formatCurrency(t.amount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div style={{ padding: 'var(--space-lg)', textAlign: 'center', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                Nenhuma transação no período.
              </div>
            )}
          </div>
        </div>,
        document.body,
      )}
    </>
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
