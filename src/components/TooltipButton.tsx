import type { ReactNode, MouseEvent, FocusEventHandler } from 'react';
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

  const handleFocus: FocusEventHandler<HTMLButtonElement> = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    showTooltip(tooltip, rect.left + rect.width / 2, rect.top);
  };

  const handleBlur = () => {
    hideTooltip();
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    showTooltip(tooltip, rect.left + rect.width / 2, rect.top);
    if (onClick) onClick();
  };

  return (
    <button
      className={className}
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onFocus={handleFocus}
      onBlur={handleBlur}
      style={style}
    >
      {children}
    </button>
  );
}
