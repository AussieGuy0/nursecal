import { useState } from 'react';
import { Header } from './components/Header';
import { Calendar } from './components/Calendar';
import { LabelPicker } from './components/LabelPicker';
import { LabelManager } from './components/LabelManager';
import { useLabels } from './hooks/useLabels';
import { useShifts } from './hooks/useShifts';

export default function App() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const { labels, addLabel, updateLabel, deleteLabel } = useLabels();
  const { shifts, setShift, clearShift, getShift } = useShifts();

  const handlePrevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear(y => y - 1);
    } else {
      setMonth(m => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear(y => y + 1);
    } else {
      setMonth(m => m + 1);
    }
  };

  const handleDayTap = (dateKey: string) => {
    setSelectedDate(dateKey);
  };

  const handleSelectLabel = (labelId: string) => {
    if (selectedDate) {
      setShift(selectedDate, labelId);
      setSelectedDate(null);
    }
  };

  const handleClearShift = () => {
    if (selectedDate) {
      clearShift(selectedDate);
      setSelectedDate(null);
    }
  };

  return (
    <div className="h-screen flex flex-col">
      <Header
        year={year}
        month={month}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onOpenSettings={() => setShowSettings(true)}
      />

      <Calendar
        year={year}
        month={month}
        shifts={shifts}
        labels={labels}
        onDayTap={handleDayTap}
      />

      {selectedDate && (
        <LabelPicker
          labels={labels}
          currentLabelId={getShift(selectedDate)}
          onSelect={handleSelectLabel}
          onClear={handleClearShift}
          onClose={() => setSelectedDate(null)}
        />
      )}

      {showSettings && (
        <LabelManager
          labels={labels}
          onAdd={addLabel}
          onUpdate={updateLabel}
          onDelete={deleteLabel}
          onClose={() => setShowSettings(false)}
        />
      )}
    </div>
  );
}
