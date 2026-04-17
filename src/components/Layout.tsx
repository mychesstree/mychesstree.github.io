import { useState, useRef, useEffect } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { LogOut, Settings as SettingsIcon, BrainCircuit, User as UserIcon, ChevronDown } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';

export default function Layout() {
  const { user } = useAuth();
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  const handleLogout = async () => {
    setIsDropdownOpen(false);
    await supabase.auth.signOut();
  };

  // Close on outside click
  useEffect(() => {
    function onOutsideClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsDropdownOpen(false);
      }
    }
    document.addEventListener('mousedown', onOutsideClick);
    return () => document.removeEventListener('mousedown', onOutsideClick);
  }, []);

  return (
    <div className="app-layout">
      <header className="app-header">
        {/* Brand */}
        <Link to="/" className="app-header-brand">
          <BrainCircuit size={24} style={{ color: 'var(--accent-color)' }} />
          <span>MyChessTree</span>
        </Link>

        {/* Profile button + dropdown — uses inline position:relative so dropdown works */}
        <div ref={wrapperRef} style={{ position: 'relative' }}>
          <button
            onClick={() => setIsDropdownOpen(prev => !prev)}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <UserIcon size={18} />
            <span style={{
              maxWidth: 140,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: '0.875rem',
            }}>
              {user?.email ?? 'Profile'}
            </span>
            <ChevronDown
              size={14}
              style={{
                transition: 'transform 0.2s',
                transform: isDropdownOpen ? 'rotate(180deg)' : 'rotate(0deg)',
              }}
            />
          </button>

          {/* Dropdown menu */}
          {isDropdownOpen && (
            <div
              className="animate-fade-in"
              style={{
                position: 'absolute',
                top: 'calc(100% + 0.5rem)',
                right: 0,
                zIndex: 100,
                minWidth: 200,
                backgroundColor: 'var(--panel-bg)',
                border: '1px solid var(--border-color)',
                borderRadius: 'var(--radius-md)',
                boxShadow: '0 12px 24px rgba(0,0,0,0.6)',
                overflow: 'hidden',
              }}
            >
              {/* Email row */}
              <div style={{
                padding: '0.6rem 1rem',
                fontSize: '0.78rem',
                color: 'var(--text-muted)',
                borderBottom: '1px solid var(--border-color)',
                wordBreak: 'break-all',
              }}>
                {user?.email}
              </div>

              {/* Dashboard link */}
              <Link
                to="/settings"
                onClick={() => setIsDropdownOpen(false)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  padding: '0.65rem 1rem',
                  color: 'var(--text-main)',
                  textDecoration: 'none',
                  fontSize: '0.9rem',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--panel-bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <SettingsIcon size={16} />
                Settings
              </Link>

              {/* Sign out button */}
              <button
                onClick={handleLogout}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  width: '100%',
                  padding: '0.65rem 1rem',
                  background: 'none',
                  border: 'none',
                  color: 'var(--error)',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--panel-bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <LogOut size={16} />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
