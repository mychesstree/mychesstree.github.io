import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './hooks/useAuth';
import { TooltipProvider } from './components/TooltipContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import TreeEditor from './pages/TreeEditor';
import Review from './pages/Review';
import Settings from './pages/Settings';
import UpdatePassword from './pages/UpdatePassword';
import TreeNotFound from './pages/TreeNotFound';

const ProtectedRoute = ({ children }: { children: React.ReactNode }) => {
  const { user, isGuest, loading } = useAuth();

  if (loading) return <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>Loading…</div>;
  if (!user && !isGuest) return <Navigate to="/login" replace />;

  return <>{children}</>;
};

function App() {
  return (
    <AuthProvider>
      <TooltipProvider>
        <HashRouter>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/reset-password" element={<UpdatePassword />} />
            <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
              <Route index element={<Dashboard />} />
              <Route path="editor/:id" element={<TreeEditor />} />
              <Route path="review/:id" element={<Review />} />
              <Route path="settings" element={<Settings />} />
            </Route>
            <Route path="*" element={<TreeNotFound />} />
          </Routes>
        </HashRouter>
      </TooltipProvider>
    </AuthProvider>
  );
}

export default App;
