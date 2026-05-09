import { useEffect, useState } from 'react';
import { Crown, Sparkles, X, ArrowRight } from 'lucide-react';

interface ProSuccessModalProps {
  onClose: () => void;
}

export default function ProSuccessModal({ onClose }: ProSuccessModalProps) {
  const [particles, setParticles] = useState<Array<{ id: number; x: number; y: number; color: string; delay: number; size: number }>>([]);

  useEffect(() => {
    // Generate sparkle particles
    const colors = ['#f50b0b', '#ff6b6b', '#ffd700', '#ff4500', '#ff8c00', '#fff'];
    const generated = Array.from({ length: 30 }, (_, i) => ({
      id: i,
      x: Math.random() * 100,
      y: Math.random() * 100,
      color: colors[Math.floor(Math.random() * colors.length)],
      delay: Math.random() * 1.5,
      size: Math.random() * 6 + 4,
    }));
    setParticles(generated);

    // Auto-close after 8 seconds
    const timer = setTimeout(onClose, 8000);
    return () => clearTimeout(timer);
  }, [onClose]);

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0,0,0,0.85)',
        zIndex: 99999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '1rem',
        backdropFilter: 'blur(4px)',
      }}
      onClick={onClose}
    >
      {/* Floating particles */}
      {particles.map((p) => (
        <div
          key={p.id}
          style={{
            position: 'fixed',
            left: `${p.x}%`,
            top: `${p.y}%`,
            width: p.size,
            height: p.size,
            borderRadius: '50%',
            backgroundColor: p.color,
            animation: `proParticleFall 3s ease-in ${p.delay}s infinite`,
            pointerEvents: 'none',
            opacity: 0.9,
          }}
        />
      ))}

      <div
        className="card animate-fade-in"
        style={{
          maxWidth: 480,
          width: '100%',
          textAlign: 'center',
          padding: '2.5rem',
          position: 'relative',
          border: '2px solid #f50b0b',
          background: 'linear-gradient(135deg, var(--panel-bg) 0%, rgba(245,11,11,0.08) 100%)',
          boxShadow: '0 0 60px rgba(245,11,11,0.3), 0 20px 40px rgba(0,0,0,0.5)',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <button
          onClick={onClose}
          style={{
            position: 'absolute',
            top: 12,
            right: 12,
            background: 'none',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            padding: 4,
          }}
        >
          <X size={20} />
        </button>

        {/* Crown icon with glow */}
        <div style={{
          width: 80,
          height: 80,
          borderRadius: '50%',
          background: 'linear-gradient(135deg, rgba(245,11,11,0.2), rgba(255,165,0,0.2))',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          margin: '0 auto 1.5rem auto',
          border: '2px solid rgba(245,11,11,0.5)',
          boxShadow: '0 0 30px rgba(245,11,11,0.4)',
          animation: 'proGlow 2s ease-in-out infinite',
        }}>
          <Crown size={40} color="#f50b0b" />
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
          <Sparkles size={20} color="#ffd700" />
          <h2 style={{ margin: 0, fontSize: '1.75rem', fontWeight: 800, color: 'white' }}>
            Welcome to Pro!
          </h2>
          <Sparkles size={20} color="#ffd700" />
        </div>

        <p style={{ color: 'var(--text-muted)', marginBottom: '1.5rem', fontSize: '1rem', lineHeight: 1.6 }}>
          You're now a Pro member. Enjoy unlimited depth in your trees, up to 9 saved trees, and priority support.
        </p>

        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          gap: '0.75rem',
          marginBottom: '1.5rem',
        }}>
          {[
            { label: '9 Cloud Trees', sub: 'Save more repertoires' },
            { label: 'Deeper Analysis', sub: '999 moves of depth' },
            { label: 'Priority Support', sub: 'Direct help from creator' },
            { label: 'Local Mode', sub: 'Unlimited local storage' },
          ].map((feat) => (
            <div
              key={feat.label}
              style={{
                padding: '0.75rem',
                borderRadius: 'var(--radius-md)',
                background: 'rgba(245,11,11,0.08)',
                border: '1px solid rgba(245,11,11,0.2)',
                textAlign: 'left',
              }}
            >
              <div style={{ fontWeight: 600, fontSize: '0.85rem', color: 'white' }}>{feat.label}</div>
              <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{feat.sub}</div>
            </div>
          ))}
        </div>

        <button
          className="btn"
          onClick={onClose}
          style={{
            width: '100%',
            padding: '0.875rem',
            fontSize: '1rem',
            fontWeight: 700,
            background: 'linear-gradient(135deg, #f50b0b, #ff4500)',
            boxShadow: '0 4px 20px rgba(245,11,11,0.4)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
          }}
        >
          Start Building
          <ArrowRight size={18} />
        </button>

        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '1rem', margin: '1rem 0 0 0' }}>
          Manage your subscription anytime from the Pricing page.
        </p>
      </div>

      <style>{`
        @keyframes proParticleFall {
          0% { transform: translateY(0) rotate(0deg); opacity: 1; }
          100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
        }
        @keyframes proGlow {
          0%, 100% { box-shadow: 0 0 30px rgba(245,11,11,0.4); }
          50% { box-shadow: 0 0 50px rgba(245,11,11,0.8), 0 0 80px rgba(255,165,0,0.3); }
        }
      `}</style>
    </div>
  );
}
