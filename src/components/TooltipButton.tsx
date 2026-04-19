import { ReactNode, MouseEvent } from 'react';
import { useTooltip } from './TooltipContext';

interface TooltipButtonProps {
  children: ReactNode;
  tooltip: string;
  className?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}

export default function TooltipButton({ children, tooltip, className, onClick, style }: TooltipButtonProps) {
  const { showTooltip, hideTooltip } = useTooltip();

  const handleMouseEnter = (e: MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    showTooltip(tooltip, rect.left + rect.width / 2, rect.top);
  };

  const handleMouseLeave = () => {
    hideTooltip();
  };

  return (
    <button
      className={className}
      onClick={onClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleMouseEnter}
      onBlur={handleMouseLeave}
      style={style}
    >
      {children}
    </button>
  );
}
