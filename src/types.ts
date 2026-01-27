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
