import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  BarChart3,
  CreditCard,
  FileText,
  ShoppingCart,
  TrendingUp,
  Shield,
  ArrowRight,
  CheckCircle2,
} from 'lucide-react';

const features = [
  {
    icon: BarChart3,
    title: 'Dashboard em tempo real',
    desc: 'Visão consolidada de saldo, receitas, despesas e metas em um único painel.',
  },
  {
    icon: CreditCard,
    title: 'Contas e cartões',
    desc: 'Gerencie contas bancárias, dinheiro e cartões de crédito com limite mensal.',
  },
  {
    icon: FileText,
    title: 'Emissão de faturas',
    desc: 'Emita faturas de serviços com impostos retidos (ISS, PIS, COFINS) e numeração automática.',
  },
  {
    icon: ShoppingCart,
    title: 'Listas de compras',
    desc: 'Organize compras por lista, marque itens e acompanhe o orçamento em tempo real.',
  },
  {
    icon: TrendingUp,
    title: 'Investimentos',
    desc: 'Registre aportes e acompanhe a evolução da carteira de investimentos.',
  },
  {
    icon: Shield,
    title: 'Multi-tenant seguro',
    desc: 'Cada CPF ou CNPJ tem ambiente isolado. Nenhum dado vaza entre usuários.',
  },
];

const highlights = [
  'Funciona offline como PWA',
  'Isolamento total por CPF/CNPJ',
  'Categorias personalizáveis',
  'Relatório de fluxo mensal',
  'Suporte a Pessoa Física e Jurídica',
  'Acesso via mobile e desktop',
];

export default function Landing() {
  const { isLoggedIn, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && isLoggedIn) {
      navigate('/dashboard', { replace: true });
    }
  }, [isLoggedIn, isLoading, navigate]);

  if (isLoading || isLoggedIn) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: 'var(--color-bg-primary)', color: 'var(--color-text-primary)', fontFamily: 'var(--font-sans)' }}>

      {/* Nav */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        borderBottom: '1px solid var(--color-border)',
        background: 'rgba(0,0,0,0.85)',
        backdropFilter: 'blur(16px)',
        padding: '0 var(--space-lg)',
        height: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <span style={{ fontWeight: 800, fontSize: '1.2rem', letterSpacing: '-0.03em' }}>Nexo</span>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <Link to="/login" className="btn btn-secondary" style={{ padding: '0.45rem 1rem', fontSize: '0.875rem' }}>
            Entrar
          </Link>
          <Link to="/register" className="btn btn-primary" style={{ padding: '0.45rem 1rem', fontSize: '0.875rem' }}>
            Criar conta
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <section style={{
        maxWidth: 760, margin: '0 auto',
        padding: '6rem var(--space-lg) 4rem',
        textAlign: 'center',
      }}>
        <div style={{
          display: 'inline-block',
          fontSize: '0.75rem', fontWeight: 700, letterSpacing: '0.12em',
          color: 'var(--color-text-muted)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-full)',
          padding: '0.3rem 0.9rem',
          marginBottom: '1.5rem',
          textTransform: 'uppercase',
        }}>
          Gestão financeira pessoal e empresarial
        </div>

        <h1 style={{
          fontSize: 'clamp(2.2rem, 6vw, 3.6rem)',
          fontWeight: 800,
          letterSpacing: '-0.04em',
          lineHeight: 1.1,
          marginBottom: '1.25rem',
        }}>
          Controle total das
          <br />
          <span style={{ color: 'var(--color-text-muted)' }}>suas finanças</span>
        </h1>

        <p style={{
          fontSize: '1.05rem',
          color: 'var(--color-text-secondary)',
          lineHeight: 1.7,
          maxWidth: 520, margin: '0 auto 2.5rem',
        }}>
          Transações, contas, faturas, investimentos e listas de compras em um único lugar.
          Ambiente isolado por CPF ou CNPJ, acessível de qualquer dispositivo.
        </p>

        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/register" className="btn btn-primary btn-lg" style={{ gap: '0.5rem' }}>
            Começar gratuitamente <ArrowRight size={16} />
          </Link>
          <Link to="/login" className="btn btn-secondary btn-lg">
            Já tenho conta
          </Link>
        </div>
      </section>

      {/* Highlights strip */}
      <section style={{
        borderTop: '1px solid var(--color-border)',
        borderBottom: '1px solid var(--color-border)',
        background: 'var(--color-bg-secondary)',
        padding: '1.25rem var(--space-lg)',
        overflow: 'hidden',
      }}>
        <div style={{
          maxWidth: 900, margin: '0 auto',
          display: 'flex', flexWrap: 'wrap', gap: '0.5rem 1.5rem',
          justifyContent: 'center',
        }}>
          {highlights.map((h) => (
            <span key={h} style={{
              display: 'flex', alignItems: 'center', gap: '0.4rem',
              fontSize: '0.82rem', color: 'var(--color-text-secondary)',
            }}>
              <CheckCircle2 size={13} style={{ color: 'var(--color-success)', flexShrink: 0 }} />
              {h}
            </span>
          ))}
        </div>
      </section>

      {/* Features */}
      <section style={{ maxWidth: 960, margin: '0 auto', padding: '5rem var(--space-lg)' }}>
        <h2 style={{
          fontSize: 'clamp(1.5rem, 4vw, 2rem)',
          fontWeight: 700,
          letterSpacing: '-0.03em',
          textAlign: 'center',
          marginBottom: '0.75rem',
        }}>
          Tudo que você precisa
        </h2>
        <p style={{
          textAlign: 'center',
          color: 'var(--color-text-muted)',
          marginBottom: '3rem',
          fontSize: '0.95rem',
        }}>
          Módulos integrados para visão completa das suas finanças
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(270px, 1fr))',
          gap: '1px',
          background: 'var(--color-border)',
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-lg)',
          overflow: 'hidden',
        }}>
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} style={{
              background: 'var(--color-bg-card)',
              padding: '1.75rem',
              transition: 'background var(--transition-fast)',
            }}
              onMouseEnter={(e) => (e.currentTarget.style.background = 'var(--color-bg-elevated)')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'var(--color-bg-card)')}
            >
              <div style={{
                width: 40, height: 40,
                borderRadius: 'var(--radius-md)',
                background: 'var(--color-bg-elevated)',
                border: '1px solid var(--color-border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: '1rem',
              }}>
                <Icon size={18} style={{ color: 'var(--color-text-primary)' }} />
              </div>
              <h3 style={{ fontWeight: 700, fontSize: '0.95rem', marginBottom: '0.4rem' }}>{title}</h3>
              <p style={{ fontSize: '0.83rem', color: 'var(--color-text-muted)', lineHeight: 1.6 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section style={{
        maxWidth: 620, margin: '0 auto',
        padding: '0 var(--space-lg) 6rem',
        textAlign: 'center',
      }}>
        <div style={{
          border: '1px solid var(--color-border)',
          borderRadius: 'var(--radius-xl)',
          padding: '3rem 2rem',
          background: 'var(--color-bg-card)',
        }}>
          <h2 style={{
            fontSize: 'clamp(1.4rem, 4vw, 1.9rem)',
            fontWeight: 800,
            letterSpacing: '-0.03em',
            marginBottom: '0.75rem',
          }}>
            Comece agora
          </h2>
          <p style={{
            color: 'var(--color-text-muted)',
            fontSize: '0.9rem',
            lineHeight: 1.6,
            marginBottom: '1.75rem',
          }}>
            Crie sua conta com CPF ou CNPJ. Seu cadastro será validado pelo administrador e o acesso liberado em breve.
          </p>
          <Link to="/register" className="btn btn-primary btn-lg" style={{ width: '100%', justifyContent: 'center', gap: '0.5rem' }}>
            Solicitar acesso <ArrowRight size={16} />
          </Link>
          <p style={{ marginTop: '1rem', fontSize: '0.8rem', color: 'var(--color-text-muted)' }}>
            Já possui conta?{' '}
            <Link to="/login" style={{ color: 'var(--color-text-secondary)', fontWeight: 600 }}>
              Entrar
            </Link>
          </p>
        </div>
      </section>

      {/* Footer */}
      <footer style={{
        borderTop: '1px solid var(--color-border)',
        padding: '1.5rem var(--space-lg)',
        textAlign: 'center',
        color: 'var(--color-text-muted)',
        fontSize: '0.8rem',
      }}>
        © {new Date().getFullYear()} Nexo Gestão Financeira
      </footer>

    </div>
  );
}
