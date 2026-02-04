import { useRef, useCallback, useState } from 'react';
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
  onGoogleEventTap?: (event: GoogleCalendarEvent) => void;
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const SWIPE_THRESHOLD = 50;

type SlideDirection = 'left' | 'right';
type SlidePhase = 'out' | 'in';

function getAnimationClass(direction: SlideDirection, phase: SlidePhase): string {
  if (phase === 'out') {
    return direction === 'left' ? 'animate-slide-out-left' : 'animate-slide-out-right';
  }
  return direction === 'left' ? 'animate-slide-in-from-right' : 'animate-slide-in-from-left';
}

export function Calendar({ year, month, shifts, labels, onDayTap, onSwipeLeft, onSwipeRight, googleEventsByDate, onGoogleEventTap }: CalendarProps) {
  const days = getCalendarDays(year, month);
  const today = new Date();
  const todayKey = formatDateKey(today.getFullYear(), today.getMonth(), today.getDate());

  const touchStartX = useRef<number | null>(null);
  const touchStartY = useRef<number | null>(null);
  const pendingSwipe = useRef<(() => void) | null>(null);

  const [slideDirection, setSlideDirection] = useState<SlideDirection | null>(null);
  const [slidePhase, setSlidePhase] = useState<SlidePhase | null>(null);

  const isAnimating = slideDirection !== null;

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    if (isAnimating) return;
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  }, [isAnimating]);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (isAnimating) return;
    if (touchStartX.current === null || touchStartY.current === null) return;

    const deltaX = e.changedTouches[0].clientX - touchStartX.current;
    const deltaY = e.changedTouches[0].clientY - touchStartY.current;

    if (Math.abs(deltaX) > Math.abs(deltaY) && Math.abs(deltaX) > SWIPE_THRESHOLD) {
      if (deltaX > 0 && onSwipeRight) {
        pendingSwipe.current = onSwipeRight;
        setSlideDirection('right');
        setSlidePhase('out');
      } else if (deltaX < 0 && onSwipeLeft) {
        pendingSwipe.current = onSwipeLeft;
        setSlideDirection('left');
        setSlidePhase('out');
      }
    }

    touchStartX.current = null;
    touchStartY.current = null;
  }, [isAnimating, onSwipeLeft, onSwipeRight]);

  const handleAnimationEnd = useCallback(() => {
    if (slidePhase === 'out') {
      pendingSwipe.current?.();
      pendingSwipe.current = null;
      setSlidePhase('in');
    } else if (slidePhase === 'in') {
      setSlideDirection(null);
      setSlidePhase(null);
    }
  }, [slidePhase]);

  const getLabelById = (id: string): Label | undefined => {
    return labels.find(l => l.id === id);
  };

  const animationClass = slideDirection && slidePhase
    ? getAnimationClass(slideDirection, slidePhase)
    : '';

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
      <div className="overflow-hidden flex-1">
        <div
          className={`grid grid-cols-7 h-full ${animationClass}`}
          onAnimationEnd={handleAnimationEnd}
        >
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
              onGoogleEventTap={onGoogleEventTap}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
