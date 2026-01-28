import { useState } from 'react';
import { Header } from './components/Header';
import { Calendar } from './components/Calendar';
import { LabelPicker } from './components/LabelPicker';
import { LabelManager } from './components/LabelManager';
import { AuthForm } from './components/AuthForm';
import { useAuth } from './hooks/useAuth';
import { useLabels } from './hooks/useLabels';
import { useShifts } from './hooks/useShifts';

export default function App() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);

  const { authenticated, loading: authLoading, login, registerInitiate, registerVerify, logout, email } = useAuth();
  const { labels, addLabel, updateLabel, deleteLabel, loading: labelsLoading } = useLabels(authenticated);
  const { shifts, setShift, clearShift, getShift, loading: shiftsLoading } = useShifts(authenticated);

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

  const handleToday = () => {
    const now = new Date();
    setYear(now.getFullYear());
    setMonth(now.getMonth());
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

  // Show loading spinner while checking auth
  if (authLoading) {
    return (
      <div className="h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-600">Loading...</div>
      </div>
    );
  }

  // Show auth form if not authenticated
  if (!authenticated) {
    return <AuthForm onLogin={login} onRegisterInitiate={registerInitiate} onRegisterVerify={registerVerify} />;
  }

  // Show loading state while fetching data
  const isLoading = labelsLoading || shiftsLoading;

  return (
    <div className="h-screen flex flex-col">
      <Header
        year={year}
        month={month}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onToday={handleToday}
        onOpenSettings={() => setShowSettings(true)}
        email={email}
        onLogout={logout}
      />

      {isLoading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-600">Loading your calendar...</div>
        </div>
      ) : (
        <Calendar
          year={year}
          month={month}
          shifts={shifts}
          labels={labels}
          onDayTap={handleDayTap}
          onSwipeLeft={handleNextMonth}
          onSwipeRight={handlePrevMonth}
        />
      )}

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
