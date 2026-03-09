
import { CaseType } from "./env";

export interface VerificationData {
  quote: string;
  page: string;
  paragraph: string;
  boundingBox?: [number, number, number, number]; // [ymin, xmin, ymax, xmax] normalized 0-1000
}

export interface Reminder {
  id: string;
  type: 'Email' | 'Calendar Event';
  quantity: number;
  unit: 'minutes' | 'hours' | 'days' | 'weeks';
  calendarTitle?: string;
  calendarDescription?: string;
  // Simplified logic: store toggles and manual selections separately
  remindStaff: boolean;
  remindAttorneys: boolean;
  manualUsers: string[]; 
}

export interface Event {
  id: string; 
  selected: boolean; 
  doc_index: number; 
  title: string;
  start_date: string;  
  end_date: string;    
  start_time?: string; 
  end_time?: string;   
  is_all_day: boolean;
  location?: string;   
  description?: string;
  date_type?: 'explicit' | 'calculated'; 
  calculation_logic?: string; 
  verification: VerificationData;
  reminders?: Reminder[];
  targetCalendar?: string; 
  // Simplified logic: store toggles and manual selections separately
  inviteAllStaff: boolean;
  inviteAllAttorneys: boolean;
  manualInvitees: string[]; 
  inviteClient?: boolean;
  sopMatchId?: string;
}

export interface User {
  id: string | number;
  name: string;
  subscription_type: 'Attorney' | 'NonAttorney';
  default_calendar_id?: string | number;
  notification_method_id?: string | number;
}

export interface Calendar {
  id: string | number;
  name: string;
}

// --- NEW SOP STRUCTURES ---

export interface SOPEvent {
  id: string; // Internal ID or RecordID
  RecordID: string;
  "Case Type"?: string;
  "Event Name"?: string;
  "Reminders"?: string[]; // Array of Reminder IDs
  "Title in Calendar Event"?: string;
  "Description in Calendar Event"?: string;
  "Invite All Attorneys"?: boolean | null;
  "Invite All Staff Members"?: boolean | null;
  "Default Duration (Hours)"?: number | null;
}

export interface SOPReminder {
  id: string;
  "Reminder ID": string;
  "Unit": 'minutes' | 'hours' | 'days' | 'weeks';
  "Quantity": number;
  "Type of Reminder": 'Email' | 'Calendar Event';
  "Remind All Attorneys"?: boolean | null;
  "Remind All Staff Members"?: boolean | null;
  "Calendar Event Reminder Title"?: string;
  "Calendar Event Reminder Description"?: string;
  "Calendar Event"?: string[]; // Array of Event IDs (Reverse lookup from payload)
}

export interface AnalysisState {
  status: 'idle' | 'uploading' | 'analyzing' | 'success' | 'error';
  message?: string;
  caseType?: CaseType;
  involvedStaff?: string[]; // Names
  involvedAttorneys?: string[]; // Names
  defaultCalendarName?: string; // Name
  
  // New Structured SOP Data
  sopEvents?: SOPEvent[];
  sopReminders?: SOPReminder[];
  
  availableUsers?: User[];
  availableCalendars?: Calendar[];
}

export interface AnalyzedDoc {
  fileName: string;
  file: File;
  status: 'pending' | 'analyzing' | 'success' | 'error';
  error?: string;
  events: Event[];
  caseType?: CaseType;
  stats: {
    totalEvents: number;
    matchedEvents: number;
    remindersAdded: number;
  };
}
