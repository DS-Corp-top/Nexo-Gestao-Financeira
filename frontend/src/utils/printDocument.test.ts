import { describe, expect, it, vi } from 'vitest';
import { buildKpiCardsHtml, buildPieChartCard, buildPrintShell, writePrintDocument } from './printDocument';

describe('buildKpiCardsHtml', () => {
  it('renders a card with its label and value', () => {
    const html = buildKpiCardsHtml([{ label: 'Total de Receitas', value: 'R$ 100,00', tone: 'positive' }]);
    expect(html).toContain('Total de Receitas');
    expect(html).toContain('R$ 100,00');
    expect(html).toContain('#16a34a');
  });

  it('renders one card per entry', () => {
    const html = buildKpiCardsHtml([
      { label: 'A', value: '1' },
      { label: 'B', value: '2' },
      { label: 'C', value: '3' },
    ]);
    expect((html.match(/border:1px solid #e5e7eb;border-radius:8px/g) || []).length).toBe(3);
  });
});

describe('buildPieChartCard', () => {
  it('renders an svg with one path per non-zero slice, plus a legend entry each', () => {
    const html = buildPieChartCard({
      title: 'Despesas por Categoria',
      data: [
        { name: 'Aluguel', value: 1200, fill: '#7abf00' },
        { name: 'Mercado', value: 800, fill: '#60a5fa' },
      ],
      emptyLabel: 'Sem despesas',
    });

    expect(html).toContain('<svg');
    expect((html.match(/<path/g) || []).length).toBe(2);
    expect(html).toContain('Aluguel');
    expect(html).toContain('Mercado');
    expect(html).not.toContain('Sem despesas');
  });

  it('draws a full circle instead of a degenerate arc when a single category is 100%', () => {
    const html = buildPieChartCard({
      title: 'Receitas por Categoria',
      data: [{ name: 'Salário', value: 5000, fill: '#7abf00' }],
      emptyLabel: 'Sem receitas',
    });

    expect(html).toContain('<circle');
    expect(html).not.toContain('<path');
  });

  it('falls back to the empty label when every value is zero', () => {
    const html = buildPieChartCard({
      title: 'Despesas por Categoria',
      data: [{ name: 'Aluguel', value: 0, fill: '#7abf00' }],
      emptyLabel: 'Sem despesas no período.',
    });

    expect(html).toContain('Sem despesas no período.');
    expect(html).not.toContain('<svg');
  });

  it('ignores zero-value slices but keeps the ones with movement', () => {
    const html = buildPieChartCard({
      title: 'Receitas por Categoria',
      data: [
        { name: 'Salário', value: 3000, fill: '#7abf00' },
        { name: 'Freelance', value: 0, fill: '#60a5fa' },
      ],
      emptyLabel: 'Sem receitas',
    });

    expect(html).toContain('Salário');
    expect(html).not.toContain('Freelance');
  });
});

describe('buildPrintShell', () => {
  it('embeds the report title, subtitle and body inside the white-background document', () => {
    const html = buildPrintShell({
      documentTitle: 'Resumo Financeiro — Empresa X',
      logoUrl: null,
      issuerName: 'Empresa X',
      reportTitle: 'Resumo Financeiro',
      subtitle: 'Período: 01/02/2026 a 28/02/2026',
      bodyHtml: '<div>CONTEUDO</div>',
    });

    expect(html).toContain('Resumo Financeiro');
    expect(html).toContain('Período: 01/02/2026 a 28/02/2026');
    expect(html).toContain('CONTEUDO');
    expect(html).toContain('background:#fff');
  });

  it('does not rely on inline onclick attributes for the Imprimir/Fechar buttons', () => {
    // The popup is an about:blank document created via window.open() +
    // document.write(), which inherits the opener's CSP (script-src 'self',
    // no 'unsafe-inline'). Inline onclick="" attributes are silently
    // blocked under that policy — see writePrintDocument below.
    const html = buildPrintShell({
      documentTitle: 't', logoUrl: null, issuerName: 'X', reportTitle: 'R', bodyHtml: '<p>x</p>',
    });

    expect(html).not.toContain('onclick=');
    expect(html).toContain('id="print-doc-print-btn"');
    expect(html).toContain('id="print-doc-close-btn"');
  });
});

describe('writePrintDocument', () => {
  it('wires the Imprimir and Fechar buttons to window.print/close from the opener context', () => {
    const doc = document.implementation.createHTMLDocument('print');
    const print = vi.fn();
    const close = vi.fn();
    const fakePrintWindow = { document: doc, print, close } as unknown as Window;

    const html = buildPrintShell({
      documentTitle: 't', logoUrl: null, issuerName: 'X', reportTitle: 'R', bodyHtml: '<p>x</p>',
    });
    writePrintDocument(fakePrintWindow, html);

    doc.getElementById('print-doc-print-btn')!.dispatchEvent(new Event('click'));
    doc.getElementById('print-doc-close-btn')!.dispatchEvent(new Event('click'));

    expect(print).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });
});
