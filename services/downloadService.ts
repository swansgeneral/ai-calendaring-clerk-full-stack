import { Event } from "../types";
import { ENV_VARS } from "../env";

/**
 * Internal helper to format 24h time to 12h AM/PM.
 */
const formatTimeAMPM = (timeStr?: string): string => {
  if (!timeStr) return "";
  try {
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${h12}:${minutes} ${ampm}`;
  } catch {
    return timeStr || "";
  }
};

/**
 * Formats and triggers a download for an ICS calendar file.
 */
export const exportToICS = (events: Event[]): void => {
  let icsContent = "BEGIN:VCALENDAR\nVERSION:2.0\nPRODID:-//AI Calendaring Clerk//EN\nCALSCALE:GREGORIAN\n";
  const timezone = ENV_VARS.TIMEZONE;
  
  events.forEach(event => {
    if (!event.start_date) return;
    
    const startDateStr = event.start_date.replace(/-/g, '');
    
    icsContent += "BEGIN:VEVENT\n";
    icsContent += `SUMMARY:${event.title}\n`;

    if (event.is_all_day) {
      // All-day event formatting:
      // RFC 5545 requires DTEND to be the day AFTER the event ends (exclusive)
      const endDateValue = event.end_date || event.start_date;
      const end = new Date(endDateValue + 'T00:00:00');
      end.setDate(end.getDate() + 1);
      
      const nextDayStr = end.getFullYear().toString() + 
                         (end.getMonth() + 1).toString().padStart(2, '0') + 
                         end.getDate().toString().padStart(2, '0');

      icsContent += `DTSTART;VALUE=DATE:${startDateStr}\n`;
      icsContent += `DTEND;VALUE=DATE:${nextDayStr}\n`;
    } else {
      // Timed event formatting with Timezone support
      const endDateStr = (event.end_date || event.start_date).replace(/-/g, '');
      const startTimeClean = (event.start_time || "00:00").replace(/:/g, '') + "00";
      icsContent += `DTSTART;TZID=${timezone}:${startDateStr}T${startTimeClean}\n`;
      const endTimeClean = (event.end_time || "00:00").replace(/:/g, '') + "00";
      icsContent += `DTEND;TZID=${timezone}:${endDateStr}T${endTimeClean}\n`;
    }

    if (event.location) {
      icsContent += `LOCATION:${event.location}\n`;
    }
    
    icsContent += `DESCRIPTION:${(event.description || "").replace(/\n/g, '\\n')}\n`;
    icsContent += "END:VEVENT\n";
  });
  
  icsContent += "END:VCALENDAR";
  
  const blob = new Blob([icsContent], { type: 'text/calendar' });
  triggerDownload(blob, 'schedule.ics');
};

/**
 * Formats and triggers a download for a CSV spreadsheet file.
 */
export const exportToCSV = (events: Event[]): void => {
  const header = ["Title", "Start Date", "End Date", "Start Time", "End Time", "Location", "Description", "Source Quote", "Page"];
  const rows = events.map(e => {
    const startTime = !e.is_all_day ? formatTimeAMPM(e.start_time) : "";
    const endTime = !e.is_all_day ? formatTimeAMPM(e.end_time) : "";
    
    return [
      `"${e.title.replace(/"/g, '""')}"`,
      e.start_date,
      e.end_date || "",
      startTime,
      endTime,
      `"${(e.location || "").replace(/"/g, '""')}"`,
      `"${(e.description || "").replace(/"/g, '""')}"`,
      `"${(e.verification?.quote || "").replace(/"/g, '""')}"`,
      e.verification?.page || ""
    ];
  });
  
  const csvContent = [header.join(","), ...rows.map(r => r.join(","))].join("\n");
  const blob = new Blob([csvContent], { type: 'text/csv' });
  triggerDownload(blob, 'schedule.csv');
};

/**
 * Internal helper to trigger the browser download dialog.
 */
const triggerDownload = (blob: Blob, filename: string): void => {
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
};