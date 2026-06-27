import { useState, useRef, useEffect } from 'react';
import { Menu, Building2, LogOut } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface HeaderProps {
  title: string;
  onMenuClick: () => void;
  isMobile?: boolean;
}

export default function Header({ title, onMenuClick, isMobile = false }: HeaderProps) {
  const { user, tenant, logout } = useAuth();
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    if (menuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpen]);

  return (
    <header className="app-header">
      {!isMobile && (
        <button
          className="btn-ghost btn-icon mobile-menu-btn"
          onClick={onMenuClick}
          style={{ marginRight: 'var(--space-md)' }}
        >
          <Menu size={22} />
        </button>
      )}

      <h1 style={{ fontSize: '1.125rem', fontWeight: 700, flex: 1 }}>{title}</h1>


      {user && (
        <div ref={menuRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setMenuOpen((v) => !v)}
            style={{
              width: 32,
              height: 32,
              borderRadius: 'var(--radius-full)',
              background: 'var(--color-accent-muted)',
              color: 'var(--color-accent)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.8rem',
              fontWeight: 700,
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {(user.first_name || user.username || 'U')[0].toUpperCase()}
          </button>

          {menuOpen && (
            <div style={{
              position: 'absolute',
              top: 'calc(100% + 0.5rem)',
              right: 0,
              minWidth: '11.25rem',
              maxWidth: 'calc(100vw - 1.5rem)',
              background: 'var(--color-bg-card)',
              border: '1px solid var(--color-border-hover)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: '0 12px 30px rgba(0,0,0,0.6)',
              zIndex: 100,
              overflow: 'hidden',
            }}>
              <div style={{
                padding: '0.4rem 0.72rem 0.25rem',
                fontSize: '0.64rem',
                fontWeight: 700,
                letterSpacing: '0.06em',
                textTransform: 'uppercase',
                color: 'var(--color-text-secondary)',
              }}>
                Empresa
              </div>

              <NavLink
                to="/settings/company"
                onClick={() => setMenuOpen(false)}
                style={({ isActive }) => ({
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.55rem',
                  padding: '0.62rem 0.72rem',
                  fontSize: '0.82rem',
                  lineHeight: 1.25,
                  color: isActive ? 'var(--color-accent)' : 'var(--color-text-primary)',
                  background: isActive ? 'var(--color-accent-muted)' : 'transparent',
                  textDecoration: 'none',
                  transition: 'background 0.15s',
                })}
              >
                <Building2 size={15} />
                <span style={{ minWidth: 0, overflowWrap: 'anywhere' }}>{tenant?.name || 'Configurações'}</span>
              </NavLink>

              <div style={{ height: '1px', background: 'var(--color-border)', margin: '0.25rem 0' }} />

              <button
                onClick={() => { setMenuOpen(false); logout(); }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.55rem',
                  width: '100%',
                  padding: '0.62rem 0.72rem',
                  fontSize: '0.82rem',
                  lineHeight: 1.25,
                  color: 'var(--color-text-primary)',
                  background: 'none',
                  border: 'none',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-surface-hover, rgba(255,255,255,0.05))')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
              >
                <LogOut size={15} />
                <span>Sair</span>
              </button>
            </div>
          )}
        </div>
      )}

      <style>{`
        .mobile-menu-btn { display: none; }
        @media (max-width: 768px) {
          .mobile-menu-btn { display: flex; }
          .view-mode-label { display: none; }
        }
      `}</style>
    </header>
  );
}
