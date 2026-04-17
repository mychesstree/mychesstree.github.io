import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { useAuth } from '../hooks/useAuth';
import { User, Mail, LogOut, Shield } from 'lucide-react';

export default function Settings() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [treesCount, setTreesCount] = useState<number | null>(null);

  useEffect(() => {
    if (!user) return;
    supabase
      .from('trees')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .then(({ count }) => setTreesCount(count ?? 0));
  }, [user]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate('/login');
  };

  return (
    <div style={{ maxWidth: 560, margin: '0 auto' }}>
      <h1 style={{ marginBottom: '1.5rem', fontSize: '1.5rem' }}>Settings</h1>

      {/* Profile card */}
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem', marginBottom: '1.25rem' }}>
          <div style={{
            width: 48, height: 48, borderRadius: '50%',
            backgroundColor: 'var(--accent-color)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <User size={24} color="white" />
          </div>
          <div>
            <div style={{ fontWeight: 600 }}>{user?.email?.split('@')[0]}</div>
            <div className="text-muted text-sm">{user?.email}</div>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <Row icon={<Mail size={16} />} label="Email" value={user?.email ?? '—'} />
          <Row icon={<Shield size={16} />} label="User ID" value={user?.id ? user.id.slice(0, 16) + '…' : '—'} mono />
          <Row icon={<User size={16} />} label="Opening Trees" value={treesCount !== null ? String(treesCount) : '…'} />
        </div>
      </div>

      {/* Actions card */}
      <div className="card">
        <h3 style={{ marginBottom: '1rem', fontSize: '1rem' }}>Account</h3>
        <button
          onClick={handleLogout}
          className="btn"
          style={{ backgroundColor: 'var(--error)', width: '100%' }}
        >
          <LogOut size={16} /> Sign Out
        </button>
      </div>
    </div>
  );
}

function Row({ icon, label, value, mono }: { icon: React.ReactNode; label: string; value: string; mono?: boolean }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', padding: '0.6rem 0', borderBottom: '1px solid var(--border-color)' }}>
      <span style={{ color: 'var(--text-muted)', flexShrink: 0 }}>{icon}</span>
      <span className="text-muted text-sm" style={{ flexShrink: 0, width: 80 }}>{label}</span>
      <span style={{ fontFamily: mono ? 'monospace' : 'inherit', fontSize: '0.875rem', wordBreak: 'break-all' }}>{value}</span>
    </div>
  );
}
