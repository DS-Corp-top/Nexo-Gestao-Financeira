// Shared helpers for the print-preview windows used by Invoices and Reports:
// a white-background, logo-in-header HTML document opened in a new browser
// window (window.open + document.write), independent from the SPA's dark
// theme and from React Router.

export function resolveMediaUrl(value?: string | null): string | null {
  if (!value) return null;
  if (/^(https?:|data:|blob:)/i.test(value)) return value;

  const apiBase = import.meta.env.VITE_API_URL || window.location.origin;
  try {
    return new URL(value, apiBase).toString();
  } catch {
    return value;
  }
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function formatCurrencyHtml(value: string | number | null | undefined): string {
  if (value == null) return 'R$ 0,00';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(num) ? 'R$ 0,00' : num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

export function formatDateHtml(value: string | null | undefined): string {
  if (!value) return '—';
  const [y, m, d] = value.split('-');
  if (!y || !m || !d) return value;
  return `${d}/${m}/${y}`;
}

export const CHART_COLORS = ['#7abf00', '#60a5fa', '#fbbf24', '#fb7185', '#34d399', '#a78bfa', '#f472b6'];

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const angleRad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(angleRad), y: cy + r * Math.sin(angleRad) };
}

function describeArc(cx: number, cy: number, r: number, startAngle: number, endAngle: number) {
  const start = polarToCartesian(cx, cy, r, endAngle);
  const end = polarToCartesian(cx, cy, r, startAngle);
  const largeArcFlag = endAngle - startAngle <= 180 ? '0' : '1';
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${r} ${r} 0 ${largeArcFlag} 0 ${end.x} ${end.y} Z`;
}

export interface PieSlice {
  name: string;
  value: number;
  fill: string;
}

/**
 * Static, dependency-free pie chart + legend for the print windows — the
 * live app's recharts <PieChart> only exists inside React, so it can't be
 * reused in a document.write()'d popup. Same color palette as the in-app
 * charts (CHART_COLORS) for visual consistency.
 */
export function buildPieChartCard({ title, data, emptyLabel }: { title: string; data: PieSlice[]; emptyLabel: string }): string {
  const slices = data.filter((d) => d.value > 0);
  const total = slices.reduce((sum, d) => sum + d.value, 0);

  if (total <= 0) {
    return `<div style="flex:1;min-width:0">
      <div class="section-label">${escapeHtml(title)}</div>
      <p style="color:#9ca3af;font-size:12px">${escapeHtml(emptyLabel)}</p>
    </div>`;
  }

  const size = 140;
  const r = size / 2;
  let cursor = 0;
  const paths = slices
    .map((d) => {
      const startAngle = cursor;
      const angle = (d.value / total) * 360;
      cursor += angle;
      if (angle >= 359.99) {
        return `<circle cx="${r}" cy="${r}" r="${r}" fill="${d.fill}" />`;
      }
      return `<path d="${describeArc(r, r, r, startAngle, cursor)}" fill="${d.fill}" />`;
    })
    .join('');

  const legend = slices
    .slice(0, 6)
    .map(
      (d) =>
        `<div style="display:flex;justify-content:space-between;align-items:center;padding:5px 0;border-bottom:1px solid #e5e7eb;font-size:11px">
          <span style="display:flex;align-items:center;gap:6px;color:#374151"><span style="width:8px;height:8px;border-radius:50%;background:${d.fill};display:inline-block;flex-shrink:0"></span>${escapeHtml(d.name)}</span>
          <span style="font-weight:700">${formatCurrencyHtml(d.value)}</span>
        </div>`
    )
    .join('');

  return `<div style="flex:1;min-width:0">
    <div class="section-label">${escapeHtml(title)}</div>
    <div style="display:flex;align-items:center;gap:18px">
      <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="flex-shrink:0">${paths}</svg>
      <div style="flex:1;min-width:0">${legend}</div>
    </div>
  </div>`;
}

export interface KpiCard {
  label: string;
  value: string;
  tone?: 'positive' | 'negative' | 'neutral';
}

const KPI_TONE_COLOR: Record<string, string> = { positive: '#16a34a', negative: '#dc2626', neutral: '#111' };

export function buildKpiCardsHtml(cards: KpiCard[]): string {
  return `<div style="display:flex;gap:14px;margin-bottom:26px">${cards
    .map(
      (c) => `<div style="flex:1;border:1px solid #e5e7eb;border-radius:8px;padding:14px 16px">
        <div style="font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af;margin-bottom:6px">${escapeHtml(c.label)}</div>
        <div style="font-size:19px;font-weight:900;color:${KPI_TONE_COLOR[c.tone || 'neutral']}">${c.value}</div>
      </div>`
    )
    .join('')}</div>`;
}

export function openPrintWindow(): Window | null {
  return window.open('', '_blank', 'width=900,height=700');
}

/**
 * Writes the HTML into the popup and wires up the Imprimir/Fechar buttons.
 *
 * Those buttons can't use inline onclick="" — the popup is an about:blank
 * document created via window.open()+document.write(), which inherits the
 * opener's Content-Security-Policy (script-src 'self', no 'unsafe-inline').
 * Inline event-handler attributes are exactly what 'unsafe-inline' would be
 * needed for, so they're silently blocked. Attaching the listeners here
 * instead runs them from the opener's already-CSP-allowed script context.
 */
export function writePrintDocument(printWindow: Window, html: string) {
  printWindow.document.open();
  printWindow.document.write(html);
  printWindow.document.close();

  printWindow.document.getElementById('print-doc-print-btn')?.addEventListener('click', () => printWindow.print());
  printWindow.document.getElementById('print-doc-close-btn')?.addEventListener('click', () => printWindow.close());
}

export interface PrintShellOptions {
  documentTitle: string;
  logoUrl: string | null;
  issuerName: string;
  reportTitle: string;
  subtitle?: string;
  bodyHtml: string;
}

/**
 * Common white-background print shell: logo + issuer name on the left,
 * report title + optional subtitle (e.g. period) on the right, a black
 * divider, then the caller-supplied body. Matches the visual language of
 * the invoice print view (Invoices.tsx buildPrintHtml).
 */
export function buildPrintShell({ documentTitle, logoUrl, issuerName, reportTitle, subtitle, bodyHtml }: PrintShellOptions): string {
  const logoBlock = logoUrl
    ? `<img src="${logoUrl}" alt="logo" style="max-width:52px;max-height:52px;object-fit:contain;display:block;">`
    : `<span style="color:#fff;font-size:22px;font-weight:900;line-height:1;">${(issuerName || 'N')[0].toUpperCase()}</span>`;

  return `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<title>${escapeHtml(documentTitle)}</title>
<style>
  @page{size:auto;margin:0}
  *{margin:0;padding:0;box-sizing:border-box}
  body{font-family:Arial,Helvetica,sans-serif;color:#111;background:#fff;padding:48px 52px;font-size:13px;line-height:1.5}
  .print-btn{display:inline-flex;align-items:center;gap:8px;padding:8px 22px;background:#111;color:#fff;border:none;cursor:pointer;font-size:13px;font-weight:700;letter-spacing:.04em}
  @media print{html,body{width:100%;min-height:100%;}.print-actions{display:none!important}body{padding:24px 28px}}
  table{width:100%;border-collapse:collapse}
  th{text-align:left;font-size:9px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#9ca3af;padding:6px 8px;border-bottom:2px solid #111}
  td{font-size:12px;padding:7px 8px;border-bottom:1px solid #e5e7eb}
  tr:last-child td{border-bottom:none}
  .section-label{font-size:9px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:#9ca3af;margin-bottom:10px}
  .totals-row{display:flex;justify-content:space-between;align-items:baseline;padding:6px 0}
  .totals-row .label{font-size:12px;color:#555}
  .totals-row .value{font-size:12px;font-weight:700}
  .totals-row.grand{border-top:2px solid #111;margin-top:10px;padding-top:14px}
  .totals-row.grand .label{font-size:15px;font-weight:800;color:#111}
  .totals-row.grand .value{font-size:20px;font-weight:900;color:#111}
</style>
</head>
<body>

<div class="print-actions" style="display:flex;gap:12px;margin-bottom:28px;">
  <button id="print-doc-print-btn" class="print-btn">&#128438; Imprimir</button>
  <button id="print-doc-close-btn" class="print-btn" style="background:#e5e7eb;color:#111;">&#10006; Fechar</button>
</div>

<div style="display:flex;justify-content:space-between;align-items:flex-start;padding-bottom:22px;border-bottom:2px solid #111;margin-bottom:22px">
  <div style="display:flex;align-items:center;gap:14px">
    <div style="width:58px;height:58px;background:#111;display:flex;align-items:center;justify-content:center;flex-shrink:0">
      ${logoBlock}
    </div>
    <div style="font-size:14px;font-weight:800">${escapeHtml(issuerName)}</div>
  </div>
  <div style="text-align:right">
    <div style="font-size:22px;font-weight:900;letter-spacing:.01em">${escapeHtml(reportTitle)}</div>
    ${subtitle ? `<div style="margin-top:6px;font-size:11px;color:#555;font-weight:600">${escapeHtml(subtitle)}</div>` : ''}
  </div>
</div>

${bodyHtml}

</body>
</html>`;
}
