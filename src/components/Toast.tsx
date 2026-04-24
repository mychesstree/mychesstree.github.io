import { createContext, useContext, useState, useEffect, useCallback, type ReactNode } from 'react';

export interface Toast {
  id: string;
  message: string;
  type: 'success' | 'error' | 'info' | 'warning';
  duration?: number;
}

interface ToastContextType {
  success: (message: string, duration?: number) => void;
  error: (message: string, duration?: number) => void;
  warning: (message: string, duration?: number) => void;
  info: (message: string, duration?: number) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

interface ToastProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

function ToastItem({ toast, onRemove }: ToastProps) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onRemove(toast.id);
    }, toast.duration || 3000);

    return () => clearTimeout(timer);
  }, [toast.id, toast.duration, onRemove]);

  const getToastStyle = () => {
    const baseStyle = {
      position: 'fixed' as const,
      bottom: '20px',
      right: '20px',
      backgroundColor: 'var(--accent-color)',
      color: 'white',
      padding: '1rem',
      borderRadius: 'var(--radius-md)',
      boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
      zIndex: 99999,
      maxWidth: '300px',
      fontSize: '0.9rem',
      animation: 'slideIn 0.3s ease-out',
    };

    const typeStyles = {
      success: {
        backgroundColor: '#ffe5e5',
        color: 'black'
      },  
      error: {
        backgroundColor: '#ef4444',
      },
      warning: {
        backgroundColor: '#ff9393',
        color: 'black'
      },
      info: {
        backgroundColor: 'var(--accent-color)',
      },
    };

    return { ...baseStyle, ...typeStyles[toast.type] };
  };

  return (
    <div style={getToastStyle()}>
      <p style={{ margin: 0, fontSize: '0.9rem' }}>
        {toast.message}
      </p>
    </div>
  );
}



export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: Toast['type'] = 'info', duration?: number) => {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const newToast: Toast = { id, message, type, duration };
    
    setToasts(prev => [...prev, newToast]);
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts(prev => prev.filter(toast => toast.id !== id));
  }, []);

  
  // Convenience methods
  const success = useCallback((message: string, duration?: number) => addToast(message, 'success', duration), [addToast]);
  const error = useCallback((message: string, duration?: number) => addToast(message, 'error', duration), [addToast]);
  const warning = useCallback((message: string, duration?: number) => addToast(message, 'warning', duration), [addToast]);
  const info = useCallback((message: string, duration?: number) => addToast(message, 'info', duration), [addToast]);

  return (
    <ToastContext.Provider value={{ success, error, warning, info }}>
      {children}
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} onRemove={removeToast} />
      ))}
    </ToastContext.Provider>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
}

// Add CSS animation
if (typeof document !== 'undefined') {
  const style = document.createElement('style');
  style.textContent = `
    @keyframes slideIn {
      from {
        transform: translateX(100%);
        opacity: 0;
      }
      to {
        transform: translateX(0);
        opacity: 1;
      }
    }
  `;
  document.head.appendChild(style);
}
