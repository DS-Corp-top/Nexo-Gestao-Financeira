import { useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';

const pageTitles: Record<string, string> = {
  '/': 'Dashboard',
  '/transactions': 'Transações',
  '/accounts': 'Contas',
  '/categories': 'Categorias',
  '/invoices': 'Faturas',
  '/shopping': 'Compras',
  '/investments': 'Investimentos',
  '/settings/company': 'Empresa',
};

export default function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();

  const title = pageTitles[location.pathname] || 'Nexo';

  return (
    <div className="app-layout">
      <Sidebar isOpen={sidebarOpen} onClose={() => setSidebarOpen(false)} />
      <div className="app-main">
        <Header title={title} onMenuClick={() => setSidebarOpen((prev) => !prev)} />
        <main className="app-content animate-fade-in" key={location.pathname}>
          <Outlet />
        </main>
      </div>
    </div>
  );
}
