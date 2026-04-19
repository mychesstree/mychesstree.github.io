import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

interface TooltipData {
  text: string;
  x: number;
  y: number;
}

interface TooltipContextType {
  showTooltip: (text: string, x: number, y: number) => void;
  hideTooltip: () => void;
}

const TooltipContext = createContext<TooltipContextType | null>(null);

export function TooltipProvider({ children }: { children: ReactNode }) {
  const [tooltip, setTooltip] = useState<TooltipData | null>(null);

  const showTooltip = useCallback((text: string, x: number, y: number) => {
    setTooltip({ text, x, y });
  }, []);

  const hideTooltip = useCallback(() => {
    setTooltip(null);
  }, []);

  return (
    <TooltipContext.Provider value={{ showTooltip, hideTooltip }}>
      {children}
      {tooltip && (
        <div
          style={{
            position: 'fixed',
            left: tooltip.x,
            top: tooltip.y,
            transform: 'translate(-50%, -100%)',
            backgroundColor: '#1e1b1c',
            color: 'white',
            padding: '6px 10px',
            borderRadius: '6px',
            fontSize: '0.75rem',
            whiteSpace: 'nowrap',
            border: '1px solid #3d2a2f',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.5)',
            zIndex: 10000,
            pointerEvents: 'none',
            marginTop: '-8px',
          }}
        >
          {tooltip.text}
        </div>
      )}
    </TooltipContext.Provider>
  );
}

export function useTooltip() {
  const context = useContext(TooltipContext);
  if (!context) throw new Error('useTooltip must be used within TooltipProvider');
  return context;
}
