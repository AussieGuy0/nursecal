export interface Label {
  id: string;
  shortCode: string;
  name: string;
  color: string;
}

export interface Shift {
  date: string;
  labelId: string;
}

export interface ShiftMap {
  [date: string]: string; // date -> labelId
}

export interface NoteMap {
  [date: string]: string; // date -> note text
}

export interface ActionResult {
  success: boolean;
  error?: string;
}

export interface Share {
  id: string;
  email: string;
}

export interface SharedCalendar {
  email: string;
}

export interface SharedCalendarData {
  shifts: ShiftMap;
  notes: NoteMap;
  labels: Label[];
}

export interface GoogleCalendarEvent {
  id: string;
  summary: string;
  start: string;
  end: string;
  isAllDay: boolean;
  calendarName?: string;
  color?: string;
}
