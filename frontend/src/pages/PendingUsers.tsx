import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Users } from 'lucide-react';
import { approveUser, fetchPendingUsers, type PendingUser } from '../api/users';

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

export default function PendingUsers() {
  const queryClient = useQueryClient();
  const { data: users, isLoading } = useQuery({
    queryKey: ['pending-users'],
    queryFn: fetchPendingUsers,
  });

  const approveMutation = useMutation({
    mutationFn: approveUser,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pending-users'] }),
  });

  return (
    <div className="animate-fade-in">
      <div className="card" style={{ padding: 0 }}>
        {isLoading ? (
          <div style={{ padding: 'var(--space-xl)', display: 'flex', justifyContent: 'center' }}>
            <span className="spinner" />
          </div>
        ) : users?.length === 0 ? (
          <div className="empty-state" style={{ padding: 'var(--space-2xl)' }}>
            <Users className="empty-state-icon" />
            <h3 className="empty-state-title">Nenhum cadastro pendente</h3>
            <p className="empty-state-text">Todos os cadastros foram aprovados.</p>
          </div>
        ) : (
          <div>
            {users?.map((user: PendingUser) => (
              <div
                key={user.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '1rem',
                  padding: '1rem 1.25rem',
                  borderBottom: '1px solid var(--color-border)',
                }}
              >
                {/* Avatar inicial */}
                <div style={{
                  width: 40, height: 40, borderRadius: '50%',
                  background: 'var(--color-bg-elevated)',
                  border: '1px solid var(--color-border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontWeight: 700, fontSize: '1rem', color: 'var(--color-accent)',
                  flexShrink: 0,
                }}>
                  {(user.first_name || user.email || 'U')[0].toUpperCase()}
                </div>

                {/* Info */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', marginBottom: 2 }}>
                    <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>
                      {user.first_name
                        ? `${user.first_name}${user.last_name ? ' ' + user.last_name : ''}`
                        : user.username}
                    </span>
                    <PersonBadge type={user.person_type} />
                  </div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--color-text-secondary)' }}>{user.email}</div>
                  <div style={{ display: 'flex', gap: '1rem', marginTop: 4, flexWrap: 'wrap' }}>
                    {user.document && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        {user.person_type === 'pj' ? 'CNPJ' : 'CPF'}: {formatDoc(user.document)}
                      </span>
                    )}
                    {user.tenant_name && (
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                        Ambiente: {user.tenant_name}
                      </span>
                    )}
                    <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)' }}>
                      Solicitado em {formatDate(user.date_joined)}
                    </span>
                  </div>
                </div>

                {/* Ação */}
                <button
                  className="btn btn-primary"
                  style={{ flexShrink: 0 }}
                  onClick={() => approveMutation.mutate(user.id)}
                  disabled={approveMutation.isPending}
                >
                  <CheckCircle2 size={16} /> Aprovar
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
