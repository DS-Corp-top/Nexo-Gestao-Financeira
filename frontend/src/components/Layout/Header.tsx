import { Menu } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';

interface HeaderProps {
  title: string;
  onMenuClick: () => void;
}

export default function Header({ title, onMenuClick }: HeaderProps) {
  const { user } = useAuth();

  return (
    <header className="app-header">
      <button
        className="btn-ghost btn-icon mobile-menu-btn"
        onClick={onMenuClick}
        style={{ marginRight: 'var(--space-md)' }}
      >
        <Menu size={22} />
      </button>

      <h1 style={{ fontSize: '1.125rem', fontWeight: 700, flex: 1 }}>{title}</h1>

      {user && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-sm)' }}>
          <div
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
            }}
          >
            {(user.first_name || user.username || 'U')[0].toUpperCase()}
          </div>
        </div>
      )}

      <style>{`
        .mobile-menu-btn { display: none; }
        @media (max-width: 768px) {
          .mobile-menu-btn { display: flex; }
        }
      `}</style>
    </header>
  );
}
