import { useEffect, useState } from 'react';

export default function LoadingScreen({ isLoading }: { isLoading: boolean }) {
  const [show, setShow] = useState(true);
  const [fade, setFade] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let interval: number;
    let timeout: number;

    if (isLoading) {
      // Fake progress bar that stops at 90% until actually loaded
      interval = setInterval(() => {
        setProgress((p) => {
          if (p >= 90) return p;
          // Add a random amount of progress between 1 and 15
          return p + Math.random() * 15;
        });
      }, 150);
    } else {
      // When loading finishes, fill to 100%, then fade out
      setProgress(100);
      setFade(true);
      timeout = setTimeout(() => {
        setShow(false);
      }, 600); // 600ms fade out matches CSS transition
    }

    return () => {
      clearInterval(interval);
      clearTimeout(timeout);
    };
  }, [isLoading]);

  if (!show) return null;

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: 'var(--bg-color)',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        opacity: fade ? 0 : 1,
        transition: 'opacity 0.6s ease-out',
        pointerEvents: fade ? 'none' : 'auto',
      }}
    >
      <img
        src="/logo.svg"
        alt="Logo"
        style={{
          width: 140,
          height: 140,
          marginBottom: '1.5rem',
          animation: fade ? 'none' : 'pulse 2s infinite ease-in-out'
        }}
      />
      <div
        style={{
          color: 'var(--text-main)',
          marginBottom: '1rem',
          fontSize: '1.25rem',
          fontWeight: 600,
          fontFamily: 'Outfit, sans-serif'
        }}
      >
        Loading...
      </div>
      <div
        style={{
          width: '240px',
          height: '6px',
          backgroundColor: 'var(--panel-bg)',
          borderRadius: '3px',
          overflow: 'hidden',
          boxShadow: 'inset 0 1px 2px rgba(0,0,0,0.2)'
        }}
      >
        <div
          style={{
            height: '100%',
            width: `${progress}%`,
            backgroundColor: 'var(--accent-color)',
            transition: 'width 0.2s ease-out',
            boxShadow: '0 0 10px var(--accent-color)'
          }}
        />
      </div>

      <style>
        {`
          @keyframes pulse {
            0% { transform: scale(1); opacity: 1; }
            50% { transform: scale(1.05); opacity: 0.8; }
            100% { transform: scale(1); opacity: 1; }
          }
        `}
      </style>
    </div>
  );
}
