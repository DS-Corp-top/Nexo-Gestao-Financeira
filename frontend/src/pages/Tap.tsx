import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { FileSignature, Pencil, Plus, Printer, Trash2, X } from 'lucide-react';

import {
  createCharter,
  deleteCharter,
  fetchCharters,
  updateCharter,
  type CharterStatus,
  type ProjectCharter,
  type ProjectCharterPayload,
} from '../api/tap';
import { fetchProjects, type Project } from '../api/todos';
import { fetchTenantProfile } from '../api/tenant';
import CurrencyInput from '../components/CurrencyInput';
import {
  buildPrintShell,
  escapeHtml,
  formatDateHtml,
  openPrintWindow,
  resolveMediaUrl,
  writePrintDocument,
} from '../utils/printDocument';

const STATUS_LABEL: Record<CharterStatus, string> = {
  draft: 'Rascunho',
  approved: 'Aprovado',
};
const STATUS_COLOR: Record<CharterStatus, string> = {
  draft: 'var(--color-warning)',
  approved: 'var(--color-success)',
};

function formatCurrency(value: string | number | null): string {
  if (value == null) return 'R$ 0,00';
  const num = typeof value === 'string' ? parseFloat(value) : value;
  return isNaN(num) ? 'R$ 0,00' : num.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

type CharterFormValue = ProjectCharterPayload;

const EMPTY_FORM: CharterFormValue = {
  project: undefined,
  status: 'draft',
  justification: '',
  objectives: '',
  scope: '',
  deliverables: '',
  assumptions: '',
  constraints: '',
  risks: '',
  stakeholders: '',
  sponsor_name: '',
  project_manager_name: '',
  start_date: null,
  end_date: null,
  estimated_budget: '0.00',
  approved_at: null,
  approved_by_name: '',
};

function charterToFormValue(charter: ProjectCharter): CharterFormValue {
  return {
    project: charter.project,
    status: charter.status,
    justification: charter.justification,
    objectives: charter.objectives,
    scope: charter.scope,
    deliverables: charter.deliverables,
    assumptions: charter.assumptions,
    constraints: charter.constraints,
    risks: charter.risks,
    stakeholders: charter.stakeholders,
    sponsor_name: charter.sponsor_name,
    project_manager_name: charter.project_manager_name,
    start_date: charter.start_date,
    end_date: charter.end_date,
    estimated_budget: charter.estimated_budget ?? '0.00',
    approved_at: charter.approved_at,
    approved_by_name: charter.approved_by_name,
  };
}

// ─── Form ─────────────────────────────────────────────────────────────────────

function CharterForm({
  initial,
  projects,
  onSubmit,
  onCancel,
  isLoading,
}: {
  initial: CharterFormValue;
  projects: Project[];
  onSubmit: (value: CharterFormValue) => void;
  onCancel: () => void;
  isLoading: boolean;
}) {
  const [form, setForm] = useState<CharterFormValue>(initial);

  const set = <K extends keyof CharterFormValue>(key: K, value: CharterFormValue[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const textareaStyle = { resize: 'vertical' as const, fontFamily: 'inherit', fontSize: '0.9rem', minHeight: 70 };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!form.project) return;
        onSubmit(form);
      }}
      style={{ display: 'grid', gap: '0.9rem' }}
    >
      <div>
        <label className="label" htmlFor="charter-project">Projeto *</label>
        <select
          id="charter-project"
          className="input"
          value={form.project ?? ''}
          onChange={(e) => set('project', e.target.value ? Number(e.target.value) : undefined)}
          required
        >
          <option value="">Selecione um projeto</option>
          {projects.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="label" htmlFor="charter-status">Status</label>
        <select
          id="charter-status"
          className="input"
          value={form.status}
          onChange={(e) => set('status', e.target.value as CharterStatus)}
        >
          <option value="draft">Rascunho</option>
          <option value="approved">Aprovado</option>
        </select>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label className="label" htmlFor="charter-sponsor">Patrocinador</label>
          <input id="charter-sponsor" className="input" value={form.sponsor_name} onChange={(e) => set('sponsor_name', e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="charter-pm">Gerente do projeto</label>
          <input id="charter-pm" className="input" value={form.project_manager_name} onChange={(e) => set('project_manager_name', e.target.value)} />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
        <div>
          <label className="label" htmlFor="charter-start">Início previsto</label>
          <input id="charter-start" className="input" type="date" value={form.start_date ?? ''} onChange={(e) => set('start_date', e.target.value || null)} />
        </div>
        <div>
          <label className="label" htmlFor="charter-end">Término previsto</label>
          <input id="charter-end" className="input" type="date" value={form.end_date ?? ''} onChange={(e) => set('end_date', e.target.value || null)} />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="charter-budget">Orçamento estimado</label>
        <CurrencyInput id="charter-budget" className="input" value={form.estimated_budget ?? '0.00'} onChange={(v) => set('estimated_budget', v)} />
      </div>

      <div>
        <label className="label" htmlFor="charter-justification">Justificativa</label>
        <textarea id="charter-justification" className="input" style={textareaStyle} value={form.justification} onChange={(e) => set('justification', e.target.value)} placeholder="Por que este projeto deve existir?" />
      </div>

      <div>
        <label className="label" htmlFor="charter-objectives">Objetivos</label>
        <textarea id="charter-objectives" className="input" style={textareaStyle} value={form.objectives} onChange={(e) => set('objectives', e.target.value)} placeholder="O que o projeto deve alcançar?" />
      </div>

      <div>
        <label className="label" htmlFor="charter-scope">Escopo</label>
        <textarea id="charter-scope" className="input" style={textareaStyle} value={form.scope} onChange={(e) => set('scope', e.target.value)} placeholder="O que está incluído e o que está fora do projeto" />
      </div>

      <div>
        <label className="label" htmlFor="charter-deliverables">Principais entregas</label>
        <textarea id="charter-deliverables" className="input" style={textareaStyle} value={form.deliverables} onChange={(e) => set('deliverables', e.target.value)} />
      </div>

      <div>
        <label className="label" htmlFor="charter-assumptions">Premissas</label>
        <textarea id="charter-assumptions" className="input" style={textareaStyle} value={form.assumptions} onChange={(e) => set('assumptions', e.target.value)} />
      </div>

      <div>
        <label className="label" htmlFor="charter-constraints">Restrições</label>
        <textarea id="charter-constraints" className="input" style={textareaStyle} value={form.constraints} onChange={(e) => set('constraints', e.target.value)} />
      </div>

      <div>
        <label className="label" htmlFor="charter-risks">Riscos preliminares</label>
        <textarea id="charter-risks" className="input" style={textareaStyle} value={form.risks} onChange={(e) => set('risks', e.target.value)} />
      </div>

      <div>
        <label className="label" htmlFor="charter-stakeholders">Partes interessadas</label>
        <textarea id="charter-stakeholders" className="input" style={textareaStyle} value={form.stakeholders} onChange={(e) => set('stakeholders', e.target.value)} placeholder="Quem é afetado ou tem interesse no projeto?" />
      </div>

      {form.status === 'approved' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
          <div>
            <label className="label" htmlFor="charter-approved-by">Aprovado por</label>
            <input id="charter-approved-by" className="input" value={form.approved_by_name} onChange={(e) => set('approved_by_name', e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="charter-approved-at">Data de aprovação</label>
            <input id="charter-approved-at" className="input" type="date" value={form.approved_at ?? ''} onChange={(e) => set('approved_at', e.target.value || null)} />
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end', borderTop: '1px solid var(--color-border)', paddingTop: '0.85rem' }}>
        <button type="button" className="btn" onClick={onCancel}>Cancelar</button>
        <button type="submit" className="btn btn-primary" disabled={isLoading || !form.project}>
          {isLoading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Salvar TAP'}
        </button>
      </div>
    </form>
  );
}

function CharterModal({
  charter,
  projects,
  onClose,
  onSubmit,
  isLoading,
}: {
  charter: ProjectCharter | null;
  projects: Project[];
  onClose: () => void;
  onSubmit: (value: CharterFormValue) => void;
  isLoading: boolean;
}) {
  return createPortal(
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 640, maxHeight: '90vh', overflowY: 'auto' }}>
        <div className="modal-header">
          <h3 className="modal-title">{charter ? `Editar TAP ${charter.number_display}` : 'Novo TAP'}</h3>
          <button type="button" className="btn btn-ghost btn-icon" onClick={onClose} aria-label="Fechar modal">
            <X size={18} />
          </button>
        </div>
        <CharterForm
          initial={charter ? charterToFormValue(charter) : EMPTY_FORM}
          projects={projects}
          onSubmit={onSubmit}
          onCancel={onClose}
          isLoading={isLoading}
        />
      </div>
    </div>,
    document.body
  );
}

// ─── Print ──────────────────────────────────────────────────────────────────

function printField(label: string, value: string) {
  if (!value?.trim()) return '';
  return `<div style="margin-bottom:20px">
    <div class="section-label">${escapeHtml(label)}</div>
    <div style="font-size:12px;line-height:1.7;white-space:pre-wrap">${escapeHtml(value)}</div>
  </div><hr>`;
}

function buildCharterBodyHtml(charter: ProjectCharter): string {
  const infoRows = [
    ['Patrocinador', charter.sponsor_name || '—'],
    ['Gerente do projeto', charter.project_manager_name || '—'],
    ['Início previsto', formatDateHtml(charter.start_date)],
    ['Término previsto', formatDateHtml(charter.end_date)],
    ['Orçamento estimado', formatCurrency(charter.estimated_budget)],
    ['Status', STATUS_LABEL[charter.status]],
  ];

  const infoGrid = infoRows
    .map(
      ([label, value]) => `<div>
        <div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#9ca3af;margin-bottom:2px">${escapeHtml(label)}</div>
        <div style="font-size:13px;font-weight:700">${escapeHtml(value)}</div>
      </div>`
    )
    .join('');

  return `
<div style="margin-bottom:20px">
  <div class="section-label">Projeto</div>
  <div class="company-name" style="font-size:14px;font-weight:800;margin-bottom:8px">${escapeHtml(charter.project_name)}</div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px">${infoGrid}</div>
</div>
<hr>
${printField('Justificativa', charter.justification)}
${printField('Objetivos', charter.objectives)}
${printField('Escopo', charter.scope)}
${printField('Principais Entregas', charter.deliverables)}
${printField('Premissas', charter.assumptions)}
${printField('Restrições', charter.constraints)}
${printField('Riscos Preliminares', charter.risks)}
${printField('Partes Interessadas', charter.stakeholders)}
${charter.status === 'approved' ? `<div style="margin-top:30px;display:flex;justify-content:space-between">
  <div>
    <div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#9ca3af;margin-bottom:2px">Aprovado por</div>
    <div style="font-size:13px;font-weight:700">${escapeHtml(charter.approved_by_name || '—')}</div>
  </div>
  <div>
    <div style="font-size:9px;font-weight:700;letter-spacing:.1em;text-transform:uppercase;color:#9ca3af;margin-bottom:2px">Data de aprovação</div>
    <div style="font-size:13px;font-weight:700">${formatDateHtml(charter.approved_at)}</div>
  </div>
</div>` : ''}`;
}

// ─── Page ───────────────────────────────────────────────────────────────────

export default function Tap() {
  const qc = useQueryClient();
  const [editing, setEditing] = useState<ProjectCharter | 'new' | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<ProjectCharter | null>(null);
  const [printing, setPrinting] = useState<number | null>(null);

  const { data: charters = [], isLoading } = useQuery({ queryKey: ['tap'], queryFn: () => fetchCharters() });
  const { data: projects = [] } = useQuery({ queryKey: ['todo-projects'], queryFn: fetchProjects });
  const { data: tenant } = useQuery({ queryKey: ['tenantProfile'], queryFn: fetchTenantProfile });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['tap'] });

  const createMutation = useMutation({
    mutationFn: createCharter,
    onSuccess: () => { invalidate(); setEditing(null); },
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: ProjectCharterPayload }) => updateCharter(id, payload),
    onSuccess: () => { invalidate(); setEditing(null); },
  });
  const deleteMutation = useMutation({
    mutationFn: deleteCharter,
    onSuccess: () => { invalidate(); setConfirmDelete(null); },
  });

  const handleSubmit = (value: CharterFormValue) => {
    if (editing && editing !== 'new') {
      updateMutation.mutate({ id: editing.id, payload: value });
    } else {
      createMutation.mutate(value);
    }
  };

  const handlePrint = (charter: ProjectCharter) => {
    setPrinting(charter.id);
    try {
      const issuerName = tenant?.name || 'Empresa';
      const logoUrl = resolveMediaUrl(tenant?.logo);
      const html = buildPrintShell({
        documentTitle: `TAP ${charter.number_display} — ${charter.project_name}`,
        logoUrl,
        issuerName,
        reportTitle: `TAP ${charter.number_display}`,
        subtitle: 'Termo de Abertura de Projeto',
        bodyHtml: buildCharterBodyHtml(charter),
      });
      const printWindow = openPrintWindow();
      if (!printWindow) {
        alert('Permita popups para imprimir o TAP.');
        return;
      }
      writePrintDocument(printWindow, html);
    } finally {
      setPrinting(null);
    }
  };

  const isSaving = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="animate-fade-in" style={{ display: 'grid', gap: 'var(--space-lg)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div>
          <h2 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0 }}>TAP — Termo de Abertura de Projeto</h2>
          <p style={{ fontSize: '0.82rem', color: 'var(--color-text-muted)', marginTop: 2 }}>
            Documento formal de abertura, vinculado a um projeto de Tarefas.
          </p>
        </div>
        <button type="button" className="btn btn-primary" onClick={() => setEditing('new')} disabled={projects.length === 0}>
          <Plus size={15} /> Novo TAP
        </button>
      </div>

      {projects.length === 0 && (
        <div className="empty-state">
          <FileSignature className="empty-state-icon" />
          <h3 className="empty-state-title">Nenhum projeto cadastrado</h3>
          <p className="empty-state-text">Crie um projeto em Tarefas antes de gerar um TAP.</p>
        </div>
      )}

      {isLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <span className="spinner" />
        </div>
      ) : charters.length === 0 ? (
        projects.length > 0 && (
          <div className="empty-state">
            <FileSignature className="empty-state-icon" />
            <h3 className="empty-state-title">Nenhum TAP criado ainda</h3>
          </div>
        )
      ) : (
        <div style={{ display: 'grid', gap: '0.75rem' }}>
          {charters.map((charter) => (
            <div key={charter.id} className="card" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>TAP {charter.number_display}</span>
                  <span style={{ fontSize: '0.72rem', color: STATUS_COLOR[charter.status], fontWeight: 800 }}>{STATUS_LABEL[charter.status]}</span>
                </div>
                <div style={{ fontSize: '0.85rem', color: 'var(--color-text-secondary)', marginTop: 2 }}>{charter.project_name}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-muted)', marginTop: 4, display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
                  {charter.sponsor_name && <span>Patrocinador: {charter.sponsor_name}</span>}
                  {charter.project_manager_name && <span>Gerente: {charter.project_manager_name}</span>}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '0.35rem', flexShrink: 0 }}>
                <button type="button" className="btn-ghost btn-icon" onClick={() => handlePrint(charter)} disabled={printing === charter.id} title="Imprimir">
                  <Printer size={16} />
                </button>
                <button type="button" className="btn-ghost btn-icon" onClick={() => setEditing(charter)} title="Editar">
                  <Pencil size={16} />
                </button>
                <button type="button" className="btn-ghost btn-icon" onClick={() => setConfirmDelete(charter)} title="Excluir">
                  <Trash2 size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {editing && (
        <CharterModal
          charter={editing === 'new' ? null : editing}
          projects={projects}
          onClose={() => setEditing(null)}
          onSubmit={handleSubmit}
          isLoading={isSaving}
        />
      )}

      {confirmDelete && createPortal(
        <div className="modal-overlay" onClick={() => setConfirmDelete(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 420 }}>
            <div className="modal-header">
              <h3 className="modal-title">Excluir TAP</h3>
            </div>
            <p style={{ fontSize: '0.9rem', color: 'var(--color-text-secondary)' }}>
              Tem certeza que deseja excluir o TAP {confirmDelete.number_display} ({confirmDelete.project_name})? Esta ação não pode ser desfeita.
            </p>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.75rem', marginTop: '1.25rem' }}>
              <button type="button" className="btn" onClick={() => setConfirmDelete(null)}>Cancelar</button>
              <button
                type="button"
                className="btn btn-danger"
                onClick={() => deleteMutation.mutate(confirmDelete.id)}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? <span className="spinner" style={{ width: 16, height: 16 }} /> : 'Excluir'}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
