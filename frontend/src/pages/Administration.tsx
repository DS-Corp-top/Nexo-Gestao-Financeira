import { useState, useRef } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  CheckCircle2,
  Database,
  LayoutDashboard,
  Shield,
  Users,
} from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { fetchTenantCompanies, type TenantCompany } from '../api/tenant';
import {
  approveUser,
  fetchPendingUsers,
  fetchSystemStats,
  fetchSystemTenants,
  fetchSystemUsers,
  fetchTenantMembers,
  type PendingUser,
  type SystemTenant,
  type SystemUser,
  type TenantMember,
} from '../api/users';
import { uploadBackupFile } from '../api/system';
import { useAuth } from '../contexts/AuthContext';

type Tab = 'dashboard' | 'listagens' | 'cadastros' | 'backup';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDoc(doc: string | null) {
  if (!doc) return '-';
  const d = doc.replace(/\D/g, '');
  if (d.length === 11) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  if (d.length === 14) return d.replace(/(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, '$1.$2.$3/$4-$5');
  return doc;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

function PersonBadge({ type }: { type: 'pf' | 'pj' | null }) {
  if (!type) return null;
  return (
    <span
      className={`badge ${type === 'pj' ? 'badge-info' : 'badge-success'}`}
      style={{ fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.05em' }}
    >
      {type.toUpperCase()}
    </span>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  icon: Icon,
  label,
  value,
  accent = false,
}: {
  icon: LucideIcon;
  label: string;
  value: number | string;
  accent?: boolean;
}) {
  return (
    <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
      <Icon size={22} style={{ color: accent ? 'var(--color-accent)' : 'var(--color-text-secondary)' }} />
      <div style={{ fontSize: '2rem', fontWeight: 800, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)', fontWeight: 500 }}>{label}</div>
    </div>
  );
}

// ─── Dashboard Tab ────────────────────────────────────────────────────────────

function DashboardTab({
  members,
  pendingUsers,
  isSuperuser,
  systemStats,
  tenants,
  users,
  isLoadingTenants,
  isLoadingUsers,
  isLoadingPending,
}: {
  members: TenantMember[];
  pendingUsers: PendingUser[];
  isSuperuser: boolean;
  systemStats?: { total_users: number; total_tenants: number; total_pf: number; total_pj: number };
  tenants: SystemTenant[];
  users: SystemUser[];
  isLoadingTenants: boolean;
  isLoadingUsers: boolean;
  isLoadingPending: boolean;
}) {
  const recentTenants = tenants.slice(-5).reverse();
  const recentUsers = users.slice(-5).reverse();

  return (
    <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))',
          gap: 'var(--space-sm)',
        }}
      >
        <KpiCard icon={Building2} label="Total de tenants" value={systemStats?.total_tenants ?? '...'} />
        <KpiCard icon={Users} label="Total de usuários" value={systemStats?.total_users ?? members.length} />
        <KpiCard icon={Building2} label="Pessoa jurídica" value={systemStats?.total_pj ?? '...'} />
        {isSuperuser && (
          <>
            <KpiCard
              icon={Users}
              label="Pessoa física"
              value={systemStats?.total_pf ?? '...'}
            />
            <KpiCard
              icon={Shield}
              label="Cadastros pendentes"
              value={pendingUsers.length}
              accent={pendingUsers.length > 0}
            />
          </>
        )}
      </div>

      {isSuperuser && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 'var(--space-lg)' }}>
          <SectionCard
            icon={Building2}
            title="Tenants recentes"
            subtitle="Últimos workspaces cadastrados no sistema."
            isLoading={isLoadingTenants}
            isEmpty={recentTenants.length === 0}
            emptyLabel="Nenhum tenant encontrado"
          >
            <div>{recentTenants.map((t) => <TenantRow key={t.id} t={t} />)}</div>
          </SectionCard>

          <SectionCard
            icon={Users}
            title="Usuários recentes"
            subtitle="Últimos usuários vinculados a tenants."
            isLoading={isLoadingUsers}
            isEmpty={recentUsers.length === 0}
            emptyLabel="Nenhum usuário encontrado"
          >
            <div>{recentUsers.map((u) => <UserRow key={`${u.id}-${u.tenant_slug}`} u={u} />)}</div>
          </SectionCard>

          {false && (
          <SectionCard
            icon={Shield}
            title={`Cadastros pendentes (${pendingUsers.length})`}
            subtitle="Solicitações aguardando aprovação."
            isLoading={isLoadingPending}
            isEmpty={pendingUsers.length === 0}
            emptyLabel="Nenhum cadastro pendente"
          >
            <div>
              {pendingUsers.slice(0, 5).map((u) => (
                <div key={u.id} style={listRowStyle}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 2, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>
                        {u.first_name ? `${u.first_name}${u.last_name ? ' ' + u.last_name : ''}` : u.username}
                      </span>
                      <PersonBadge type={u.person_type} />
                    </div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)' }}>{u.email}</div>
                  </div>
                </div>
              ))}
            </div>
          </SectionCard>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Cadastros Tab ────────────────────────────────────────────────────────────

function CadastrosTab({
  pendingUsers,
  isLoading,
  isSuperuser,
  onApprove,
  isPending,
}: {
  pendingUsers: PendingUser[];
  isLoading: boolean;
  isSuperuser: boolean;
  onApprove: (id: number) => void;
  isPending: boolean;
}) {
  if (!isSuperuser) {
    return (
      <div className="empty-state" style={{ padding: 'var(--space-2xl)' }}>
        <Shield className="empty-state-icon" />
        <h3 className="empty-state-title">Acesso restrito</h3>
        <p className="empty-state-text">
          Apenas superadministradores podem gerenciar cadastros globais.
        </p>
      </div>
    );
  }

  return (
    <div className="card" style={{ padding: 0 }}>
      <div
        style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid var(--color-border)',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
        }}
      >
        <Users size={20} style={{ color: 'var(--color-accent)' }} />
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Novos cadastros</h3>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.82rem' }}>
            Solicitações de acesso aguardando aprovação.
          </p>
        </div>
      </div>

      {isLoading ? (
        <div style={{ padding: 'var(--space-xl)', display: 'flex', justifyContent: 'center' }}>
          <span className="spinner" />
        </div>
      ) : pendingUsers.length === 0 ? (
        <div className="empty-state" style={{ padding: 'var(--space-2xl)' }}>
          <Users className="empty-state-icon" />
          <h3 className="empty-state-title">Nenhum cadastro pendente</h3>
          <p className="empty-state-text">Todas as solicitações foram processadas.</p>
        </div>
      ) : (
        <div>
          {pendingUsers.map((u: PendingUser) => (
            <div
              key={u.id}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
                padding: '1rem 1.25rem',
                borderBottom: '1px solid var(--color-border)',
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    flexWrap: 'wrap',
                    marginBottom: 2,
                  }}
                >
                  <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                    {u.first_name
                      ? `${u.first_name}${u.last_name ? ' ' + u.last_name : ''}`
                      : u.username}
                  </span>
                  <PersonBadge type={u.person_type} />
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{u.email}</div>
                <div style={{ display: 'flex', gap: '1rem', marginTop: 4, flexWrap: 'wrap' }}>
                  {u.document && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      {u.person_type === 'pj' ? 'CNPJ' : 'CPF'}: {formatDoc(u.document)}
                    </span>
                  )}
                  {u.tenant_id && (
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      Tenant: {u.tenant_id}
                    </span>
                  )}
                  <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                    Solicitado em {formatDate(u.date_joined)}
                  </span>
                </div>
              </div>

              <button
                className="btn btn-primary"
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                onClick={() => onApprove(u.id)}
                disabled={isPending}
              >
                <CheckCircle2 size={16} />
                Aprovar
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── Empresas Tab ─────────────────────────────────────────────────────────────

function EmpresasTab({ companies }: { companies: TenantCompany[] }) {
  return (
    <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
      {/* Companies list */}
      <div className="card" style={{ padding: 0 }}>
        <div
          style={{
            padding: '1rem 1.25rem',
            borderBottom: '1px solid var(--color-border)',
            display: 'flex',
            alignItems: 'center',
            gap: '0.75rem',
          }}
        >
          <Building2 size={20} style={{ color: 'var(--color-accent)' }} />
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Empresas do tenant</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.82rem' }}>
              Todas as empresas vinculadas a este workspace.
            </p>
          </div>
        </div>

        {companies.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-2xl)' }}>
            <Building2 className="empty-state-icon" />
            <h3 className="empty-state-title">Nenhuma empresa cadastrada</h3>
            <p className="empty-state-text">Adicione empresas em Configurações → Empresa.</p>
          </div>
        ) : (
          <div>
            {companies.map((c) => (
              <div
                key={c.id}
                style={{
                  padding: '1rem 1.25rem',
                  borderBottom: '1px solid var(--color-border)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.75rem',
                }}
              >
                <div
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 'var(--radius-md)',
                    background: 'rgba(122,191,0,0.1)',
                    border: '1px solid rgba(122,191,0,0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Building2 size={16} style={{ color: 'var(--color-accent)' }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.5rem',
                      marginBottom: 2,
                      flexWrap: 'wrap',
                    }}
                  >
                    <span style={{ fontWeight: 700, fontSize: '0.92rem' }}>
                      {c.sequence_number} — {c.name}
                    </span>
                    {c.is_default && (
                      <span className="badge badge-success" style={{ fontSize: '0.7rem' }}>
                        Padrão
                      </span>
                    )}
                    {!c.is_active && (
                      <span className="badge" style={{ fontSize: '0.7rem', opacity: 0.55 }}>
                        Inativa
                      </span>
                    )}
                  </div>
                  <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                    <span>{formatDoc(c.document)}</span>
                    {c.city && (
                      <span>
                        {c.city}
                        {c.state ? `/${c.state}` : ''}
                      </span>
                    )}
                    {c.email && <span>{c.email}</span>}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

    </div>
  );
}

// ─── Backup Tab ───────────────────────────────────────────────────────────────

function BackupTab({ isSuperuser }: { isSuperuser: boolean }) {
  const [file, setFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!isSuperuser) {
    return (
      <div className="empty-state" style={{ padding: 'var(--space-2xl)' }}>
        <Shield className="empty-state-icon" />
        <h3 className="empty-state-title">Acesso restrito</h3>
        <p className="empty-state-text">Apenas superadministradores podem gerenciar backups.</p>
      </div>
    );
  }

  const executeUpload = async () => {
    setShowConfirmModal(false);
    setIsUploading(true);
    setMessage(null);
    try {
      const res = await uploadBackupFile(file!);
      setMessage({ text: res.detail || 'Backup restaurado com sucesso!', type: 'success' });
      setFile(null);
    } catch (err: any) {
      const backendError = err.response?.data?.error;
      const backendDetail = err.response?.data?.detail;
      let errorText = err.message || 'Erro ao restaurar backup.';
      if (backendDetail && backendError) errorText = `${backendDetail} Detalhes: ${backendError}`;
      else if (backendDetail) errorText = backendDetail;
      else if (backendError) errorText = backendError;
      setMessage({ text: errorText, type: 'error' });
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <>
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <Database size={20} style={{ color: 'var(--color-accent)' }} />
          <div>
            <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Restaurar Backup</h3>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.82rem' }}>
              Aplica um arquivo de backup PostgreSQL (.sql, .dump, .tar) no banco de dados.
            </p>
          </div>
        </div>

        <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {message && (
            <div style={{
              padding: '0.875rem 1rem',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
              background: message.type === 'error' ? 'rgba(255,107,107,0.1)' : 'rgba(81,207,102,0.1)',
              color: message.type === 'error' ? '#ff6b6b' : '#51cf66',
              border: `1px solid ${message.type === 'error' ? 'rgba(255,107,107,0.25)' : 'rgba(81,207,102,0.25)'}`,
            }}>
              {message.text}
            </div>
          )}

          {/* Drop zone */}
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              gap: '0.75rem', padding: '2.5rem 1rem',
              border: `2px dashed ${file ? 'var(--color-accent)' : 'var(--color-border)'}`,
              borderRadius: 'var(--radius-lg)',
              background: file ? 'rgba(122,191,0,0.05)' : 'var(--color-bg-elevated)',
              cursor: isUploading ? 'not-allowed' : 'pointer',
              transition: 'border-color 0.15s, background 0.15s',
              width: '100%',
            }}
          >
            <Database size={32} style={{ color: file ? 'var(--color-accent)' : 'var(--color-text-muted)', opacity: 0.7 }} />
            {file ? (
              <>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-accent)' }}>{file.name}</span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  {(file.size / 1024 / 1024).toFixed(2)} MB — clique para trocar
                </span>
              </>
            ) : (
              <>
                <span style={{ fontSize: '0.9rem', fontWeight: 600, color: 'var(--color-text-secondary)' }}>
                  Clique para selecionar o arquivo
                </span>
                <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                  .sql, .dump, .backup ou .tar
                </span>
              </>
            )}
          </button>
          <input
            ref={inputRef}
            type="file"
            accept=".sql,.dump,.backup,.tar"
            style={{ display: 'none' }}
            onChange={(e) => { setFile(e.target.files?.[0] || null); setMessage(null); }}
            disabled={isUploading}
          />

          <button
            className="btn btn-primary"
            disabled={!file || isUploading}
            onClick={() => file && setShowConfirmModal(true)}
            style={{ alignSelf: 'flex-end', display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 160 }}
          >
            {isUploading ? <span className="spinner" style={{ width: 16, height: 16 }} /> : <Database size={16} />}
            {isUploading ? 'Restaurando...' : 'Restaurar Backup'}
          </button>
        </div>
      </div>

      {showConfirmModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem', animation: 'fadeIn 0.2s ease' }}>
          <div className="card" style={{ maxWidth: 440, width: '100%', padding: '1.75rem', animation: 'slideUp 0.2s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,107,107,0.12)', border: '1px solid rgba(255,107,107,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Database size={18} style={{ color: '#ff6b6b' }} />
              </div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: '#ff6b6b' }}>Ação irreversível</h3>
            </div>
            <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: '1.5rem' }}>
              O banco de dados atual será <strong>completamente substituído</strong> pelo backup selecionado. Todos os dados existentes serão perdidos permanentemente.
            </p>
            <div style={{ background: 'var(--color-bg-elevated)', borderRadius: 'var(--radius-md)', padding: '0.6rem 0.85rem', marginBottom: '1.5rem', fontSize: '0.8rem', color: 'var(--color-text-muted)', wordBreak: 'break-all' }}>
              {file?.name}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setShowConfirmModal(false)}>Cancelar</button>
              <button className="btn" style={{ background: '#ff6b6b', color: '#fff', border: 'none' }} onClick={executeUpload}>
                Sim, restaurar
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ─── Listagens Tab ────────────────────────────────────────────────────────────

const listRowStyle = {
  display: 'flex', alignItems: 'center', gap: '1rem',
  padding: '0.85rem 1.25rem', borderBottom: '1px solid var(--color-border)',
} as const;

function SectionCard({
  icon: Icon,
  title,
  subtitle,
  children,
  isLoading,
  isEmpty,
  emptyLabel,
}: {
  icon: LucideIcon;
  title: string;
  subtitle: string;
  children: React.ReactNode;
  isLoading: boolean;
  isEmpty: boolean;
  emptyLabel: string;
}) {
  return (
    <div className="card" style={{ padding: 0 }}>
      <div style={{ padding: '1rem 1.25rem', borderBottom: '1px solid var(--color-border)', display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <Icon size={20} style={{ color: 'var(--color-accent)' }} />
        <div>
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>{title}</h3>
          <p style={{ color: 'var(--color-text-secondary)', fontSize: '0.82rem' }}>{subtitle}</p>
        </div>
      </div>
      {isLoading ? (
        <div style={{ padding: 'var(--space-xl)', display: 'flex', justifyContent: 'center' }}><span className="spinner" /></div>
      ) : isEmpty ? (
        <div className="empty-state" style={{ padding: 'var(--space-2xl)' }}>
          <Icon className="empty-state-icon" />
          <h3 className="empty-state-title">{emptyLabel}</h3>
        </div>
      ) : children}
    </div>
  );
}

function TenantRow({ t }: { t: SystemTenant }) {
  const companyLabel = t.person_type === 'pj'
    ? `empresa${t.company_count !== 1 ? 's' : ''}`
    : `pessoa física${t.company_count !== 1 ? 's' : ''}`;

  return (
    <div style={listRowStyle}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 2, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>{t.name}</span>
          <PersonBadge type={t.person_type} />
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span>Tenant: {t.id}</span>
          <span>{t.user_count} usuário{t.user_count !== 1 ? 's' : ''}</span>
          <span>{t.company_count} {companyLabel}</span>
          <span>criado em {formatDate(t.created_at)}</span>
        </div>
      </div>
    </div>
  );
}

function UserRow({ u }: { u: SystemUser }) {
  return (
    <div style={listRowStyle}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 2, flexWrap: 'wrap' }}>
          <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>
            {u.first_name ? `${u.first_name}${u.last_name ? ' ' + u.last_name : ''}` : u.username}
          </span>
          <PersonBadge type={u.person_type} />
          {!u.is_active && (
            <span className="badge" style={{ fontSize: '0.68rem', opacity: 0.6 }}>inativo</span>
          )}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
          <span>{u.email}</span>
          <span>Tenant: {u.tenant_id}</span>
          <span>cargo: {u.role}</span>
          <span>desde {formatDate(u.date_joined)}</span>
        </div>
      </div>
    </div>
  );
}

function ListagensTab({
  tenants,
  users,
  pendingUsers,
  isLoadingTenants,
  isLoadingUsers,
  isLoadingPending,
  isSuperuser,
  onApprove,
  isApprovePending,
}: {
  tenants: SystemTenant[];
  users: SystemUser[];
  pendingUsers: PendingUser[];
  isLoadingTenants: boolean;
  isLoadingUsers: boolean;
  isLoadingPending: boolean;
  isSuperuser: boolean;
  onApprove: (id: number) => void;
  isApprovePending: boolean;
}) {
  const [searchType, setSearchType] = useState<'tenant' | 'empresa' | 'usuario'>('tenant');
  const [searchTerm, setSearchTerm] = useState('');

  if (!isSuperuser) {
    return (
      <div className="empty-state" style={{ padding: 'var(--space-2xl)' }}>
        <Shield className="empty-state-icon" />
        <h3 className="empty-state-title">Acesso restrito</h3>
        <p className="empty-state-text">Apenas superadministradores podem visualizar listagens globais.</p>
      </div>
    );
  }

  const normalizedSearch = searchTerm.trim().toLowerCase();
  const tenantMatches = (t: SystemTenant) => (
    String(t.id).includes(normalizedSearch) ||
    t.name.toLowerCase().includes(normalizedSearch) ||
    t.slug.toLowerCase().includes(normalizedSearch)
  );
  const userMatches = (u: SystemUser) => (
    String(u.id).includes(normalizedSearch) ||
    String(u.tenant_id).includes(normalizedSearch) ||
    u.email.toLowerCase().includes(normalizedSearch) ||
    u.username.toLowerCase().includes(normalizedSearch) ||
    `${u.first_name} ${u.last_name}`.toLowerCase().includes(normalizedSearch) ||
    u.tenant_name.toLowerCase().includes(normalizedSearch)
  );

  const filteredTenants = tenants.filter((t) => (
    !normalizedSearch ||
    searchType === 'usuario' ||
    tenantMatches(t)
  ));
  const pjList = filteredTenants.filter((t) => t.person_type === 'pj');
  const pfList = filteredTenants.filter((t) => t.person_type === 'pf');

  const filteredUsers = users.filter((u) => (
    !normalizedSearch ||
    (searchType === 'usuario' ? userMatches(u) : (
      String(u.tenant_id).includes(normalizedSearch) ||
      u.tenant_name.toLowerCase().includes(normalizedSearch)
    ))
  ));
  const foundCount = searchType === 'usuario' ? filteredUsers.length : filteredTenants.length;
  const foundLabel = searchType === 'usuario'
    ? `usuário${foundCount !== 1 ? 's' : ''}`
    : searchType === 'empresa'
      ? `empresa${foundCount !== 1 ? 's' : ''}`
      : `tenant${foundCount !== 1 ? 's' : ''}`;

  return (
    <div style={{ display: 'grid', gap: 'var(--space-lg)' }}>
      {/* Busca */}
      <div style={{ display: 'grid', gap: '0.35rem' }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 180px) 1fr', gap: 'var(--space-sm)' }}>
        <select
          className="input"
          value={searchType}
          onChange={(e) => setSearchType(e.target.value as 'tenant' | 'empresa' | 'usuario')}
        >
          <option value="tenant">Tenant</option>
          <option value="empresa">Empresa</option>
          <option value="usuario">Usuário</option>
        </select>
        <input
          className="input"
          placeholder={`Buscar ${searchType}...`}
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>
        {normalizedSearch && (
          <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
            {foundCount} {foundLabel} encontrado{foundCount !== 1 ? 's' : ''}
          </span>
        )}
      </div>

      {/* Todos os Tenants */}
      <SectionCard
        icon={Building2}
        title={`Todos os Tenants (${filteredTenants.length})`}
        subtitle={`PJ: ${pjList.length} · PF: ${pfList.length}`}
        isLoading={isLoadingTenants}
        isEmpty={filteredTenants.length === 0}
        emptyLabel="Nenhum tenant encontrado"
      >
        <div>{filteredTenants.map((t) => <TenantRow key={t.id} t={t} />)}</div>
      </SectionCard>

      {/* Pessoa Jurídica */}
      <SectionCard
        icon={Building2}
        title={`Pessoa Jurídica — PJ (${pjList.length})`}
        subtitle="Tenants do tipo pessoa jurídica (CNPJ)."
        isLoading={isLoadingTenants}
        isEmpty={pjList.length === 0}
        emptyLabel="Nenhum tenant PJ encontrado"
      >
        <div>{pjList.map((t) => <TenantRow key={t.id} t={t} />)}</div>
      </SectionCard>

      {/* Pessoa Física */}
      <SectionCard
        icon={Users}
        title={`Pessoa Física — PF (${pfList.length})`}
        subtitle="Tenants do tipo pessoa física (CPF)."
        isLoading={isLoadingTenants}
        isEmpty={pfList.length === 0}
        emptyLabel="Nenhum tenant PF encontrado"
      >
        <div>{pfList.map((t) => <TenantRow key={t.id} t={t} />)}</div>
      </SectionCard>

      {/* Todos os Usuários */}
      <SectionCard
        icon={Users}
        title={`Todos os Usuários (${filteredUsers.length})`}
        subtitle="Todos os usuários com vínculo de tenant."
        isLoading={isLoadingUsers}
        isEmpty={filteredUsers.length === 0}
        emptyLabel="Nenhum usuário encontrado"
      >
        <div>{filteredUsers.map((u) => <UserRow key={`${u.id}-${u.tenant_slug}`} u={u} />)}</div>
      </SectionCard>

      {false && (
      <SectionCard
        icon={Shield}
        title={`Cadastros Pendentes (${pendingUsers.length})`}
        subtitle="Solicitações de acesso aguardando aprovação."
        isLoading={isLoadingPending}
        isEmpty={pendingUsers.length === 0}
        emptyLabel="Nenhum cadastro pendente"
      >
        <div>
          {pendingUsers.map((u) => (
            <div key={u.id} style={listRowStyle}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: 2, flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>
                    {u.first_name ? `${u.first_name}${u.last_name ? ' ' + u.last_name : ''}` : u.username}
                  </span>
                  <PersonBadge type={u.person_type} />
                </div>
                <div style={{ fontSize: '0.78rem', color: 'var(--color-text-secondary)', display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                  <span>{u.email}</span>
                  {u.document && <span>{u.person_type === 'pj' ? 'CNPJ' : 'CPF'}: {formatDoc(u.document)}</span>}
                  {u.tenant_id && <span>Tenant: {u.tenant_id}</span>}
                  <span>solicitado em {formatDate(u.date_joined)}</span>
                </div>
              </div>
              <button
                className="btn btn-primary"
                style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: '0.35rem' }}
                onClick={() => onApprove(u.id)}
                disabled={isApprovePending}
              >
                <CheckCircle2 size={16} />
                Aprovar
              </button>
            </div>
          ))}
        </div>
      </SectionCard>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function Administration() {
  const [tab, setTab] = useState<Tab>('dashboard');
  const { user: currentUser } = useAuth();
  const queryClient = useQueryClient();

  const { data: members = [] } = useQuery({
    queryKey: ['tenant-members'],
    queryFn: fetchTenantMembers,
  });

  const { data: companies = [] } = useQuery({
    queryKey: ['tenantCompanies'],
    queryFn: fetchTenantCompanies,
  });

  const { data: pendingUsers = [], isLoading: pendingLoading } = useQuery({
    queryKey: ['pending-users'],
    queryFn: fetchPendingUsers,
    enabled: Boolean(currentUser?.is_superuser),
  });

  const { data: systemStats } = useQuery({
    queryKey: ['system-stats'],
    queryFn: fetchSystemStats,
    enabled: Boolean(currentUser?.is_superuser),
  });

  const { data: systemTenants = [], isLoading: tenantsLoading } = useQuery({
    queryKey: ['system-tenants'],
    queryFn: fetchSystemTenants,
    enabled: Boolean(currentUser?.is_superuser),
  });

  const { data: systemUsers = [], isLoading: usersLoading } = useQuery({
    queryKey: ['system-users'],
    queryFn: fetchSystemUsers,
    enabled: Boolean(currentUser?.is_superuser),
  });

  const approveMutation = useMutation({
    mutationFn: approveUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pending-users'] }),
  });

  const isSuperuser = Boolean(currentUser?.is_superuser);

  const tabs: { key: Tab; label: string; icon: LucideIcon }[] = [
    { key: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { key: 'listagens', label: 'Listagens', icon: Building2 },
    { key: 'cadastros', label: 'Cadastros Pendentes', icon: Users },
    { key: 'backup', label: 'Backup', icon: Database },
  ];

  return (
    <div className="animate-fade-in" style={{ display: 'grid', gap: 'var(--space-lg)' }}>
      {/* Tab bar */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--color-border)',
          marginBottom: 'var(--space-xs)',
          overflowX: 'auto',
          scrollbarWidth: 'none',
          msOverflowStyle: 'none',
          WebkitOverflowScrolling: 'touch',
        }}
      >
        {tabs.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.35rem',
              padding: '0.65rem 0.9rem',
              background: 'none',
              border: 'none',
              borderBottom: tab === key ? '2px solid var(--color-accent)' : '2px solid transparent',
              marginBottom: -1,
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: tab === key ? 700 : 500,
              color: tab === key ? 'var(--color-accent)' : 'var(--color-text-secondary)',
              transition: 'color 0.15s',
              whiteSpace: 'nowrap',
              minWidth: 0,
            }}
          >
            <Icon size={15} />
            {label}
            {key === 'cadastros' && (pendingUsers as PendingUser[]).length > 0 && (
              <span
                style={{
                  background: 'var(--color-accent)',
                  color: '#000',
                  borderRadius: 999,
                  padding: '1px 6px',
                  fontSize: '0.68rem',
                  fontWeight: 800,
                  lineHeight: 1.4,
                }}
              >
                {(pendingUsers as PendingUser[]).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'dashboard' && (
        <DashboardTab
          members={members}
          pendingUsers={pendingUsers}
          isSuperuser={isSuperuser}
          systemStats={systemStats}
          tenants={systemTenants}
          users={systemUsers}
          isLoadingTenants={tenantsLoading}
          isLoadingUsers={usersLoading}
          isLoadingPending={pendingLoading}
        />
      )}
      {tab === 'listagens' && (
        <ListagensTab
          tenants={systemTenants}
          users={systemUsers}
          pendingUsers={pendingUsers}
          isLoadingTenants={tenantsLoading}
          isLoadingUsers={usersLoading}
          isLoadingPending={pendingLoading}
          isSuperuser={isSuperuser}
          onApprove={(id) => approveMutation.mutate(id)}
          isApprovePending={approveMutation.isPending}
        />
      )}
      {tab === 'cadastros' && (
        <CadastrosTab
          pendingUsers={pendingUsers}
          isLoading={pendingLoading}
          isSuperuser={isSuperuser}
          onApprove={(id) => approveMutation.mutate(id)}
          isPending={approveMutation.isPending}
        />
      )}
      {tab === 'backup' && (
        <BackupTab isSuperuser={isSuperuser} />
      )}
      {false && <EmpresasTab companies={companies} />}
    </div>
  );
}
