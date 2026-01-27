export function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function getFirstDayOfMonth(year: number, month: number): number {
  return new Date(year, month, 1).getDay();
}

export function formatDateKey(year: number, month: number, day: number): string {
  const m = String(month + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export function getMonthName(month: number): string {
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];
  return months[month];
}

export interface CalendarDay {
  day: number;
  dateKey: string;
  isCurrentMonth: boolean;
}

export function getCalendarDays(year: number, month: number): CalendarDay[] {
  const days: CalendarDay[] = [];
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  // Previous month days
  const prevMonth = month === 0 ? 11 : month - 1;
  const prevYear = month === 0 ? year - 1 : year;
  const daysInPrevMonth = getDaysInMonth(prevYear, prevMonth);

  for (let i = firstDay - 1; i >= 0; i--) {
    const day = daysInPrevMonth - i;
    days.push({
      day,
      dateKey: formatDateKey(prevYear, prevMonth, day),
      isCurrentMonth: false
    });
  }

  // Current month days
  for (let day = 1; day <= daysInMonth; day++) {
    days.push({
      day,
      dateKey: formatDateKey(year, month, day),
      isCurrentMonth: true
    });
  }

  // Next month days (fill to complete 6 rows)
  const nextMonth = month === 11 ? 0 : month + 1;
  const nextYear = month === 11 ? year + 1 : year;
  const remainingDays = 42 - days.length;

  for (let day = 1; day <= remainingDays; day++) {
    days.push({
      day,
      dateKey: formatDateKey(nextYear, nextMonth, day),
      isCurrentMonth: false
    });
  }

  return days;
}
