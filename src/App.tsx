import { useState, useEffect, useCallback } from 'react';
import { Header } from './components/Header';
import { Calendar } from './components/Calendar';
import { CalendarSwitcher } from './components/CalendarSwitcher';
import { LabelPicker } from './components/LabelPicker';
import { SettingsManager } from './components/SettingsManager';
import { ShareManager } from './components/ShareManager';
import { AuthForm } from './components/AuthForm';
import { GoogleEventDetails } from './components/GoogleEventDetails';
import { GoogleCalendarEvent } from './types';
import { useAuth } from './hooks/useAuth';
import { useLabels } from './hooks/useLabels';
import { useShifts } from './hooks/useShifts';
import { useShares } from './hooks/useShares';
import { useSharedCalendar } from './hooks/useSharedCalendar';
import { useGoogleCalendar } from './hooks/useGoogleCalendar';
import { useToast } from './context/ToastContext';

export default function App() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showShare, setShowShare] = useState(false);
  const [viewingOwnerEmail, setViewingOwnerEmail] = useState<string | null>(null);
  const [selectedGoogleEvent, setSelectedGoogleEvent] = useState<GoogleCalendarEvent | null>(null);

  const { addToast } = useToast();

  const handleSyncError = useCallback(
    (error: string) => {
      addToast(error, 'error');
    },
    [addToast],
  );

  const { authenticated, loading: authLoading, login, registerInitiate, registerVerify, logout, email } = useAuth();
  const { labels, addLabel, updateLabel, deleteLabel, loading: labelsLoading } = useLabels(authenticated);
  const { shifts, setShift, clearShift, getShift, loading: shiftsLoading } = useShifts(authenticated, handleSyncError);
  const { shares, sharedWithMe, addShare, removeShare } = useShares(authenticated);
  const sharedCalendar = useSharedCalendar(viewingOwnerEmail);
  const google = useGoogleCalendar(authenticated, year, month);

  // Handle OAuth redirect - refetch status when returning from Google
  useEffect(() => {
    google.refetchStatus();
  }, []);

  const handlePrevMonth = () => {
    if (month === 0) {
      setMonth(11);
      setYear((y) => y - 1);
    } else {
      setMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 11) {
      setMonth(0);
      setYear((y) => y + 1);
    } else {
      setMonth((m) => m + 1);
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
  const isViewingShared = viewingOwnerEmail !== null;

  const displayShifts = isViewingShared && sharedCalendar.data ? sharedCalendar.data.shifts : shifts;
  const displayLabels = isViewingShared && sharedCalendar.data ? sharedCalendar.data.labels : labels;

  return (
    <div className="h-screen flex flex-col">
      <Header
        year={year}
        month={month}
        onPrevMonth={handlePrevMonth}
        onNextMonth={handleNextMonth}
        onToday={handleToday}
        onOpenSettings={() => setShowSettings(true)}
        onOpenShare={isViewingShared ? undefined : () => setShowShare(true)}
        email={email}
        onLogout={logout}
      />

      <CalendarSwitcher
        sharedCalendars={sharedWithMe}
        selectedEmail={viewingOwnerEmail}
        onSelect={setViewingOwnerEmail}
      />

      {isLoading || sharedCalendar.loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-gray-600">Loading your calendar...</div>
        </div>
      ) : (
        <Calendar
          year={year}
          month={month}
          shifts={displayShifts}
          labels={displayLabels}
          onDayTap={handleDayTap}
          readOnly={isViewingShared}
          onSwipeLeft={handleNextMonth}
          onSwipeRight={handlePrevMonth}
          googleEventsByDate={isViewingShared ? undefined : google.eventsByDate}
          onGoogleEventTap={setSelectedGoogleEvent}
        />
      )}

      {selectedDate && !isViewingShared && (
        <LabelPicker
          labels={labels}
          currentLabelId={getShift(selectedDate)}
          onSelect={handleSelectLabel}
          onClear={handleClearShift}
          onClose={() => setSelectedDate(null)}
        />
      )}

      {showSettings && (
        <SettingsManager
          labels={labels}
          onAdd={addLabel}
          onUpdate={updateLabel}
          onDelete={deleteLabel}
          onClose={() => setShowSettings(false)}
          googleConnected={google.connected}
          googleVisible={google.visible}
          onGoogleConnect={google.connect}
          onGoogleDisconnect={google.disconnect}
          onToggleGoogleVisibility={google.toggleVisibility}
        />
      )}

      {showShare && (
        <ShareManager shares={shares} onAdd={addShare} onRemove={removeShare} onClose={() => setShowShare(false)} />
      )}

      {selectedGoogleEvent && (
        <GoogleEventDetails event={selectedGoogleEvent} onClose={() => setSelectedGoogleEvent(null)} />
      )}
    </div>
  );
}
