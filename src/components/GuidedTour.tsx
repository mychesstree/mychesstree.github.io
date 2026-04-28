import { useState, useEffect, useCallback, useRef } from 'react';
import { X, ChevronRight, ChevronLeft, Check } from 'lucide-react';

interface TourStep {
  targetId: string;
  title: string;
  content: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

interface GuidedTourProps {
  steps: TourStep[];
  onComplete: () => void;
  onSkip: () => void;
}

export default function GuidedTour({ steps, onComplete, onSkip }: GuidedTourProps) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const currentStep = steps[currentStepIndex];

  const updateSpotlight = useCallback(() => {
    const element = document.getElementById(currentStep.targetId);
    if (element) {
      setTargetRect(element.getBoundingClientRect());
      setIsVisible(true);
    } else {
      setIsVisible(false);
    }
  }, [currentStep.targetId]);

  useEffect(() => {
    updateSpotlight();
    window.addEventListener('resize', updateSpotlight);
    window.addEventListener('scroll', updateSpotlight);
    return () => {
      window.removeEventListener('resize', updateSpotlight);
      window.removeEventListener('scroll', updateSpotlight);
    };
  }, [updateSpotlight]);

  const handleNext = () => {
    if (currentStepIndex < steps.length - 1) {
      setCurrentStepIndex(currentStepIndex + 1);
    } else {
      onComplete();
    }
  };

  const handleBack = () => {
    if (currentStepIndex > 0) {
      setCurrentStepIndex(currentStepIndex - 1);
    }
  };

  if (!isVisible || !targetRect) return null;

  // Calculate tooltip position
  const getTooltipStyle = () => {
    const padding = 12;
    const { top, left, width, height, bottom, right } = targetRect;
    const position = currentStep.position || 'bottom';
    const tooltipWidth = 280;
    const halfWidth = tooltipWidth / 2;
    const centerX = left + width / 2;
    
    // Clamp centerX to keep tooltip within window
    const adjustedX = Math.max(halfWidth + padding, Math.min(window.innerWidth - halfWidth - padding, centerX));

    switch (position) {
      case 'top':
        return { bottom: window.innerHeight - top + padding, left: adjustedX, transform: 'translateX(-50%)' };
      case 'bottom':
        return { top: bottom + padding, left: adjustedX, transform: 'translateX(-50%)' };
      case 'left':
        return { top: top + height / 2, right: window.innerWidth - left + padding, transform: 'translateY(-50%)' };
      case 'right':
        return { top: top + height / 2, left: right + padding, transform: 'translateY(-50%)' };
      default:
        return { top: bottom + padding, left: adjustedX, transform: 'translateX(-50%)' };
    }
  };

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      width: '100vw',
      height: '100vh',
      zIndex: 100000,
      pointerEvents: 'none'
    }}>
      {/* Dimmed background with spotlight hole */}
      <div style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        backgroundColor: 'rgba(0, 0, 0, 0.7)',
        maskImage: `radial-gradient(circle at ${targetRect.left + targetRect.width / 2}px ${targetRect.top + targetRect.height / 2}px, transparent ${Math.max(targetRect.width, targetRect.height) / 1.5}px, black ${Math.max(targetRect.width, targetRect.height) / 1.5 + 5}px)`,
        WebkitMaskImage: `radial-gradient(circle at ${targetRect.left + targetRect.width / 2}px ${targetRect.top + targetRect.height / 2}px, transparent ${Math.max(targetRect.width, targetRect.height) / 1.5}px, black ${Math.max(targetRect.width, targetRect.height) / 1.5 + 5}px)`,
        pointerEvents: 'auto',
        transition: 'all 0.3s ease'
      }} onClick={onSkip} />

      {/* Tooltip */}
      <div 
        ref={tooltipRef}
        style={{
          position: 'absolute',
          ...getTooltipStyle(),
          width: '280px',
          backgroundColor: 'var(--panel-bg)',
          border: '1px solid var(--accent-color)',
          borderRadius: '12px',
          padding: '1.25rem',
          boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
          zIndex: 100001,
          pointerEvents: 'auto',
          animation: 'fadeInUp 0.3s ease-out'
        }}
      >
        <button 
          onClick={onSkip}
          style={{ position: 'absolute', top: '10px', right: '10px', background: 'none', border: 'none', color: 'var(--text-muted)', cursor: 'pointer' }}
        >
          <X size={16} />
        </button>

        <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--accent-color)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '0.5rem' }}>
          Step {currentStepIndex + 1} of {steps.length}
        </div>
        
        <h4 style={{ margin: '0 0 0.5rem 0', color: 'var(--text-main)', fontSize: '1.1rem' }}>{currentStep.title}</h4>
        <p style={{ margin: '0 0 1.25rem 0', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: '1.5' }}>
          {currentStep.content}
        </p>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button 
            onClick={onSkip}
            style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: '0.85rem', cursor: 'pointer' }}
          >
            Skip
          </button>
          
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            {currentStepIndex > 0 && (
              <button 
                onClick={handleBack}
                className="btn btn-secondary"
                style={{ padding: '0.4rem', borderRadius: '8px' }}
              >
                <ChevronLeft size={18} />
              </button>
            )}
            <button 
              onClick={handleNext}
              className="btn"
              style={{ 
                padding: '0.4rem 1rem', 
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                gap: '0.4rem'
              }}
            >
              {currentStepIndex === steps.length - 1 ? (
                <>Finish <Check size={16} /></>
              ) : (
                <>Next <ChevronRight size={16} /></>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
