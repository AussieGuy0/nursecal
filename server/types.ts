// Shared types for the backend

export interface User {
  id: number;
  email: string;
  password_hash: string;
  created_at: string;
}

export interface Label {
  id: string;
  user_id: number;
  short_code: string;
  name: string;
  color: string;
}

export interface Calendar {
  user_id: number;
  shifts: string; // JSON string of ShiftMap
}

// Frontend-compatible types
export interface LabelResponse {
  id: string;
  shortCode: string;
  name: string;
  color: string;
}

export interface ShiftMap {
  [date: string]: string; // date -> labelId
}

export interface JWTPayload {
  userId: number;
  email: string;
}

// Default labels seeded on registration
export const DEFAULT_LABELS = [
  { shortCode: 'E', name: 'Early Shift', color: '#22c55e' },
  { shortCode: 'L', name: 'Late Shift', color: '#3b82f6' },
  { shortCode: 'N', name: 'Night Shift', color: '#8b5cf6' },
];
