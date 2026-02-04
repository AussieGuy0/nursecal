const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
const GOOGLE_CALENDAR_API = 'https://www.googleapis.com/calendar/v3';
const GOOGLE_SCOPE = 'https://www.googleapis.com/auth/calendar.readonly';

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope: string;
  token_type: string;
}

interface GoogleCalendarListResponse {
  items: Array<{
    id: string;
    summary: string;
    backgroundColor?: string;
  }>;
}

interface GoogleEventResponse {
  items?: Array<{
    id: string;
    summary?: string;
    start: { dateTime?: string; date?: string };
    end: { dateTime?: string; date?: string };
  }>;
}

export interface GoogleCalendarEventResponse {
  id: string;
  summary: string;
  start: string;
  end: string;
  isAllDay: boolean;
  calendarName: string;
  color: string;
}

export function generateOAuthState(): string {
  return crypto.randomUUID();
}

export function buildAuthUrl(state: string): string | null {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !redirectUri) return null;

  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirectUri,
    response_type: 'code',
    scope: GOOGLE_SCOPE,
    access_type: 'offline',
    prompt: 'consent',
    state,
  });

  return `${GOOGLE_AUTH_URL}?${params}`;
}

export async function exchangeCodeForTokens(code: string): Promise<GoogleTokenResponse | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_REDIRECT_URI;
  if (!clientId || !clientSecret || !redirectUri) return null;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }),
  });

  if (!res.ok) return null;
  return res.json();
}

export async function refreshAccessToken(refreshToken: string): Promise<GoogleTokenResponse | null> {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret) return null;

  const res = await fetch(GOOGLE_TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!res.ok) return null;
  return res.json();
}

export async function revokeToken(token: string): Promise<boolean> {
  const res = await fetch(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(token)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
  return res.ok;
}

export async function fetchAllCalendarEvents(
  accessToken: string,
  timeMin: string,
  timeMax: string,
): Promise<GoogleCalendarEventResponse[] | null> {
  const headers = { Authorization: `Bearer ${accessToken}` };

  const listRes = await fetch(`${GOOGLE_CALENDAR_API}/users/me/calendarList`, { headers });
  if (!listRes.ok) return null;

  const calendarList: GoogleCalendarListResponse = await listRes.json();

  const eventPromises = calendarList.items.map(async (cal) => {
    const params = new URLSearchParams({
      timeMin,
      timeMax,
      singleEvents: 'true',
      orderBy: 'startTime',
      maxResults: '250',
    });

    const eventsRes = await fetch(`${GOOGLE_CALENDAR_API}/calendars/${encodeURIComponent(cal.id)}/events?${params}`, {
      headers,
    });

    if (!eventsRes.ok) return [];

    const data: GoogleEventResponse = await eventsRes.json();
    return (data.items || []).map((event) => ({
      id: event.id,
      summary: event.summary || '(No title)',
      start: event.start.dateTime || event.start.date || '',
      end: event.end.dateTime || event.end.date || '',
      isAllDay: !event.start.dateTime,
      calendarName: cal.summary,
      color: cal.backgroundColor || '#f59e0b',
    }));
  });

  const results = await Promise.all(eventPromises);
  return results.flat();
}
