import type { ReactNode, MouseEvent, FocusEventHandler } from 'react';
import { useTooltip } from './TooltipContext';
import { useMobile } from '../hooks/useMobile';

interface TooltipButtonProps {
  children: ReactNode;
  tooltip: string;
  className?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
  id?: string;
}

export default function TooltipButton({ children, tooltip, className, onClick, style, id }: TooltipButtonProps) {
  const { showTooltip, hideTooltip } = useTooltip();
  const isMobile = useMobile();

  const handleMouseEnter = (e: MouseEvent<HTMLButtonElement>) => {
    if (isMobile) return;
    const rect = e.currentTarget.getBoundingClientRect();
    showTooltip(tooltip, rect.left + rect.width / 2, rect.top);
  };

  const handleMouseLeave = () => {
    if (isMobile) return;
    hideTooltip();
  };

  const handleFocus: FocusEventHandler<HTMLButtonElement> = (e) => {
    if (isMobile) return;
    const rect = e.currentTarget.getBoundingClientRect();
    showTooltip(tooltip, rect.left + rect.width / 2, rect.top);
  };

  const handleBlur = () => {
    if (isMobile) return;
    hideTooltip();
  };

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    if (isMobile) {
      if (onClick) onClick();
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    showTooltip(tooltip, rect.left + rect.width / 2, rect.top);
    if (onClick) onClick();
  };

  return (
    <button
      id={id}
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
