import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { Lock } from 'lucide-react';

export default function UpdatePassword() {
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const navigate = useNavigate();

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setSuccess(true);
      setTimeout(() => navigate('/login'), 2000);
    } catch (err: any) {
      setError(err.message);
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

        {error && (
          <div style={{ color: 'white', backgroundColor: 'var(--error)', padding: '0.75rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        {success ? (
          <div style={{ color: 'white', backgroundColor: 'var(--success)', padding: '1rem', borderRadius: 'var(--radius-md)', textAlign: 'center' }}>
            Password updated successfully! Redirecting to login...
          </div>
        ) : (
          <form onSubmit={handleUpdate}>
            <div className="input-group">
              <label>New Password</label>
              <input 
                type="password" 
                className="input" 
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                required 
                minLength={6}
              />
            </div>
            <button type="submit" className="btn" style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
              {loading ? 'Updating...' : 'Set New Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
