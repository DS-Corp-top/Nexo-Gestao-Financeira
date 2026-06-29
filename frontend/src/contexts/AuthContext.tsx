import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { fetchMe, logout as doLogout, type MeResponse } from '../api/auth';

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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<MeResponse['user'] | null>(null);
  const [tenant, setTenant] = useState<MeResponse['tenant'] | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const refresh = async () => {
    try {
      const data = await fetchMe();
      setUser(data.user);
      setTenant(data.tenant);
      return true;
    } catch {
      setUser(null);
      setTenant(null);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    refresh();
  }, []);

  const logout = () => {
    doLogout();
    localStorage.removeItem('nexo.activeTenantId');
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
