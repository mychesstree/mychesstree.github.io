import { useState } from 'react';
import { Outlet, Link } from 'react-router-dom';
import { supabase } from '../lib/supabase';
import { LogOut, Settings as SettingsIcon, User as UserIcon, ChevronDown, HelpCircle, Globe } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { useDropdown } from '../hooks/useDropdown';
import TutorialModal from './TutorialModal';

export default function Layout() {
  const { user, isGuest } = useAuth();
  const { isOpen: isDropdownOpen, wrapperRef, toggleDropdown, closeDropdown } = useDropdown();
  const [showTutorial, setShowTutorial] = useState(false);

  const handleLogout = async () => {
    closeDropdown();
    await supabase.auth.signOut();
  };

  const handleLogin = () => {
    closeDropdown();
    // Navigate to login page or open login modal
    window.location.href = '/login';
  };

  return (
    <div className="app-layout">
      <header className="app-header">
        {/* Brand */}
        <Link to="/" className="app-header-brand" style={{ gap: '0.75rem' }}>
          <img src="/logo.svg" alt="MyChessTree Logo" style={{ height: 32, width: 'auto' }} />
          <span>MyChessTree</span>
        </Link>

        {/* Profile button + dropdown — uses inline position:relative so dropdown works */}
        <div ref={wrapperRef} style={{ position: 'relative' }}>
          <button
            onClick={toggleDropdown}
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}
          >
            <UserIcon size={18} />
            <span style={{
              maxWidth: 100,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              fontSize: '0.875rem',
            }}>
              {isGuest ? 'Guest' : (user?.user_metadata?.username ?? user?.email ?? 'Profile')}
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

              {/* Public Trees link */}
              <Link
                to="/public-trees"
                onClick={closeDropdown}
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
                <Globe size={16} />
                Public Trees
              </Link>

              {/* Settings link */}
              <Link
                to="/settings"
                onClick={closeDropdown}
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

              {/* Tutorial Toggle */}
              <button
                onClick={() => {
                  closeDropdown();
                  setShowTutorial(true);
                }}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  width: '100%',
                  padding: '0.65rem 1rem',
                  background: 'none',
                  border: 'none',
                  color: 'var(--text-main)',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--panel-bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <HelpCircle size={16} />
                How to Use
              </button>

              {/* Sign out / Login button */}
              <button
                onClick={isGuest ? handleLogin : handleLogout}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.6rem',
                  width: '100%',
                  padding: '0.65rem 1rem',
                  background: 'none',
                  border: 'none',
                  color: 'var(--accent-color)',
                  fontSize: '0.9rem',
                  cursor: 'pointer',
                  textAlign: 'left',
                  transition: 'background 0.15s',
                }}
                onMouseEnter={e => (e.currentTarget.style.backgroundColor = 'var(--panel-bg-hover)')}
                onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
              >
                <LogOut size={16} />
                {isGuest ? 'Login' : 'Sign Out'}
              </button>
            </div>
          )}
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>

      <TutorialModal isOpen={showTutorial} onClose={() => setShowTutorial(false)} />
    </div>
  );
}
