import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  ArrowLeftRight,
  Wallet,
  Tags,
  FileText,
  ShoppingCart,
  TrendingUp,
  Building2,
  LogOut,
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/transactions', icon: ArrowLeftRight, label: 'Transações' },
  { to: '/accounts', icon: Wallet, label: 'Contas' },
  { to: '/categories', icon: Tags, label: 'Categorias' },
  { to: '/invoices', icon: FileText, label: 'Faturas' },
  { to: '/shopping', icon: ShoppingCart, label: 'Compras' },
  { to: '/investments', icon: TrendingUp, label: 'Investimentos' },
];

export default function Sidebar({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
  const { tenant, logout } = useAuth();

  return (
    <>
      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="sidebar-overlay"
          onClick={onClose}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.5)',
            zIndex: 39,
            display: 'none',
          }}
        />
      )}

      <aside className={`app-sidebar ${isOpen ? 'open' : ''}`}>
        <div className="nav-brand">
          <span className="nav-brand-text">Nexo</span>
        </div>

        <nav className="nav-section" style={{ flex: 1 }}>
          <div className="nav-section-title">Menu</div>
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              end={to === '/'}
              className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
              onClick={onClose}
            >
              <Icon className="icon" size={20} />
              <span>{label}</span>
            </NavLink>
          ))}
        </nav>

        <div className="nav-section">
          <div className="nav-section-title">Empresa</div>
          <NavLink
            to="/settings/company"
            className={({ isActive }) => `nav-link ${isActive ? 'active' : ''}`}
            onClick={onClose}
          >
            <Building2 className="icon" size={20} />
            <span>{tenant?.name || 'Configurações'}</span>
          </NavLink>

          <button
            className="nav-link"
            onClick={logout}
            style={{ width: '100%', border: 'none', cursor: 'pointer', background: 'none', textAlign: 'left' }}
          >
            <LogOut className="icon" size={20} />
            <span>Sair</span>
          </button>
        </div>
      </aside>
    </>
  );
}
