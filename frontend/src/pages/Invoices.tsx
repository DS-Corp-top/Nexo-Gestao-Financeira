import { useMemo, useState, useRef, useEffect, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { format, parseISO } from 'date-fns';
import { Plus, CheckCircle2, FileText, Edit2, Printer, ReceiptText, ChevronDown, ChevronUp, MoreVertical, Trash2, Calendar } from 'lucide-react';

import {
  deleteInvoice,
  fetchInvoicePrintData,
  fetchInvoices,
  payInvoice,
  toggleInvoiceNoteIssued,
  type Invoice,
  type InvoiceFilters,
  type InvoicePrintData,
} from '../api/invoices';
import { fetchAccounts } from '../api/accounts';
import InvoiceModal from '../components/Invoices/InvoiceModal';
import { useIsAdmin } from '../hooks/useIsAdmin';
import { useViewMode } from '../contexts/ViewModeContext';

function formatCurrency(value: string | number | null): string {
  if (value == null) return '••••••';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function firstOfMonth() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function lastOfMonth() {
  const d = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function resolveMediaUrl(value?: string | null) {
  if (!value) return null;
  if (/^(https?:|data:|blob:)/i.test(value)) return value;

  const apiBase = import.meta.env.VITE_API_URL || window.location.origin;
  try {
    return new URL(value, apiBase).toString();
  } catch {
    return value;
  }
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function printIssuerName(data: InvoicePrintData) {
  return (data.issuer_company?.name || data.tenant?.name || 'Empresa emissora').trim();
}

function buildPrintHtml(data: InvoicePrintData): string {
  const { invoice, tenant, service_code_description, responsible_name } = data;
  const issuer = data.issuer_company || tenant;
  const issuerName = printIssuerName(data);
  const logoUrl = resolveMediaUrl(tenant?.logo);

  const statusMap: Record<string, string> = {
    draft:     'RASCUNHO',
    issued:    'EMITIDA',
    paid:      'PAGA',
    cancelled: 'CANCELADA',
  };
  const statusLabel = statusMap[invoice.status] ?? '—';

  function fmtDate(s: string) {
    if (!s) return '—';
    const [y, m, d] = s.split('-');
    return `${d}/${m}/${y}`;
  }

  function fmtCurrency(v: string | number) {
    const n = typeof v === 'string' ? parseFloat(v) : v;
    return isNaN(n) ? 'R$ 0,00' : n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }

  const logoBlock = logoUrl
    ? `<img src="${logoUrl}" alt="logo" style="max-width:52px;max-height:52px;object-fit:contain;display:block;">`
    : `<span style="color:#fff;font-size:22px;font-weight:900;line-height:1;">${(issuer?.name || 'N')[0].toUpperCase()}</span>`;

  const row = (label: string, value: string) =>
    value ? `<tr><td style="color:#888;font-size:10px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;padding:3px 0;white-space:nowrap;vertical-align:top;padding-right:20px;">${label}</td><td style="font-size:12px;padding:3px 0;">${escapeHtml(value)}</td></tr>` : '';

  const issuerRows = [
    row('CNPJ/CPF', issuer?.document || ''),
    row('RESPONSÁVEL', responsible_name),
    row('E-MAIL COMERCIAL', issuer?.email || ''),
    row('TELEFONE', issuer?.phone || ''),
    row('ENDEREÇO', issuer?.full_address || ''),
  ].join('');

  const clientRows = [
    row('CPF/CNPJ', invoice.client_document),
    row('TELEFONE', invoice.client_phone),
    row('E-MAIL', invoice.client_email),
    row('ENDEREÇO', [invoice.client_address, invoice.client_city].filter(Boolean).join(' — ')),
  ].join('');

  const notesText = invoice.notes?.trim() ? escapeHtml(invoice.notes.trim()) : '—';
  const withheld = parseFloat(invoice.total_withheld || '0');

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${escapeHtml(issuerName)}</title>
<style>
  @page{size:auto;margin:0}
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff;padding:48px 52px;font-size:13px;line-height:1.5}
  .print-btn{display:inline-flex;align-items:center;gap:8px;padding:8px 22px;background:#111;color:#fff;border:none;cursor:pointer;font-size:13px;font-weight:700;letter-spacing:.04em}
  @media print{html,body{width:100%;min-height:100%;}.print-actions{display:none!important}body{padding:24px 28px}}
  hr{border:none;border-top:1px solid #e5e7eb;margin:20px 0}
  .section-label{font-size:9px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#9ca3af;margin-bottom:10px}
  .company-name{font-size:14px;font-weight:800;margin-bottom:8px;letter-spacing:.01em}
  .service-header{font-size:11px;font-weight:700;margin-bottom:10px;color:#374151;letter-spacing:.02em}
  .service-body{background:#f9fafb;border:1px solid #e5e7eb;padding:12px 16px;font-size:12px;line-height:1.7;white-space:pre-wrap}
  .val-row{display:flex;justify-content:space-between;align-items:baseline;padding:5px 0}
  .val-label{font-size:12px;color:#555}
  .val-amount{font-size:12px}
  .val-row.total{border-top:2px solid #111;margin-top:10px;padding-top:14px}
  .val-row.total .val-label{font-size:15px;font-weight:800;color:#111}
  .val-row.total .val-amount{font-size:20px;font-weight:900;color:#111}
</style>
</head>
<body>

<div class="print-actions" style="display:flex;gap:12px;margin-bottom:28px;">
  <button class="print-btn" onclick="window.print()">&#128438; Imprimir</button>
  <button class="print-btn" style="background:#e5e7eb;color:#111;" onclick="window.close()">&#10006; Fechar</button>
</div>

<div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:22px;border-bottom:2px solid #111;margin-bottom:22px">
  <div style="width:58px;height:58px;background:#111;display:flex;align-items:center;justify-content:center;flex-shrink:0">
    ${logoBlock}
  </div>
  <div style="text-align:right">
    <div style="font-size:22px;font-weight:900;letter-spacing:.01em">Fatura ${escapeHtml(invoice.number_display)}</div>
    <div style="margin-top:6px;display:inline-block;padding:3px 12px;background:#111;color:#fff;font-size:10px;font-weight:800;letter-spacing:.1em">${statusLabel}</div>
  </div>
</div>

<div style="margin-bottom:20px">
  <div class="section-label">Informações da Fatura</div>
  <div style="display:grid;grid-template-columns:1fr 1fr;gap:24px">
    <div>
      <div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#9ca3af;margin-bottom:2px">Data de Emissão</div>
      <div style="font-size:13px;font-weight:700">${fmtDate(invoice.issue_date)}</div>
    </div>
    <div>
      <div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#9ca3af;margin-bottom:2px">Data de Vencimento</div>
      <div style="font-size:13px;font-weight:700">${fmtDate(invoice.due_date)}</div>
    </div>
  </div>
</div>

<hr>

<div style="margin-bottom:20px">
  <div class="section-label">Prestador do Serviço (Emissor)</div>
  <div class="company-name">${escapeHtml(issuerName)}</div>
  <table style="border-collapse:collapse"><tbody>${issuerRows}</tbody></table>
</div>

<hr>

<div style="margin-bottom:20px">
  <div class="section-label">Tomador do Serviço (Cliente)</div>
  <div class="company-name">${escapeHtml(invoice.client_name)}</div>
  <table style="border-collapse:collapse"><tbody>${clientRows}</tbody></table>
</div>

<hr>

<div style="margin-bottom:20px">
  <div class="section-label">Discriminação dos Serviços</div>
  ${invoice.service_code ? `<div class="service-header">CÓDIGO DO SERVIÇO: ${escapeHtml(invoice.service_code)}${service_code_description ? ` — ${escapeHtml(service_code_description).toUpperCase()}` : ''}</div>` : ''}
  <div class="service-body">${escapeHtml(invoice.service_description || '')}</div>
</div>

<hr>
<div style="margin-bottom:20px">
  <div class="section-label">Observações</div>
  <div style="font-size:12px;line-height:1.7;white-space:pre-wrap">${notesText}</div>
</div>

<hr>

<div style="max-width:380px;margin-left:auto">
  <div class="val-row">
    <span class="val-label">Valor do Serviço</span>
    <span class="val-amount">${fmtCurrency(invoice.gross_value)}</span>
  </div>
  ${withheld > 0 ? `<div class="val-row">
    <span class="val-label">Impostos Retidos</span>
    <span class="val-amount">− ${fmtCurrency(withheld)}</span>
  </div>` : ''}
  <div class="val-row total">
    <span class="val-label">Valor da Fatura</span>
    <span class="val-amount">${fmtCurrency(invoice.net_value)}</span>
  </div>
</div>

</body>
</html>`;
}

function ActionsDropdown({ invoice, onEdit, onPay, onPrint, onToggleNoteIssued, onDelete, isAdmin }: {
  invoice: Invoice;
  onEdit: () => void;
  onPay: () => void;
  onPrint: () => void;
  onToggleNoteIssued: () => void;
  onDelete: () => void;
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handle(e: MouseEvent) {
      const target = e.target as Node;
      const insideTrigger = ref.current?.contains(target);
      const insideMenu = menuRef.current?.contains(target);
      if (!insideTrigger && !insideMenu) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handle);
    return () => document.removeEventListener('mousedown', handle);
  }, [open]);

  const getMenuStyle = (): CSSProperties => {
    const rect = ref.current?.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    const isMobile = viewportWidth < 769;
    const width = isMobile ? 150 : 168;
    const bottomSafeArea = isMobile ? 104 : 12;
    const visibleItems = [
      invoice.status === 'issued',
      true,
      true,
      invoice.status === 'issued',
    ].filter(Boolean).length;
    const estimatedHeight = Math.min(visibleItems * 36 + 8, viewportHeight - bottomSafeArea - 16);

    if (!rect) {
      return { position: 'fixed', top: 8, left: 8, width };
    }

    const availableBelow = viewportHeight - rect.bottom - bottomSafeArea;
    const openDownTop = rect.bottom + 4;
    const openUpTop = rect.top - estimatedHeight - 4;
    const top = Math.max(
      8,
      Math.min(
        availableBelow >= estimatedHeight ? openDownTop : openUpTop,
        viewportHeight - estimatedHeight - bottomSafeArea,
      ),
    );
    const left = Math.max(8, Math.min(rect.right - width, viewportWidth - width - 8));

    return {
      position: 'fixed',
      top,
      left,
      width,
      maxHeight: `calc(100vh - ${bottomSafeArea + 16}px)`,
    };
  };

  const item = (label: string, icon: ReactNode, onClick: () => void, danger = false) => (
    <button
      type="button"
      onClick={() => { setOpen(false); onClick(); }}
      style={{
        display: 'flex', alignItems: 'center', gap: 10, width: '100%',
        padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer',
        fontSize: '0.8rem', fontWeight: 500, textAlign: 'left',
        color: danger ? 'var(--color-danger)' : 'var(--color-text-primary)',
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = danger ? 'var(--color-danger-muted)' : 'rgba(255,255,255,0.05)')}
      onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
    >
      {icon}{label}
    </button>
  );

  return (
    <div ref={ref} style={{ position: 'relative', display: 'inline-block' }}>
      <button className="btn-ghost btn-icon" onClick={() => setOpen((v) => !v)}>
        <MoreVertical size={16} />
      </button>
      {open && createPortal(
        <div ref={menuRef} style={{
          ...getMenuStyle(),
          zIndex: 999,
          background: 'var(--color-bg-card)',
          border: '1px solid var(--color-border-hover)',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          overflowY: 'auto',
        }}>
          {isAdmin && invoice.status === 'issued' && item('Paga', <CheckCircle2 size={14} style={{ color: 'var(--color-success)' }} />, onPay)}
          {invoice.status === 'issued' && item(
            'Nota Emitida',
            <ReceiptText size={14} style={{ color: invoice.note_issued ? 'var(--color-success)' : undefined }} />,
            onToggleNoteIssued
          )}
          {item('Imprimir', <Printer size={14} />, onPrint)}
          {isAdmin && item('Editar', <Edit2 size={14} />, onEdit)}
          {isAdmin && (
            <div style={{ borderTop: '1px solid var(--color-border)', marginTop: 2, paddingTop: 2 }}>
              {item('Excluir', <Trash2 size={14} />, onDelete, true)}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
}

function DataModal({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  return createPortal(
    <div className="modal-overlay">
      <div className="modal-content" style={{ maxWidth: 760 }}>
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="btn-ghost btn-icon" onClick={onClose}>×</button>
        </div>
        {children}
      </div>
    </div>,
    document.body
  );
}

type InvoiceSortKey = 'number' | 'status' | 'client_name' | 'client_document' | 'issue_date' | 'due_date';

const STATUS_SORT_ORDER: Record<Invoice['status'], number> = { issued: 0, paid: 1 };

function normalizeFilterText(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export default function Invoices() {
  const isAdmin = useIsAdmin();
  const { isMobile } = useViewMode();
  const [modalOpen, setModalOpen] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Invoice | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [sortKey, setSortKey] = useState<InvoiceSortKey | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const startDateRef = useRef<HTMLInputElement>(null);
  const endDateRef = useRef<HTMLInputElement>(null);

  const openDatePicker = (ref: { current: HTMLInputElement | null }) => {
    try {
      ref.current?.showPicker();
    } catch {
      ref.current?.focus();
    }
  };

  const [filters, setFilters] = useState<InvoiceFilters>({
    status: '',
    start: firstOfMonth(),
    end: lastOfMonth(),
  });
  const [draftFilters, setDraftFilters] = useState<InvoiceFilters>(filters);
  const draftAllPeriod = !draftFilters.start && !draftFilters.end;
  const [noteFilter, setNoteFilter] = useState<'' | 'note_issued' | 'note_pending'>('');
  const [draftNoteFilter, setDraftNoteFilter] = useState(noteFilter);

  const queryClient = useQueryClient();

  const { data: invoices = [], isLoading } = useQuery({
    queryKey: ['invoices', filters],
    queryFn: () => fetchInvoices(filters),
  });

  const { data: accounts } = useQuery({ queryKey: ['accounts'], queryFn: fetchAccounts });

  const toggleSort = (key: InvoiceSortKey) => {
    if (sortKey === key) {
      setSortDir((current) => (current === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const visibleInvoices = useMemo(() => {
    const filtered = noteFilter
      ? invoices.filter((inv) => (
          noteFilter === 'note_issued'
            ? inv.status === 'issued' && inv.note_issued
            : inv.status === 'issued' && !inv.note_issued
        ))
      : invoices;

    if (!sortKey) return filtered;
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      switch (sortKey) {
        case 'number':
          return dir * a.number_display.localeCompare(b.number_display, 'pt-BR', { numeric: true });
        case 'status':
          return dir * (STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status]);
        case 'client_name':
          return dir * normalizeFilterText(a.client_name).localeCompare(normalizeFilterText(b.client_name));
        case 'client_document':
          return dir * a.client_document.localeCompare(b.client_document);
        case 'issue_date':
          return dir * a.issue_date.localeCompare(b.issue_date);
        case 'due_date':
          return dir * a.due_date.localeCompare(b.due_date);
        default:
          return 0;
      }
    });
  }, [invoices, sortKey, sortDir, noteFilter]);

  const totalFaturado = visibleInvoices
    .reduce((sum, inv) => sum + parseFloat(inv.net_value || '0'), 0);

  const totalNotaEmitida = visibleInvoices
    .filter((inv) => inv.note_issued)
    .reduce((sum, inv) => sum + parseFloat(inv.net_value || '0'), 0);

  const filterSummary = [
    filters.status ? `Status: ${filters.status}` : 'Status Todos',
    filters.start || filters.end ? 'e periodo selecionado' : '',
  ].filter(Boolean).join(' ');

  const payMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: { paid_at: string; account?: number | null; launch_financial?: boolean } }) => payInvoice(id, payload),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
  });

  const toggleNoteIssuedMutation = useMutation({
    mutationFn: toggleInvoiceNoteIssued,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteInvoice,
    onSuccess: () => {
      setDeleteTarget(null);
      queryClient.invalidateQueries({ queryKey: ['invoices'] });
    },
    onError: () => {
      alert('Erro ao excluir a fatura.');
    }
  });

  const handleOpenNew = () => { setEditingInvoice(null); setModalOpen(true); };
  const handleOpenEdit = (inv: Invoice) => { setEditingInvoice(inv); setModalOpen(true); };

  const handlePay = async (invoice: Invoice) => {
    if (!accounts?.length) {
      if (window.confirm(`Marcar fatura ${invoice.number_display} como paga sem lançamento financeiro?`)) {
        payMutation.mutate({ id: invoice.id, payload: { paid_at: new Date().toISOString().split('T')[0], launch_financial: false } });
      }
      return;
    }
    const today = new Date().toISOString().split('T')[0];
    const activeAccounts = accounts.filter(a => a.is_active);
    const accountIdStr = prompt(
      `Pagar fatura ${invoice.number_display}\nValor: ${formatCurrency(invoice.net_value)}\n\nDigite o ID da conta para registrar no financeiro, ou deixe em branco para apenas marcar como paga.\n\nContas ativas: ${activeAccounts.map(a => `${a.id}=${a.name}`).join(', ')}`,
      invoice.expected_account?.toString() || ''
    );
    if (accountIdStr === null) return;
    if (accountIdStr.trim()) {
      payMutation.mutate({ id: invoice.id, payload: { paid_at: today, launch_financial: true, account: Number(accountIdStr) } });
    } else {
      payMutation.mutate({ id: invoice.id, payload: { paid_at: today, launch_financial: false } });
    }
  };

  const handlePrint = async (invoice: Invoice) => {
    const printWindow = window.open('', '_blank', 'width=900,height=700');
    if (!printWindow) { alert('Permita popups para imprimir.'); return; }
    try {
      printWindow.history.replaceState(null, '', '/fatura');
    } catch {
      // Some browsers may block history changes on a newly opened print window.
    }
    printWindow.document.write('<p>Carregando...</p>');
    const data = await fetchInvoicePrintData(invoice.id);
    printWindow.document.open();
    printWindow.document.write(buildPrintHtml(data));
    printWindow.document.close();
  };
  const sortableHeader = (key: InvoiceSortKey, label: string) => {
    const active = sortKey === key;
    return (
      <th
        onClick={() => toggleSort(key)}
        style={{ cursor: 'pointer', userSelect: 'none', color: active ? 'var(--color-accent)' : undefined }}
        title={`Ordenar por ${label}`}
      >
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, whiteSpace: 'nowrap' }}>
          {label}
          {active
            ? (sortDir === 'asc' ? <ChevronUp size={12} /> : <ChevronDown size={12} />)
            : <ChevronDown size={12} style={{ opacity: 0.3 }} />}
        </span>
      </th>
    );
  };

  return (
    <div className="animate-fade-in">
      <style>{`input[type="date"]::-webkit-calendar-picker-indicator { opacity: 0; pointer-events: none; }`}</style>
      <div className="page-header">
        {isAdmin && (
          <button className="btn btn-primary" onClick={handleOpenNew}>
            <Plus size={18} /> Nova Fatura
          </button>
        )}
      </div>

      {/* ── Cards de resumo ── */}
      <div style={{ display: 'grid', gridTemplateColumns: isMobile ? 'repeat(2, 1fr)' : 'repeat(4, 1fr)', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6 }}>Total Faturado</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-success)' }}>{formatCurrency(totalFaturado)}</div>
        </div>
        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6 }}>Total Nota Emitida</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-success)' }}>{formatCurrency(totalNotaEmitida)}</div>
        </div>
        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6 }}>Quantidade de Faturas</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>{visibleInvoices.length}</div>
        </div>
        <div className="card" style={{ padding: 'var(--space-md)' }}>
          <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: 6 }}>Notas Emitidas</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--color-text-primary)' }}>{visibleInvoices.filter((i) => i.note_issued).length}</div>
        </div>
      </div>

      {/* ── Filtros ── */}
      <div className="card" style={{ marginBottom: 'var(--space-md)', padding: 0, overflow: 'hidden' }}>
        <button
          type="button"
          onClick={() => setFiltersOpen((v) => !v)}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            width: '100%', padding: 'var(--space-sm) var(--space-md)',
            background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left',
          }}
        >
          <div>
            <div style={{ fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.07em', textTransform: 'uppercase', color: 'var(--color-accent)' }}>Filtros</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 2 }}>{filterSummary}</div>
          </div>
          {filtersOpen ? <ChevronUp size={16} style={{ color: 'var(--color-text-muted)' }} /> : <ChevronDown size={16} style={{ color: 'var(--color-text-muted)' }} />}
        </button>

        {filtersOpen && (
          <div style={{ borderTop: '1px solid var(--color-border)', padding: 'var(--space-md)' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 'var(--space-md)', marginBottom: 'var(--space-md)' }}>
              <div>
                <label className="label">Status</label>
                <select
                  className="input"
                  value={draftFilters.status}
                  onChange={(e) => setDraftFilters((f) => ({ ...f, status: e.target.value }))}
                >
                  <option value="">Todos</option>
                  <option value="issued">Emitida</option>
                  <option value="paid">Paga</option>
                </select>
              </div>
              <div>
                <label className="label">Nota</label>
                <select
                  className="input"
                  value={draftNoteFilter}
                  onChange={(e) => setDraftNoteFilter(e.target.value as '' | 'note_issued' | 'note_pending')}
                >
                  <option value="">Todas</option>
                  <option value="note_issued">Nota Emitida</option>
                  <option value="note_pending">Nota Pendente</option>
                </select>
              </div>
              <div>
                <label className="label">Data Inicial</label>
                <div style={{ position: 'relative' }}>
                  <input
                    ref={startDateRef}
                    type="date"
                    className="input"
                    disabled={draftAllPeriod}
                    style={{ paddingRight: 36, opacity: draftAllPeriod ? 0.5 : 1 }}
                    value={draftFilters.start}
                    onChange={(e) => setDraftFilters((f) => ({ ...f, start: e.target.value }))}
                  />
                  <Calendar
                    size={16}
                    onClick={() => openDatePicker(startDateRef)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', cursor: draftAllPeriod ? 'default' : 'pointer', color: 'var(--color-text-muted)', opacity: draftAllPeriod ? 0.5 : 1 }}
                  />
                </div>
              </div>
              <div>
                <label className="label">Data Final</label>
                <div style={{ position: 'relative' }}>
                  <input
                    ref={endDateRef}
                    type="date"
                    className="input"
                    disabled={draftAllPeriod}
                    style={{ paddingRight: 36, opacity: draftAllPeriod ? 0.5 : 1 }}
                    value={draftFilters.end}
                    onChange={(e) => setDraftFilters((f) => ({ ...f, end: e.target.value }))}
                  />
                  <Calendar
                    size={16}
                    onClick={() => openDatePicker(endDateRef)}
                    style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', cursor: draftAllPeriod ? 'default' : 'pointer', color: 'var(--color-text-muted)', opacity: draftAllPeriod ? 0.5 : 1 }}
                  />
                </div>
              </div>
              <label style={{ gridColumn: '1 / -1', display: 'flex', alignItems: 'center', gap: 8, fontSize: '0.82rem', color: 'var(--color-text-secondary)', cursor: 'pointer' }}>
                <input
                  type="checkbox"
                  checked={draftAllPeriod}
                  onChange={(e) => {
                    if (e.target.checked) {
                      setDraftFilters((f) => ({ ...f, start: '', end: '' }));
                    } else {
                      setDraftFilters((f) => ({ ...f, start: firstOfMonth(), end: lastOfMonth() }));
                    }
                  }}
                />
                Todo o período (ignorar Data Inicial / Final)
              </label>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setFilters(draftFilters);
                  setNoteFilter(draftNoteFilter);
                }}
              >
                Aplicar
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => {
                  const cleared = { status: '', start: '', end: '' };
                  setDraftFilters(cleared);
                  setFilters(cleared);
                  setDraftNoteFilter('');
                  setNoteFilter('');
                }}
              >
                Limpar
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Tabela ── */}
      <div className="card" style={{ padding: 0 }}>
        {isLoading ? (
          <div style={{ padding: 'var(--space-xl)', display: 'flex', justifyContent: 'center' }}>
            <span className="spinner" />
          </div>
        ) : invoices.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-2xl)' }}>
            <FileText className="empty-state-icon" />
            <h3 className="empty-state-title">Nenhuma fatura encontrada</h3>
            <p className="empty-state-text">Tente ajustar os filtros ou emita uma nova fatura.</p>
          </div>
        ) : (
          <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
            <table className="table" style={{ fontSize: '0.78rem', whiteSpace: 'nowrap' }}>
              <thead>
                <tr>
                  {sortableHeader('number', 'N\u00ba')}
                  {sortableHeader('status', 'Status')}
                  {!isMobile && <th>Nota</th>}
                  {sortableHeader('client_name', 'Cliente')}
                  {!isMobile && sortableHeader('client_document', 'CPF / CNPJ')}
                  {!isMobile && sortableHeader('issue_date', 'Emiss\u00e3o')}
                  {!isMobile && sortableHeader('due_date', 'Vencimento')}
                  {!isMobile && <th style={{ textAlign: 'right' }}>Valor Bruto</th>}
                  <th style={{ textAlign: 'right' }}>Valor Líquido</th>
                  <th style={{ textAlign: 'center' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {visibleInvoices.map((inv) => (
                  <tr key={inv.id}>
                    <td><strong style={{ cursor: 'pointer' }} onClick={() => handleOpenEdit(inv)}>{inv.number_display}</strong></td>
                    <td>
                      {inv.status === 'issued' && <span className="badge badge-info">Fatura Emitida</span>}
                      {inv.status === 'paid' && <span className="badge badge-success">Fatura Paga</span>}
                    </td>
                    {!isMobile && (
                      <td>
                        {inv.status !== 'issued'
                          ? <span className="badge" style={{ background: 'rgba(255,255,255,0.07)', color: 'var(--color-text-muted)' }}>—</span>
                          : inv.note_issued
                            ? <span className="badge badge-success">Nota Emitida</span>
                            : <span className="badge badge-warning">Nota Pendente</span>
                        }
                      </td>
                    )}
                    <td style={{ fontWeight: 500 }}>{inv.client_name}</td>
                    {!isMobile && <td>{inv.client_document}</td>}
                    {!isMobile && <td>{format(parseISO(inv.issue_date), 'dd/MM/yy')}</td>}
                    {!isMobile && <td>{format(parseISO(inv.due_date), 'dd/MM/yy')}</td>}
                    {!isMobile && <td style={{ textAlign: 'right' }}>{formatCurrency(inv.gross_value)}</td>}
                    <td style={{ textAlign: 'right', fontWeight: 600, color: 'var(--color-accent)' }}>{formatCurrency(inv.net_value)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <ActionsDropdown
                        invoice={inv}
                        isAdmin={isAdmin}
                        onEdit={() => handleOpenEdit(inv)}
                        onPay={() => handlePay(inv)}
                        onPrint={() => handlePrint(inv)}
                        onToggleNoteIssued={() => toggleNoteIssuedMutation.mutate(inv.id)}
                        onDelete={() => setDeleteTarget(inv)}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {modalOpen && (
        <InvoiceModal invoice={editingInvoice} isOpen={modalOpen} onClose={() => setModalOpen(false)} />
      )}


      {deleteTarget && (
        <DataModal title="Excluir fatura" onClose={() => setDeleteTarget(null)}>
          <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
            <div>
              <p style={{ color: 'var(--color-text-primary)', fontSize: '0.95rem', fontWeight: 600 }}>
                Tem certeza que deseja excluir a fatura {deleteTarget.number_display}?
              </p>
              <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.85rem', marginTop: 6 }}>
                Essa ação não pode ser desfeita e removerá definitivamente este registro.
              </p>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 'var(--space-sm)' }}>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setDeleteTarget(null)}
                disabled={deleteMutation.isPending}
              >
                Cancelar
              </button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => deleteMutation.mutate(deleteTarget.id)}
                disabled={deleteMutation.isPending}
              >
                <Trash2 size={16} />
                {deleteMutation.isPending ? 'Excluindo...' : 'Excluir fatura'}
              </button>
            </div>
          </div>
        </DataModal>
      )}
    </div>
  );
}
