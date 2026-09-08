import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { AUTH_SESSION_HINT_KEY, fetchMe, logout as doLogout, type MeResponse } from '../api/auth';

interface AuthContextType {
  user: MeResponse['user'] | null;
  tenant: MeResponse['tenant'] | null;
  isLoading: boolean;
  isLoggedIn: boolean;
  refresh: () => Promise<boolean>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  tenant: null,
  isLoading: true,
  isLoggedIn: false,
  refresh: async () => false,
  logout: () => {},
});

const PUBLIC_PATHS = new Set(['/', '/login', '/register', '/forgot-password']);

function hasSessionHint() {
  return localStorage.getItem(AUTH_SESSION_HINT_KEY) === 'true';
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse['user'] | null>(null);
  const [tenant, setTenant] = useState<MeResponse['tenant'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const initialized = useRef(false);

  const refresh = async () => {
    try {
      const data = await fetchMe();
      setUser(data.user);
      setTenant(data.tenant);
      return true;
    } catch {
      setUser(null);
      setTenant(null);
      localStorage.removeItem(AUTH_SESSION_HINT_KEY);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    if (PUBLIC_PATHS.has(window.location.pathname) && !hasSessionHint()) {
      setIsLoading(false);
      return;
    }

    refresh();
  }, []);

  const logout = () => {
    doLogout();
    localStorage.removeItem('nexo.activeTenantId');
    localStorage.removeItem(AUTH_SESSION_HINT_KEY);
    setUser(null);
    setTenant(null);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        tenant,
        isLoading,
        isLoggedIn: !!user,
        refresh,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}
