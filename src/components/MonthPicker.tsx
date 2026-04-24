import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Calendar } from 'lucide-react';

interface MonthPickerProps {
  value: string; // YYYY-MM format
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
}

export default function MonthPicker({ value, onChange, placeholder = "Select month", disabled = false }: MonthPickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentYear, setCurrentYear] = useState(() => {
    return value ? parseInt(value.split('-')[0]) : new Date().getFullYear();
  });
  
  const pickerRef = useRef<HTMLDivElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);

  const months = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
  ];

  const formatDisplayValue = (dateString: string) => {
    if (!dateString) return placeholder;
    const [year, month] = dateString.split('-');
    const monthIndex = parseInt(month) - 1;
    return `${months[monthIndex]} ${year}`;
  };

  const handleMonthClick = (monthIndex: number) => {
    const monthString = String(monthIndex + 1).padStart(2, '0');
    const newValue = `${currentYear}-${monthString}`;
    onChange(newValue);
    setIsOpen(false);
  };

  const handleYearChange = (direction: 'prev' | 'next') => {
    setCurrentYear(prev => prev + (direction === 'next' ? 1 : -1));
  };

  const handleClickOutside = (event: MouseEvent) => {
    // Check if click is outside both the button and the popup
    if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
      const popup = document.querySelector('.month-picker-calendar');
      if (popup && !popup.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
  };

  useEffect(() => {
    if (isOpen) {
      document.addEventListener('click', handleClickOutside);
      return () => document.removeEventListener('click', handleClickOutside);
    }
  }, [isOpen]);

  const selectedMonth = value ? parseInt(value.split('-')[1]) - 1 : null;

  return (
    <>
      {isOpen && (
        <div ref={calendarRef} className="month-picker-calendar">
          <div className="month-picker-header">
            <button
              type="button"
              className="month-picker-nav"
              onClick={() => handleYearChange('prev')}
            >
              <ChevronLeft size={16} />
            </button>
            <div className="month-picker-year">{currentYear}</div>
            <button
              type="button"
              className="month-picker-nav"
              onClick={() => handleYearChange('next')}
            >
              <ChevronRight size={16} />
            </button>
          </div>
          
          <div className="month-picker-grid">
            {months.map((month, index) => (
              <button
                key={month}
                type="button"
                className={`month-picker-month ${selectedMonth === index ? 'selected' : ''}`}
                onClick={() => handleMonthClick(index)}
              >
                {month}
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="month-picker" ref={pickerRef}>
        <button
          type="button"
          className="month-picker-icon-btn"
          onClick={() => !disabled && setIsOpen(!isOpen)}
          disabled={disabled}
          title={formatDisplayValue(value)}
        >
          <Calendar size={16} />
        </button>
      </div>
    </>
  );
}
