import { useAuth } from '../contexts/AuthContext';

export function useIsAdmin(): boolean {
  const { user, tenant } = useAuth();
  return Boolean(user?.is_superuser || tenant?.role === 'owner' || tenant?.role === 'admin');
}
