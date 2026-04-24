import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { TooltipProvider } from './components/TooltipContext';
import { ToastProvider } from './components/Toast';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import { WifiOff } from 'lucide-react';
import Layout from './components/Layout';
import Login from './pages/Login';
import Landing from './pages/Landing';
import Dashboard from './pages/Dashboard';
import TreeEditor from './pages/TreeEditor';
import Review from './pages/Review';
import Settings from './pages/Settings';
import Pricing from './pages/Pricing';
import UpdatePassword from './pages/UpdatePassword';
import TreeNotFound from './pages/TreeNotFound';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isGuest, loading } = useAuth();

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading…</div>;
  if (!user && !isGuest) return <Navigate to="/login" replace />;

  return <>{children}</>;
};

// Global offline indicator component
function GlobalOfflineIndicator() {
  const isOnline = useOnlineStatus();
  
  if (isOnline) return null;
  
  return (
    <div style={{
      position: 'fixed',
      top: 20,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 9999,
      backgroundColor: 'rgba(239, 68, 68, 0.95)',
      color: 'white',
      padding: '0.75rem 1.5rem',
      borderRadius: '2rem',
      fontSize: '0.9rem',
      fontWeight: 600,
      display: 'flex',
      alignItems: 'center',
      gap: '0.5rem',
      boxShadow: '0 4px 12px rgba(239, 68, 68, 0.4)',
      animation: 'slideDown 0.3s ease-out'
    }}>
      <WifiOff size={16} />
      <span>You're offline - some features may be limited</span>
    </div>
  );
}

function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <TooltipProvider>
          <GlobalOfflineIndicator />
          <HashRouter>
            <Routes>
              <Route path="/landing" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/reset-password" element={<UpdatePassword />} />
              <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
                <Route index element={<Dashboard />} />
                <Route path="editor/:id" element={<TreeEditor />} />
                <Route path="review/:id" element={<Review />} />
                <Route path="settings" element={<Settings />} />
                <Route path="pricing" element={<Pricing />} />
              </Route>
              <Route path="*" element={<TreeNotFound />} />
            </Routes>
          </HashRouter>
        </TooltipProvider>
      </ToastProvider>
    </AuthProvider>
  );
}

export default App;
