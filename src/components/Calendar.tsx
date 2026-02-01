import { useRef, useCallback } from 'react';
import { DayCell } from './DayCell';
import { getCalendarDays, formatDateKey } from '../utils/calendar';
import { Label, GoogleCalendarEvent } from '../types';

interface CalendarProps {
  year: number;
  month: number;
  shifts: { [date: string]: string };
  labels: Label[];
  onDayTap: (dateKey: string) => void;
  onSwipeLeft?: () => void;
  onSwipeRight?: () => void;
  googleEventsByDate?: Record<string, GoogleCalendarEvent[]>;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const SWIPE_THRESHOLD = 50;

export function Calendar({ year, month, shifts, labels, onDayTap, onSwipeLeft, onSwipeRight, googleEventsByDate }: CalendarProps) {
  const days = getCalendarDays(year, month);
  const today = new Date();
  const todayKey = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null || touchStartY.current === null) return;

    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;

    // Only trigger if horizontal swipe is dominant and exceeds threshold
    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > SWIPE_THRESHOLD) {
      if (deltaX > 0) {
        onSwipeRight?.();
      } else {
        onSwipeLeft?.();
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
  }, [onSwipeLeft, onSwipeRight]);

  const getLabelById = (id: string): Label | undefined => {
    return labels.find(l => l.id === id);
  };

  return (
    <div
      className="flex-1 flex flex-col bg-white"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Weekday headers */}
      <div className="grid grid-cols-7 border-b border-gray-200">
        {WEEKDAYS.map(day => (
          <div
            key={day}
            className="py-2 text-center text-xs font-medium text-gray-500 uppercase"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="grid grid-cols-7 flex-1">
        {days.map(({ day, dateKey, isCurrentMonth }) => (
          <DayCell
            key={dateKey}
            day={day}
            dateKey={dateKey}
            isCurrentMonth={isCurrentMonth}
            isToday={dateKey === todayKey}
            label={shifts[dateKey] ? getLabelById(shifts[dateKey]) : undefined}
            onTap={onDayTap}
            googleEvents={googleEventsByDate?.[dateKey]}
          />
        ))}
      </div>
    </div>
  );
}
