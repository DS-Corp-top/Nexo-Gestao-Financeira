import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Power, PowerOff, Trash2, AlertTriangle } from 'lucide-react';
import { fetchSystemTenants, fetchSystemUsers, type SystemTenant, type SystemUser } from '../api/users';
import { useViewMode } from '../contexts/ViewModeContext';
import {
  fetchAllCompanies,
  toggleTenantStatus,
  deleteTenant,
  toggleCompanyStatus,
  deleteCompany,
  toggleUserStatus,
  deleteUser,
  type AllCompanyItem
} from '../api/system';

export function GerenciamentoTab() {
  const { isMobile } = useViewMode();
  const queryClient = useQueryClient();
  const [activeSection, setActiveSection] = useState<'tenants' | 'companies' | 'users'>('tenants');
  const [confirmModal, setConfirmModal] = useState<{
    isOpen: boolean;
    title: string;
    content: string;
    onConfirm: () => void;
  }>({ isOpen: false, title: '', content: '', onConfirm: () => {} });

  const { data: tenants = [], isLoading: loadingTenants } = useQuery({
    queryKey: ['system-tenants'],
    queryFn: fetchSystemTenants,
  });

  const { data: companies = [], isLoading: loadingCompanies } = useQuery({
    queryKey: ['system-all-companies'],
    queryFn: fetchAllCompanies,
  });

  const { data: users = [], isLoading: loadingUsers } = useQuery({
    queryKey: ['system-users'],
    queryFn: fetchSystemUsers,
  });

  // Mutations
  const toggleTenant = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) => toggleTenantStatus(id, is_active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['system-tenants'] }),
  });
  const delTenant = useMutation({
    mutationFn: deleteTenant,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['system-tenants'] });
      queryClient.invalidateQueries({ queryKey: ['system-all-companies'] });
      queryClient.invalidateQueries({ queryKey: ['system-users'] });
    },
  });

  const toggleCompany = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) => toggleCompanyStatus(id, is_active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['system-all-companies'] }),
  });
  const delCompany = useMutation({
    mutationFn: deleteCompany,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['system-all-companies'] }),
  });

  const toggleUser = useMutation({
    mutationFn: ({ id, is_active }: { id: number; is_active: boolean }) => toggleUserStatus(id, is_active),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['system-users'] }),
  });
  const delUser = useMutation({
    mutationFn: deleteUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['system-users'] }),
  });

  const openModal = (title: string, content: string, onConfirm: () => void) => {
    setConfirmModal({ isOpen: true, title, content, onConfirm });
  };

  const handleToggleTenant = (t: SystemTenant) => {
    openModal(
      'Confirmar ação',
      `Deseja realmente ${t.is_active ? 'inativar' : 'ativar'} o tenant ${t.name}?`,
      () => {
        toggleTenant.mutate({ id: t.id, is_active: !t.is_active });
        setConfirmModal(m => ({ ...m, isOpen: false }));
      }
    );
  };
  const handleDeleteTenant = (t: SystemTenant) => {
    openModal(
      'ATENÇÃO CRÍTICA!',
      `Apagar o tenant "${t.name}" apagará TODAS as empresas, usuários e lançamentos financeiros atrelados a ele de forma IRREVERSÍVEL.\n\nTem certeza absoluta?`,
      () => {
        delTenant.mutate(t.id);
        setConfirmModal(m => ({ ...m, isOpen: false }));
      }
    );
  };

  const handleToggleCompany = (c: AllCompanyItem) => {
    openModal(
      'Confirmar ação',
      `Deseja realmente ${c.is_active ? 'inativar' : 'ativar'} a empresa ${c.name}?`,
      () => {
        toggleCompany.mutate({ id: c.id, is_active: !c.is_active });
        setConfirmModal(m => ({ ...m, isOpen: false }));
      }
    );
  };
  const handleDeleteCompany = (c: AllCompanyItem) => {
    openModal(
      'Atenção!',
      `Apagar a empresa "${c.name}" apagará todos os seus lançamentos financeiros.\n\nTem certeza absoluta?`,
      () => {
        delCompany.mutate(c.id);
        setConfirmModal(m => ({ ...m, isOpen: false }));
      }
    );
  };

  const handleToggleUser = (u: SystemUser) => {
    if (u.is_superuser) {
      alert("Não é possível inativar superusuários.");
      return;
    }
    openModal(
      'Confirmar ação',
      `Deseja realmente ${u.is_active ? 'inativar' : 'ativar'} o usuário ${u.first_name || u.email}?`,
      () => {
        toggleUser.mutate({ id: u.id, is_active: !u.is_active });
        setConfirmModal(m => ({ ...m, isOpen: false }));
      }
    );
  };
  const handleDeleteUser = (u: SystemUser) => {
    if (u.is_superuser) {
      alert("Não é possível apagar superusuários.");
      return;
    }
    openModal(
      'Atenção!',
      `Deseja realmente apagar o usuário ${u.first_name || u.email} permanentemente?`,
      () => {
        delUser.mutate(u.id);
        setConfirmModal(m => ({ ...m, isOpen: false }));
      }
    );
  };

  const btnStyle = { padding: '4px 8px', fontSize: '0.75rem' };
  const rowStyle = {
    display: 'flex',
    flexDirection: isMobile ? 'column' as const : 'row' as const,
    justifyContent: 'space-between',
    alignItems: isMobile ? 'stretch' as const : 'center' as const,
    gap: isMobile ? '10px' : 0,
    padding: '10px 12px',
    border: '1px solid var(--color-border)',
    borderRadius: 'var(--radius-md)',
    background: 'var(--color-bg-elevated)',
    marginBottom: '8px',
  };
  const actionsStyle = { display: 'flex', gap: '0.5rem', flexWrap: 'wrap' as const };

  return (
    <div className="card" style={{ padding: isMobile ? '1rem' : '1.5rem' }}>
      <h2 style={{ fontSize: '1.25rem', fontWeight: 700, marginBottom: '1.5rem' }}>Gerenciamento do Sistema</h2>

      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap', marginBottom: '1.5rem', borderBottom: '1px solid var(--color-border)', paddingBottom: '0.5rem' }}>
        <button className={`btn ${activeSection === 'tenants' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveSection('tenants')}>Tenants</button>
        <button className={`btn ${activeSection === 'companies' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveSection('companies')}>Empresas</button>
        <button className={`btn ${activeSection === 'users' ? 'btn-primary' : 'btn-outline'}`} onClick={() => setActiveSection('users')}>Usuários</button>
      </div>

      {activeSection === 'tenants' && (
        <div>
          {loadingTenants && <p>Carregando tenants...</p>}
          {tenants.map(t => (
            <div key={t.id} style={rowStyle}>
              <div>
                <div style={{ fontWeight: 600 }}>{t.name} <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>({t.slug})</span></div>
                <div style={{ fontSize: '0.8rem', color: t.is_active ? 'var(--color-success)' : 'var(--color-danger)' }}>
                  {t.is_active ? 'Ativo' : 'Inativo'}
                </div>
              </div>
              <div style={actionsStyle}>
                <button className={`btn ${t.is_active ? 'btn-outline' : 'btn-success'}`} style={btnStyle} onClick={() => handleToggleTenant(t)}>
                  {t.is_active ? <PowerOff size={14}/> : <Power size={14}/>} {t.is_active ? 'Inativar' : 'Ativar'}
                </button>
                <button className="btn btn-danger" style={btnStyle} onClick={() => handleDeleteTenant(t)}>
                  <Trash2 size={14}/> Apagar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeSection === 'companies' && (
        <div>
          {loadingCompanies && <p>Carregando empresas...</p>}
          {companies.map(c => (
            <div key={c.id} style={rowStyle}>
              <div>
                <div style={{ fontWeight: 600 }}>{c.name}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>Tenant: {c.tenant_name} | Doc: {c.document || 'N/A'}</div>
                <div style={{ fontSize: '0.8rem', color: c.is_active ? 'var(--color-success)' : 'var(--color-danger)' }}>
                  {c.is_active ? 'Ativo' : 'Inativo'}
                </div>
              </div>
              <div style={actionsStyle}>
                <button className={`btn ${c.is_active ? 'btn-outline' : 'btn-success'}`} style={btnStyle} onClick={() => handleToggleCompany(c)}>
                  {c.is_active ? <PowerOff size={14}/> : <Power size={14}/>} {c.is_active ? 'Inativar' : 'Ativar'}
                </button>
                <button className="btn btn-danger" style={btnStyle} onClick={() => handleDeleteCompany(c)}>
                  <Trash2 size={14}/> Apagar
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {activeSection === 'users' && (
        <div>
          {loadingUsers && <p>Carregando usuários...</p>}
          {users.map(u => (
            <div key={u.id} style={rowStyle}>
              <div>
                <div style={{ fontWeight: 600 }}>{u.first_name} {u.last_name} {u.is_superuser ? <span className="badge badge-success" style={{ fontSize: '0.6rem' }}>Superuser</span> : null}</div>
                <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>{u.email}</div>
                <div style={{ fontSize: '0.8rem', color: u.is_active ? 'var(--color-success)' : 'var(--color-danger)' }}>
                  {u.is_active ? 'Ativo' : 'Inativo'}
                </div>
              </div>
              <div style={actionsStyle}>
                {!u.is_superuser && (
                  <>
                    <button className={`btn ${u.is_active ? 'btn-outline' : 'btn-success'}`} style={btnStyle} onClick={() => handleToggleUser(u)}>
                      {u.is_active ? <PowerOff size={14}/> : <Power size={14}/>} {u.is_active ? 'Inativar' : 'Ativar'}
                    </button>
                    <button className="btn btn-danger" style={btnStyle} onClick={() => handleDeleteUser(u)}>
                      <Trash2 size={14}/> Apagar
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {confirmModal.isOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, padding: '1rem', animation: 'fadeIn 0.2s ease' }}>
          <div className="card" style={{ maxWidth: 440, width: '100%', padding: '1.75rem', animation: 'slideUp 0.2s ease' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '1rem' }}>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: 'rgba(255,107,107,0.12)', border: '1px solid rgba(255,107,107,0.25)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <AlertTriangle size={18} style={{ color: '#ff6b6b' }} />
              </div>
              <h3 style={{ fontSize: '1.05rem', fontWeight: 600, color: 'var(--color-text)' }}>
                {confirmModal.title}
              </h3>
            </div>
            <div style={{ fontSize: '0.92rem', color: 'var(--color-text-secondary)', lineHeight: 1.5, marginBottom: '1.5rem', whiteSpace: 'pre-wrap' }}>
              {confirmModal.content}
            </div>
            <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'flex-end' }}>
              <button className="btn" onClick={() => setConfirmModal(m => ({ ...m, isOpen: false }))}>Cancelar</button>
              <button className="btn" style={{ background: '#ff6b6b', color: '#fff', border: 'none' }} onClick={confirmModal.onConfirm}>
                Confirmar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
