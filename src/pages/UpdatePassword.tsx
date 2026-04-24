import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { useToast } from '../components/Toast';

export default function UpdatePassword() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const navigate = useNavigate();
  const { success: showSuccess, error: showError } = useToast();

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      showSuccess('Password updated successfully! Redirecting to login...');
      setTimeout(() => navigate('/login'), 2000);
    } catch (err: any) {
      showError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: 'var(--bg-color)' }}>
      <div className="card" style={{ maxWidth: '400px', width: '100%', margin: '2rem' }}>
        <div className="flex flex-col items-center mb-6 text-center">
          <div style={{ backgroundColor: 'rgba(225, 29, 72, 0.1)', padding: '1rem', borderRadius: '50%', marginBottom: '1rem' }}>
            <Lock size={32} style={{ color: 'var(--accent-color)' }} />
          </div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '0.5rem' }}>Update Password</h1>
          <p className="text-muted" style={{ fontSize: '0.9rem' }}>
            Choose a new secure password for your account.
          </p>
        </div>

        <form onSubmit={handleUpdate}>
            <div className="input-group">
              <label>New Password</label>
              <div style={{ position: 'relative' }}>
                <input 
                  type={showPassword ? 'text' : 'password'}
                  className="input" 
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="•••••••••"
                  required 
                  minLength={6}
                  style={{ paddingRight: '2.5rem' }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  style={{
                    position: 'absolute',
                    right: '0.75rem',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'balck',
                    border: '1px solid var(--border-color)',
                    borderRadius: '4px',
                    padding: '0.25rem',
                    cursor: 'pointer',
                    color: 'var(--text-muted)'
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
            <button type="submit" className="btn" style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
              {loading ? 'Updating...' : 'Set New Password'}
            </button>
          </form>
      </div>
    </div>
  );
}
