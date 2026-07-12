import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { CloudUpload, FileBarChart } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

export default function BottomNav() {
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const location = useLocation();
  const { user, tenant } = useAuth();
  const canManageTenantSettings = Boolean(user?.is_superuser || tenant?.role === 'owner' || tenant?.role === 'admin');
  const canManageSystem = Boolean(user?.is_superuser);
  const isPJTenant = tenant?.person_type === 'pj';

  // Se for Desktop, o CSS vai ocultar essa barra automaticamente usando .txn-bottom-nav { display: none }
  return (
    <nav className="txn-bottom-nav">
      <Link to="/dashboard" className={`txn-tab-link ${location.pathname === '/dashboard' ? 'txn-tab-active' : ''}`}>
        <span className="txn-tab-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 10.5L12 3l9 7.5"/><path d="M5 9.5V21h14V9.5"/></svg>
        </span>
        <span>Principal</span>
      </Link>

      <div className="fab-speed-dial">
        <Link to="/transactions/new" className="txn-center-fab" aria-label="Nova transação">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="12" y1="5" x2="12" y2="19"></line>
            <line x1="5" y1="12" x2="19" y2="12"></line>
          </svg>
        </Link>
      </div>

      <div className="txn-more-menu-wrapper">
        <button 
          type="button" 
          className={`txn-tab-link txn-more-trigger ${isMoreMenuOpen ? 'txn-more-open' : ''}`}
          onClick={() => setIsMoreMenuOpen(!isMoreMenuOpen)}
          style={{
            appearance: 'none',
            WebkitAppearance: 'none',
            background: isMoreMenuOpen ? 'rgba(255, 255, 255, 0.08)' : 'transparent',
            border: isMoreMenuOpen ? '1px solid rgba(255, 255, 255, 0.22)' : '1px solid transparent',
            color: 'rgba(255, 255, 255, 0.86)',
            boxShadow: 'none',
          }}
        >
          <span className="txn-tab-icon">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
              <circle cx="5" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="19" cy="12" r="1.6"/>
            </svg>
          </span>
          <span>Menu</span>
        </button>

        {isMoreMenuOpen && (
          <div className="txn-bottom-more-panel">
            <Link to="/transactions" className={`txn-more-link ${location.pathname.startsWith('/transactions') ? 'txn-more-active' : ''}`} onClick={() => setIsMoreMenuOpen(false)}>
              <span className="txn-more-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M5 7h14"/><path d="M5 12h14"/><path d="M5 17h14"/></svg></span>
              Financeiro
            </Link>
            <Link to="/investments" className={`txn-more-link ${location.pathname.startsWith('/investments') ? 'txn-more-active' : ''}`} onClick={() => setIsMoreMenuOpen(false)}>
              <span className="txn-more-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19V5"/><path d="M4 19h16"/><path d="M8 14l4-5 4 3 4-6"/></svg></span>
              Investimentos
            </Link>
            {canManageSystem && isPJTenant && (
              <Link to="/invoices" className={`txn-more-link ${location.pathname.startsWith('/invoices') ? 'txn-more-active' : ''}`} onClick={() => setIsMoreMenuOpen(false)}>
                <span className="txn-more-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8"/><path d="M8 12h8"/><path d="M8 16h5"/></svg></span>
                Fatura de Serviços
              </Link>
            )}
            <Link to="/reports" className={`txn-more-link ${location.pathname.startsWith('/reports') ? 'txn-more-active' : ''}`} onClick={() => setIsMoreMenuOpen(false)}>
              <span className="txn-more-icon"><FileBarChart size={20} /></span>
              Relatórios
            </Link>
            <Link to="/shopping" className={`txn-more-link ${location.pathname.startsWith('/shopping') ? 'txn-more-active' : ''}`} onClick={() => setIsMoreMenuOpen(false)}>
              <span className="txn-more-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M3 5h2l2.2 10h10.8l2-7H8.2"/><circle cx="10" cy="19" r="1.6"/><circle cx="17" cy="19" r="1.6"/></svg></span>
              Lista de Compras
            </Link>
            <Link to="/todos" className={`txn-more-link ${location.pathname.startsWith('/todos') ? 'txn-more-active' : ''}`} onClick={() => setIsMoreMenuOpen(false)}>
              <span className="txn-more-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="4" y="4" width="16" height="16" rx="2"/><path d="M8 9h8"/><path d="M8 14h5"/></svg></span>
              Tarefas
            </Link>
            <Link to="/notes" className={`txn-more-link ${location.pathname.startsWith('/notes') ? 'txn-more-active' : ''}`} onClick={() => setIsMoreMenuOpen(false)}>
              <span className="txn-more-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M15.5 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8.5L15.5 3z"/><polyline points="15 3 15 9 21 9"/></svg></span>
              Anotações
            </Link>
            <Link to="/drive" className={`txn-more-link ${location.pathname.startsWith('/drive') ? 'txn-more-active' : ''}`} onClick={() => setIsMoreMenuOpen(false)}>
              <span className="txn-more-icon"><CloudUpload size={20} /></span>
              Drive
            </Link>
            {canManageTenantSettings && (
              <Link to="/settings/company" className={`txn-more-link ${location.pathname.startsWith('/settings') ? 'txn-more-active' : ''}`} onClick={() => setIsMoreMenuOpen(false)}>
                <span className="txn-more-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg></span>
                Configurações
              </Link>
            )}
            {canManageSystem && (
              <Link to="/admin" className={`txn-more-link ${location.pathname === '/admin' ? 'txn-more-active' : ''}`} onClick={() => setIsMoreMenuOpen(false)}>
                <span className="txn-more-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg></span>
                Administração
              </Link>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
