
import { Calendar, User, SOPEvent, SOPReminder } from "../types";

const CACHE_KEY_CALENDARS = "ai_clerk_cached_calendars";
const CACHE_KEY_USERS = "ai_clerk_cached_users";

// Global promise to deduplicate simultaneous requests
let activeFetchPromise: Promise<{ 
  sopEvents: SOPEvent[], 
  sopReminders: SOPReminder[] 
}> | null = null;

/**
 * Shared internal helper to fetch the SOP data (events and reminders).
 */
export const fetchAllIntegrationData = async (): Promise<{ 
  sopEvents: SOPEvent[], 
  sopReminders: SOPReminder[]
}> => {
  if (activeFetchPromise) return activeFetchPromise;

  activeFetchPromise = (async () => {
    try {
      const localResponse = await fetch('/api/sop-data');
      if (localResponse.ok) {
        const data = await localResponse.json();
        const container = Array.isArray(data) ? data[0] : data;
        if (container) {
          const sopEvents: SOPEvent[] = (container["Calendar Events"] || []).map((e: any) => ({
            ...e,
            id: e.id || e.RecordID || `rec_${Math.random().toString(36).substr(2, 9)}`
          }));
          const sopReminders: SOPReminder[] = (container.Reminders || []).map((r: any) => ({
            ...r,
            id: r.id || r["Reminder ID"] || `rem_${Math.random().toString(36).substr(2, 9)}`
          }));
          
          return { 
            sopEvents, 
            sopReminders
          };
        }
      }
    } catch (localError) {
      console.error("Local SOP data fetch failed:", localError);
    }

    return { sopEvents: [], sopReminders: [] };
  })();

  const result = await activeFetchPromise;
  activeFetchPromise = null; // Reset after completion
  return result;
};

/**
 * Fetches available calendars from Clio Manage.
 */
export const getCalendars = async (): Promise<Calendar[]> => {
  const cached = sessionStorage.getItem(CACHE_KEY_CALENDARS);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }
  try {
    const calendars = await fetchClioCalendars();
    sessionStorage.setItem(CACHE_KEY_CALENDARS, JSON.stringify(calendars));
    return calendars;
  } catch (error) {
    console.error("Failed to fetch calendars from Clio:", error);
    return [];
  }
};

/**
 * Fetches available users from Clio Manage.
 */
export const getUsers = async (): Promise<User[]> => {
  const cached = sessionStorage.getItem(CACHE_KEY_USERS);
  if (cached) {
    try {
      return JSON.parse(cached);
    } catch (e) {}
  }
  try {
    const users = await fetchClioUsers();
    sessionStorage.setItem(CACHE_KEY_USERS, JSON.stringify(users));
    return users;
  } catch (error) {
    console.error("Failed to fetch users from Clio:", error);
    return [];
  }
};

/**
 * Saves the SOP data back to the server.
 */
export const saveSOPData = async (data: {
  Reminders: SOPReminder[];
  "Calendar Events": SOPEvent[];
}): Promise<boolean> => {
  try {
    const response = await fetch('/api/sop-data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify([data]), // Wrap in array to match the structure
    });
    return response.ok;
  } catch (error) {
    console.error("Error saving SOP data:", error);
    return false;
  }
};

/**
 * Fetches users directly from Clio Manage.
 */
export const fetchClioUsers = async (): Promise<User[]> => {
  const response = await fetch('/api/clio/users');
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to fetch Clio users');
  }
  const data = await response.json();
  return data.map((u: any) => ({
    id: u.id,
    name: u.name,
    subscription_type: u.subscription_type,
    default_calendar_id: u.default_calendar_id
  }));
};

/**
 * Fetches calendars directly from Clio Manage.
 */
export const fetchClioCalendars = async (): Promise<Calendar[]> => {
  const response = await fetch('/api/clio/calendars');
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    throw new Error(errorData.error || 'Failed to fetch Clio calendars');
  }
  const data = await response.json();
  return data.map((c: any) => ({
    id: c.id,
    name: c.name
  }));
};
