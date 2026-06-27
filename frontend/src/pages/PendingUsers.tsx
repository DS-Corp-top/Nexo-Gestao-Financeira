import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Users } from 'lucide-react';
import { approveUser, fetchPendingUsers } from '../api/users';

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
            <h3 className="empty-state-title">Nenhum usuário pendente</h3>
          </div>
        ) : (
          <div className="table-wrapper" style={{ border: 'none', borderRadius: 0 }}>
            <table className="table">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>E-mail</th>
                  <th style={{ textAlign: 'center' }}>Ação</th>
                </tr>
              </thead>
              <tbody>
                {users?.map((user) => (
                  <tr key={user.id}>
                    <td>{user.username}</td>
                    <td>{user.email || '-'}</td>
                    <td style={{ textAlign: 'center' }}>
                      <button className="btn btn-primary" onClick={() => approveMutation.mutate(user.id)} disabled={approveMutation.isPending}>
                        <CheckCircle2 size={16} /> Aprovar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
