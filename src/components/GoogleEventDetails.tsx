import { GoogleCalendarEvent } from '../types';

interface GoogleEventDetailsProps {
  event: GoogleCalendarEvent;
  onClose: () => void;
}

function formatEventTime(event: GoogleCalendarEvent): string {
  if (event.isAllDay) {
    return 'All day';
  }

  const startDate = new Date(event.start);
  const endDate = new Date(event.end);

  const timeFormat: Intl.DateTimeFormatOptions = {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  };

  const startTime = startDate.toLocaleTimeString(undefined, timeFormat);
  const endTime = endDate.toLocaleTimeString(undefined, timeFormat);

  const startDay = startDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  const endDay = endDate.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });

  if (startDay === endDay) {
    return `${startDay}, ${startTime} - ${endTime}`;
  }

  return `${startDay}, ${startTime} - ${endDay}, ${endTime}`;
}

export function GoogleEventDetails({ event, onClose }: GoogleEventDetailsProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg bg-white rounded-t-2xl safe-bottom">
        <div className="p-4">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-start gap-3 flex-1 min-w-0">
              <div
                className="w-4 h-4 rounded-full flex-shrink-0 mt-1"
                style={{ backgroundColor: event.color || '#f59e0b' }}
              />
              <h2 className="text-lg font-semibold break-words">{event.summary || '(No title)'}</h2>
            </div>
            <button
              onClick={onClose}
              className="p-2 -mr-2 rounded-full hover:bg-gray-100 flex-shrink-0"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="space-y-3">
            {/* Time */}
            <div className="flex items-center gap-3 text-gray-600">
              <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span className="text-sm">{formatEventTime(event)}</span>
            </div>

            {/* Calendar name */}
            {event.calendarName && (
              <div className="flex items-center gap-3 text-gray-600">
                <svg className="w-5 h-5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span className="text-sm">{event.calendarName}</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
