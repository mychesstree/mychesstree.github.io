import { useState } from 'react';
import { supabase } from '../lib/supabase';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

export default function Login() {
  const [email, setEmail] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'signin' | 'signup' | 'forgot'>('signin');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const navigate = useNavigate();
  const { loginAsGuest } = useAuth();

  const handleGuestLogin = () => {
    loginAsGuest();
    navigate('/');
  };

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setMessage('');

    try {
      if (mode === 'signup') {
        const usernameRegex = /^[a-zA-Z0-9]{3,10}$/;
        if (!usernameRegex.test(username)) {
          throw new Error('Username must be alphanumeric and 3-10 characters long.');
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { username },
            emailRedirectTo: `${window.location.origin}/#/login`
          }
        });
        if (error) throw error;
        setMessage('Check your email for the confirmation link!');
      } else if (mode === 'forgot') {
        const { error } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/#/reset-password`
        });
        if (error) throw error;
        setMessage('Check your email for the password reset link!');
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        navigate('/');
      }
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen" style={{ backgroundColor: 'var(--bg-color)' }}>
      <div className="card" style={{ maxWidth: '400px', width: '100%', margin: '0 1rem' }}>
        <div className="flex items-center gap-4 mb-8">
          <img src="/logo.svg" alt="MyChessTree Logo" style={{ height: 48, width: 'auto' }} />
          <div>
            <h1 style={{ fontSize: '2rem', marginTop: 10 }}>
              {mode === 'signup' ? 'Create Account' : mode === 'forgot' ? 'Reset' : 'Welcome Back'}
            </h1>
          </div>
        </div>

        {error && (
          <div style={{ color: 'white', backgroundColor: 'var(--error)', padding: '0.75rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {error}
          </div>
        )}

        {message && (
          <div style={{ color: 'white', backgroundColor: 'var(--success)', padding: '0.75rem', borderRadius: 'var(--radius-md)', marginBottom: '1rem', fontSize: '0.875rem' }}>
            {message}
          </div>
        )}

        <form onSubmit={handleAuth}>
          <div className="input-group">
            <label>Email</label>
            <input
              type="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          {mode === 'signup' && (
            <div className="input-group">
              <label>Username</label>
              <input
                type="text"
                className="input"
                placeholder="3-10 characters"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                required
              />
            </div>
          )}

          {mode !== 'forgot' && (
            <div className="input-group">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <label>Password</label>
                {mode === 'signin' && (
                  <button
                    type="button"
                    onClick={() => setMode('forgot')}
                    style={{ background: 'none', border: 'none', color: 'var(--accent-color)', fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}
                  >
                    Forgot Password?
                  </button>
                )}
              </div>
              <input
                type="password"
                className="input"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
          )}

          <button type="submit" className="btn" style={{ width: '100%', marginTop: '1rem' }} disabled={loading}>
            {loading ? 'Loading...' : (mode === 'signup' ? 'Sign Up' : mode === 'forgot' ? 'Send Reset Link' : 'Sign In')}
          </button>
        </form>

        <div className="text-center" style={{ marginTop: '1.5rem' }}>
          <button
            type="button"
            style={{ border: 'none', background: 'transparent', color: 'var(--text-muted)', cursor: 'pointer', fontSize: '0.875rem' }}
            onClick={() => {
              setMode(mode === 'signin' ? 'signup' : 'signin');
              setError('');
              setMessage('');
            }}
          >
            {mode === 'signin' ? "Don't have an account? Sign Up" : 'Back to Sign In'}
          </button>
        </div>

        {mode === 'signin' && (
          <div style={{ marginTop: '1.5rem', borderTop: '1px solid var(--border-color)', paddingTop: '1.5rem' }}>
            <button
              type="button"
              onClick={handleGuestLogin}
              className="btn btn-secondary"
              style={{ width: '100%' }}
            >
              Continue as Guest
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
