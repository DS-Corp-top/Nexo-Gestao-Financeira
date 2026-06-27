import { useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import {
  ArrowRight,
  BarChart3,
  CreditCard,
  FileText,
  ShoppingCart,
  TrendingUp,
  Shield,
  Smartphone,
  Zap,
} from 'lucide-react';

/* ── App preview mockup ─────────────────────────── */
function AppPreview() {
  const txns = [
    { label: 'Supermercado', cat: 'Alimentação', amount: '- R$ 320,00', neg: true },
    { label: 'Freelance Dev', cat: 'Receita', amount: '+ R$ 4.500,00', neg: false },
    { label: 'Conta de luz', cat: 'Moradia', amount: '- R$ 187,00', neg: true },
    { label: 'Dividendos', cat: 'Investimentos', amount: '+ R$ 640,00', neg: false },
  ];

  return (
    <div style={{
      width: '100%', maxWidth: 480,
      background: '#0a0a0a',
      border: '1px solid rgba(255,255,255,0.1)',
      borderRadius: 20,
      overflow: 'hidden',
      boxShadow: '0 40px 80px -20px rgba(0,0,0,0.9), 0 0 0 1px rgba(255,255,255,0.05)',
    }}>
      {/* top bar */}
      <div style={{
        background: '#050505',
        padding: '12px 16px',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        display: 'flex', alignItems: 'center', gap: 8,
      }}>
        <div style={{ display: 'flex', gap: 6 }}>
          {['#ff5f57','#ffbd2e','#28c840'].map(c => (
            <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />
          ))}
        </div>
        <div style={{
          flex: 1, textAlign: 'center', fontSize: '0.72rem',
          color: 'rgba(255,255,255,0.3)', letterSpacing: '0.05em',
        }}>
          nexo · dashboard
        </div>
      </div>

      {/* balance card */}
      <div style={{ padding: '20px 20px 16px' }}>
        <p style={{ fontSize: '0.7rem', color: 'rgba(255,255,255,0.4)', marginBottom: 4, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
          Saldo atual
        </p>
        <p style={{ fontSize: '2rem', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}>
          R$ 12.840<span style={{ fontSize: '1.1rem', color: 'rgba(255,255,255,0.5)' }}>,00</span>
        </p>

        {/* income/expense bars */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 16 }}>
          {[
            { label: 'Receitas', val: 'R$ 7.140,00', pct: '72%', color: '#34d399' },
            { label: 'Despesas', val: 'R$ 2.890,00', pct: '42%', color: '#fb7185' },
          ].map(({ label, val, pct, color }) => (
            <div key={label} style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 10, padding: '10px 12px',
            }}>
              <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.4)', marginBottom: 4 }}>{label}</p>
              <p style={{ fontSize: '0.85rem', fontWeight: 700, color }}>{val}</p>
              <div style={{ height: 3, background: 'rgba(255,255,255,0.08)', borderRadius: 2, marginTop: 8 }}>
                <div style={{ height: '100%', width: pct, background: color, borderRadius: 2, opacity: 0.7 }} />
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* transactions */}
      <div style={{ borderTop: '1px solid rgba(255,255,255,0.07)' }}>
        <p style={{
          padding: '10px 20px 6px',
          fontSize: '0.68rem', fontWeight: 700,
          color: 'rgba(255,255,255,0.3)',
          letterSpacing: '0.08em', textTransform: 'uppercase',
        }}>
          Últimas transações
        </p>
        {txns.map((t) => (
          <div key={t.label} style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 20px',
            borderBottom: '1px solid rgba(255,255,255,0.04)',
          }}>
            <div>
              <p style={{ fontSize: '0.78rem', fontWeight: 600 }}>{t.label}</p>
              <p style={{ fontSize: '0.65rem', color: 'rgba(255,255,255,0.35)' }}>{t.cat}</p>
            </div>
            <span style={{
              fontSize: '0.78rem', fontWeight: 700,
              color: t.neg ? '#fb7185' : '#34d399',
            }}>
              {t.amount}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ── Feature cards ──────────────────────────────── */
const features = [
  { icon: BarChart3,   title: 'Dashboard',         desc: 'Saldo, receitas, despesas e metas consolidados em tempo real.' },
  { icon: CreditCard,  title: 'Contas e cartões',  desc: 'Bancárias, dinheiro e cartões com limite e fatura mensais.' },
  { icon: FileText,    title: 'Emissão de faturas', desc: 'NFS-e com ISS, PIS, COFINS, IR, CSLL e INSS. Numeração automática.' },
  { icon: ShoppingCart,title: 'Listas de compras',  desc: 'Organize por lista, marque itens e acompanhe o total em tempo real.' },
  { icon: TrendingUp,  title: 'Investimentos',      desc: 'Registre aportes e acompanhe a evolução da sua carteira.' },
  { icon: Shield,      title: 'Dados isolados',     desc: 'Cada CPF/CNPJ tem ambiente próprio. Zero vazamento entre usuários.' },
  { icon: Smartphone,  title: 'PWA offline',        desc: 'Instale no celular e use mesmo sem internet. Sincroniza ao voltar.' },
  { icon: Zap,         title: 'PF e PJ',            desc: 'Suporte a Pessoa Física e Jurídica com validação de CPF e CNPJ.' },
];

/* ── Main component ─────────────────────────────── */
export default function Landing() {
  const { isLoggedIn, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && isLoggedIn) navigate('/dashboard', { replace: true });
  }, [isLoggedIn, isLoading, navigate]);

  if (isLoading || isLoggedIn) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
        <div className="spinner" style={{ width: 40, height: 40 }} />
      </div>
    );
  }

  return (
    <div style={{ minHeight: '100vh', background: '#000', color: '#fff', fontFamily: 'var(--font-sans)', overflowX: 'hidden' }}>

      {/* ── Sticky Nav ── */}
      <nav style={{
        position: 'sticky', top: 0, zIndex: 50,
        height: 60,
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '0 clamp(1rem, 4vw, 2.5rem)',
        background: 'rgba(0,0,0,0.8)',
        backdropFilter: 'blur(20px)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
      }}>
        <span style={{ fontWeight: 900, fontSize: '1.25rem', letterSpacing: '-0.04em' }}>nexo</span>
        <div style={{ display: 'flex', gap: '0.6rem' }}>
          <Link to="/login" className="btn btn-secondary" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
            Entrar
          </Link>
          <Link to="/register" className="btn btn-primary" style={{ padding: '0.4rem 1rem', fontSize: '0.85rem' }}>
            Criar conta
          </Link>
        </div>
      </nav>

      {/* ── Hero ── */}
      <section style={{ position: 'relative', overflow: 'hidden' }}>

        {/* background glow blobs */}
        <div aria-hidden style={{
          position: 'absolute', inset: 0, pointerEvents: 'none', zIndex: 0,
        }}>
          <div style={{
            position: 'absolute', top: '-20%', left: '50%', transform: 'translateX(-50%)',
            width: '120%', height: '70%',
            background: 'radial-gradient(ellipse at center, rgba(168,85,247,0.12) 0%, transparent 60%)',
          }} />
          <div style={{
            position: 'absolute', top: '30%', right: '-10%',
            width: 400, height: 400,
            background: 'radial-gradient(circle, rgba(96,165,250,0.07) 0%, transparent 60%)',
          }} />
        </div>

        <div style={{
          position: 'relative', zIndex: 1,
          maxWidth: 900, margin: '0 auto',
          padding: 'clamp(4rem, 10vw, 7rem) clamp(1rem, 4vw, 2.5rem) clamp(3rem, 6vw, 5rem)',
          textAlign: 'center',
        }}>

          {/* badge */}
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.4rem',
            padding: '0.28rem 0.85rem',
            border: '1px solid rgba(168,85,247,0.35)',
            borderRadius: 999,
            background: 'rgba(168,85,247,0.08)',
            fontSize: '0.72rem', fontWeight: 700,
            color: 'rgba(216,180,254,0.9)',
            letterSpacing: '0.06em', textTransform: 'uppercase',
            marginBottom: '2rem',
          }}>
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#a855f7', flexShrink: 0 }} />
            Gestão financeira pessoal e empresarial
          </div>

          {/* headline */}
          <h1 style={{
            fontSize: 'clamp(2.6rem, 7vw, 4.5rem)',
            fontWeight: 900,
            letterSpacing: '-0.05em',
            lineHeight: 1.0,
            marginBottom: '1.5rem',
          }}>
            Suas finanças,
            <br />
            <span style={{
              background: 'linear-gradient(135deg, #fff 30%, rgba(255,255,255,0.4) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}>
              no controle.
            </span>
          </h1>

          {/* sub */}
          <p style={{
            fontSize: 'clamp(0.95rem, 2.5vw, 1.15rem)',
            color: 'rgba(255,255,255,0.55)',
            lineHeight: 1.7,
            maxWidth: 520, margin: '0 auto 2.5rem',
          }}>
            Transações, contas, faturas de serviço, investimentos e listas de compras — tudo em um sistema com isolamento total por CPF ou CNPJ.
          </p>

          {/* CTAs */}
          <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap', marginBottom: '4rem' }}>
            <Link to="/register" className="btn btn-primary btn-lg" style={{ gap: '0.5rem', fontSize: '0.95rem' }}>
              Solicitar acesso <ArrowRight size={16} />
            </Link>
            <Link to="/login" className="btn btn-secondary btn-lg" style={{ fontSize: '0.95rem' }}>
              Já tenho conta
            </Link>
          </div>

          {/* App preview */}
          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <div style={{ position: 'relative' }}>
              {/* glow under preview */}
              <div style={{
                position: 'absolute', bottom: -40, left: '50%', transform: 'translateX(-50%)',
                width: '80%', height: 80,
                background: 'rgba(168,85,247,0.2)',
                filter: 'blur(40px)',
                borderRadius: '50%',
              }} />
              <AppPreview />
            </div>
          </div>
        </div>
      </section>

      {/* ── Stats strip ── */}
      <div style={{
        borderTop: '1px solid rgba(255,255,255,0.07)',
        borderBottom: '1px solid rgba(255,255,255,0.07)',
        background: 'rgba(255,255,255,0.02)',
      }}>
        <div style={{
          maxWidth: 860, margin: '0 auto',
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          padding: '0 clamp(1rem, 4vw, 2.5rem)',
        }}>
          {[
            { num: 'PF & PJ',    label: 'Pessoa Física e Jurídica' },
            { num: 'PWA',        label: 'Funciona offline' },
            { num: '100%',       label: 'Dados isolados por doc.' },
            { num: '8+',         label: 'Módulos integrados' },
          ].map(({ num, label }) => (
            <div key={label} style={{
              padding: '1.5rem 1rem',
              textAlign: 'center',
              borderRight: '1px solid rgba(255,255,255,0.06)',
            }}>
              <p style={{ fontSize: '1.6rem', fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1 }}>{num}</p>
              <p style={{ fontSize: '0.72rem', color: 'rgba(255,255,255,0.4)', marginTop: 4 }}>{label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Features ── */}
      <section style={{
        maxWidth: 1040, margin: '0 auto',
        padding: 'clamp(4rem, 8vw, 6rem) clamp(1rem, 4vw, 2.5rem)',
      }}>
        <div style={{ textAlign: 'center', marginBottom: '3.5rem' }}>
          <h2 style={{
            fontSize: 'clamp(1.6rem, 4vw, 2.4rem)',
            fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.15,
            marginBottom: '0.75rem',
          }}>
            Tudo que você precisa,<br />
            <span style={{ color: 'rgba(255,255,255,0.4)' }}>nada que não precisa</span>
          </h2>
          <p style={{ color: 'rgba(255,255,255,0.4)', fontSize: '0.9rem' }}>
            Módulos integrados com visão consolidada de todas as suas finanças.
          </p>
        </div>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          gap: '1px',
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 20,
          overflow: 'hidden',
        }}>
          {features.map(({ icon: Icon, title, desc }, i) => (
            <div
              key={title}
              style={{
                background: i % 2 === 0 ? '#080808' : '#060606',
                padding: '1.6rem',
                transition: 'background 150ms',
              }}
              onMouseEnter={e => (e.currentTarget.style.background = '#111')}
              onMouseLeave={e => (e.currentTarget.style.background = i % 2 === 0 ? '#080808' : '#060606')}
            >
              <div style={{
                width: 36, height: 36, borderRadius: 10,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                marginBottom: '0.9rem',
              }}>
                <Icon size={16} strokeWidth={1.8} />
              </div>
              <p style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: '0.35rem' }}>{title}</p>
              <p style={{ fontSize: '0.77rem', color: 'rgba(255,255,255,0.4)', lineHeight: 1.6 }}>{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── PF / PJ split ── */}
      <section style={{
        maxWidth: 860, margin: '0 auto',
        padding: '0 clamp(1rem, 4vw, 2.5rem) clamp(4rem, 8vw, 6rem)',
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '1px',
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 20, overflow: 'hidden',
        }}>
          {[
            {
              tag: 'Pessoa Física',
              color: '#34d399',
              title: 'Para o seu bolso',
              items: ['Controle de gastos mensais', 'Cartão de crédito e débito', 'Metas e investimentos pessoais', 'Listas de compras do dia a dia'],
            },
            {
              tag: 'Pessoa Jurídica',
              color: '#60a5fa',
              title: 'Para seu negócio',
              items: ['Emissão de faturas com impostos', 'Fluxo de caixa empresarial', 'Gestão de contas PJ', 'Clientes e serviços LC 116'],
            },
          ].map(({ tag, color, title, items }) => (
            <div key={tag} style={{ background: '#080808', padding: '2rem' }}>
              <span style={{
                display: 'inline-block',
                fontSize: '0.68rem', fontWeight: 800, letterSpacing: '0.1em',
                textTransform: 'uppercase', color,
                background: `${color}18`,
                border: `1px solid ${color}40`,
                borderRadius: 999, padding: '0.2rem 0.65rem',
                marginBottom: '1rem',
              }}>
                {tag}
              </span>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, letterSpacing: '-0.03em', marginBottom: '1rem' }}>
                {title}
              </h3>
              <ul style={{ listStyle: 'none', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                {items.map(item => (
                  <li key={item} style={{ display: 'flex', alignItems: 'flex-start', gap: '0.5rem', fontSize: '0.83rem', color: 'rgba(255,255,255,0.55)' }}>
                    <span style={{ color, flexShrink: 0, marginTop: 2 }}>✓</span>
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section style={{
        maxWidth: 640, margin: '0 auto',
        padding: '0 clamp(1rem, 4vw, 2.5rem) clamp(5rem, 10vw, 8rem)',
        textAlign: 'center',
      }}>
        <div style={{
          position: 'relative',
          padding: '3rem 2rem',
          borderRadius: 24,
          background: '#080808',
          border: '1px solid rgba(255,255,255,0.1)',
          overflow: 'hidden',
        }}>
          {/* glow */}
          <div aria-hidden style={{
            position: 'absolute', top: -40, left: '50%', transform: 'translateX(-50%)',
            width: '60%', height: 120,
            background: 'rgba(168,85,247,0.15)', filter: 'blur(40px)',
          }} />

          <div style={{ position: 'relative', zIndex: 1 }}>
            <p style={{
              fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.1em',
              color: 'rgba(168,85,247,0.8)', textTransform: 'uppercase', marginBottom: '1rem',
            }}>
              Comece agora
            </p>
            <h2 style={{
              fontSize: 'clamp(1.6rem, 4vw, 2.2rem)',
              fontWeight: 800, letterSpacing: '-0.04em', lineHeight: 1.15,
              marginBottom: '0.9rem',
            }}>
              Pronto para assumir o controle?
            </h2>
            <p style={{
              color: 'rgba(255,255,255,0.45)', fontSize: '0.88rem', lineHeight: 1.7,
              maxWidth: 420, margin: '0 auto 2rem',
            }}>
              Crie sua conta com CPF ou CNPJ. O acesso fica pendente até validação e é liberado em breve.
            </p>
            <Link
              to="/register"
              className="btn btn-primary btn-lg"
              style={{ gap: '0.5rem', fontSize: '0.95rem', justifyContent: 'center', width: '100%', maxWidth: 320, margin: '0 auto', display: 'flex' }}
            >
              Solicitar acesso <ArrowRight size={16} />
            </Link>
            <p style={{ marginTop: '1.2rem', fontSize: '0.78rem', color: 'rgba(255,255,255,0.3)' }}>
              Já possui conta?{' '}
              <Link to="/login" style={{ color: 'rgba(255,255,255,0.6)', fontWeight: 600 }}>
                Entrar
              </Link>
            </p>
          </div>
        </div>
      </section>

      {/* ── Footer ── */}
      <footer style={{
        borderTop: '1px solid rgba(255,255,255,0.06)',
        padding: '1.5rem clamp(1rem, 4vw, 2.5rem)',
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        flexWrap: 'wrap', gap: '0.5rem',
      }}>
        <span style={{ fontWeight: 800, fontSize: '0.9rem', letterSpacing: '-0.03em', color: 'rgba(255,255,255,0.6)' }}>nexo</span>
        <span style={{ fontSize: '0.75rem', color: 'rgba(255,255,255,0.25)' }}>
          © {new Date().getFullYear()} Nexo Gestão Financeira
        </span>
        <div style={{ display: 'flex', gap: '1.25rem' }}>
          <Link to="/login" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.3)' }}>Entrar</Link>
          <Link to="/register" style={{ fontSize: '0.78rem', color: 'rgba(255,255,255,0.3)' }}>Cadastro</Link>
        </div>
      </footer>

    </div>
  );
}
