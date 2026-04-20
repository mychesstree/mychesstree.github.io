import { Link, useLocation } from 'react-router-dom';
import { AlertCircle, ArrowLeft, Home } from 'lucide-react';

export default function TreeNotFound() {
  const location = useLocation();
  const isTreeRoute = location.pathname.includes('/editor/') || location.pathname.includes('/review/');
  
  return (
    <div className="animate-fade-in" style={{ 
      display: 'flex', 
      flexDirection: 'column', 
      alignItems: 'center', 
      justifyContent: 'center', 
      minHeight: '60vh',
      padding: '2rem'
    }}>
      <div className="card text-center" style={{ maxWidth: 500, width: '100%' }}>
        <div style={{ marginBottom: '1.5rem' }}>
          <AlertCircle size={64} style={{ color: '#ef4444', margin: '0 auto 1rem auto' }} />
          <h1 style={{ fontSize: '2rem', marginBottom: '0.5rem', color: '#ef4444' }}>
            {isTreeRoute ? 'Tree Not Found' : 'Page Not Found'}
          </h1>
          <p className="text-muted" style={{ fontSize: '1.1rem', marginBottom: '1.5rem' }}>
            {isTreeRoute 
              ? 'The chess tree you\'re looking for doesn\'t exist or you don\'t have access to it.'
              : 'The page you\'re looking for doesn\'t exist or has been moved.'
            }
          </p>
        </div>

        <div style={{ display: 'flex', gap: '1rem', justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/" className="btn" style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Home size={16} />
            Dashboard
          </Link>
          <button 
            onClick={() => window.history.back()} 
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
          >
            <ArrowLeft size={16} />
            Go Back
          </button>
        </div>

        <div style={{ marginTop: '2rem', paddingTop: '1.5rem', borderTop: '1px solid var(--border-color)' }}>
          <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem', color: 'var(--text-muted)' }}>
            What might have happened?
          </h3>
          <ul style={{ textAlign: 'left', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.6' }}>
            {isTreeRoute ? (
              <>
                <li>The tree was deleted by its owner</li>
                <li>The tree ID in the URL is incorrect</li>
                <li>You don't have permission to access this tree</li>
                <li>The tree was shared with you but the access was revoked</li>
              </>
            ) : (
              <>
                <li>The page URL was mistyped</li>
                <li>The page was moved or deleted</li>
                <li>You don't have permission to access this page</li>
                <li>The link you followed is outdated</li>
              </>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
}
