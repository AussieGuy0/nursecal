import { getMonthName } from '../utils/calendar';

interface HeaderProps {
  year: number;
  month: number;
  onPrevMonth: () => void;
  onNextMonth: () => void;
  onOpenSettings: () => void;
  email?: string | null;
  onLogout?: () => void;
}

export function Header({ year, month, onPrevMonth, onNextMonth, onOpenSettings, email, onLogout }: HeaderProps) {
  return (
    <header className="bg-white border-b border-gray-200">
      <div className="flex items-center justify-between px-4 py-3">
        <button
          onClick={onPrevMonth}
          className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors"
          aria-label="Previous month"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>

        <h1 className="text-lg font-semibold">
          {getMonthName(month)} {year}
        </h1>

        <div className="flex items-center gap-2">
          <button
            onClick={onNextMonth}
            className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors"
            aria-label="Next month"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </button>

          <button
            onClick={onOpenSettings}
            className="p-2 rounded-full hover:bg-gray-100 active:bg-gray-200 transition-colors"
            aria-label="Settings"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </button>
        </div>
      </div>

      {email && onLogout && (
        <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-t border-gray-100">
          <span className="text-sm text-gray-600 truncate">{email}</span>
          <button
            onClick={onLogout}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Sign out
          </button>
        </div>
      )}
    </header>
  );
}
