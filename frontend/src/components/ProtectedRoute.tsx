import { Navigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import type { ReactNode } from 'react';

export default function ProtectedRoute({
  children,
  requireSuperuser = false,
  requireAdmin = false,
}: {
  children: ReactNode;
  requireSuperuser?: boolean;
  requireAdmin?: boolean;
}) {
  const { isLoggedIn, isLoading, user, tenant } = useAuth();

  if (isLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  if (!isLoggedIn) {
    return <Navigate to="/login" replace />;
  }

  if (requireSuperuser && !user?.is_superuser) {
    return <Navigate to="/dashboard" replace />;
  }

  const isAdmin = user?.is_superuser || tenant?.role === 'owner' || tenant?.role === 'admin';
  if (requireAdmin && !isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
