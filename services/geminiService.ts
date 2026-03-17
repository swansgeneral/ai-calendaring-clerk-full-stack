
import * as pdfjsLib from 'pdfjs-dist';
import { Event, Reminder, SOPEvent, SOPReminder } from "../types";
import { ENV_VARS, CaseType } from "../env";

// Setup PDF.js worker
const pdfjs = (pdfjsLib as any).GlobalWorkerOptions ? pdfjsLib : (pdfjsLib as any).default;
if (pdfjs && pdfjs.GlobalWorkerOptions) {
  pdfjs.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
}

// Helper to convert File to Base64
export const fileToGenerativePart = async (file: File): Promise<{ inlineData: { data: string; mimeType: string } }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64String = (reader.result as string).split(',')[1];
      resolve({
        inlineData: {
          data: base64String,
          mimeType: file.type,
        },
      });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

/**
 * Calculates a time and potential date offset based on a start string and a duration.
 */
const offsetDateTime = (dateStr: string, timeStr: string, offsetMinutes: number): { time: string, date: string } => {
  try {
    const [y, m, d] = dateStr.split('-').map(Number);
    const [hours, minutes] = timeStr.split(':').map(Number);
    if (isNaN(y) || isNaN(m) || isNaN(d) || isNaN(hours) || isNaN(minutes)) {
      return { time: "", date: dateStr };
    }
    
    const date = new Date(Date.UTC(y, m - 1, d, hours, minutes, 0, 0));
    date.setUTCMinutes(date.getUTCMinutes() + offsetMinutes);
    
    const resY = date.getUTCFullYear();
    const resM = String(date.getUTCMonth() + 1).padStart(2, '0');
    const resD = String(date.getUTCDate()).padStart(2, '0');
    const resH = String(date.getUTCHours()).padStart(2, '0');
    const resMin = String(date.getUTCMinutes()).padStart(2, '0');
    
    return {
      time: `${resH}:${resMin}`,
      date: `${resY}-${resM}-${resD}`
    };
  } catch {
    return { time: "", date: dateStr };
  }
};

/**
 * Helper to ensure a field is treated as an array of strings.
 * Handles: ["a", "b"], "a, b", "['a', 'b']", or single string "a".
 */
const normalizeStringArray = (input: any): string[] => {
  if (!input) return [];
  if (Array.isArray(input)) return input.map(String);
  if (typeof input === 'string') {
    const trimmed = input.trim();
    if (!trimmed) return [];
    
    // Check if it's a JSON array string
    if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed.map(String);
      } catch (e) {
        // Fallthrough if parse fails
      }
    }
    
    // Check if comma separated
    if (trimmed.includes(',')) {
      return trimmed.split(',').map(s => s.trim());
    }
    
    // Single ID
    return [trimmed];
  }
  return [String(input)];
};

export const analyzeDocument = async (
  file: File, 
  onProgress?: (progress: { current: number, total: number, phase: string }) => void
): Promise<{ events: Event[], caseType: CaseType }> => {
  if (onProgress) onProgress({ current: 0, total: 0, phase: 'reading' });

  const filePart = await fileToGenerativePart(file);

  if (onProgress) onProgress({ current: 0, total: 1, phase: 'analyzing' });

  let combinedEvents: any[] = [];
  let detectedCaseType: CaseType = ENV_VARS.DEFAULT_CASE_TYPE as CaseType;

  try {
    const response = await fetch("/api/gemini/analyze", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePart })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server error: ${response.statusText}`);
    }

    const resultData = await response.json() as { case_type: string, events: any[] };
    
    if (resultData.case_type) {
      detectedCaseType = resultData.case_type as CaseType;
    }
    
    if (resultData.events && Array.isArray(resultData.events)) {
      combinedEvents = resultData.events;
    }
  } catch (e: any) {
    console.error(`Analysis failed:`, e);
    throw e;
  }

  if (onProgress) onProgress({ current: 1, total: 1, phase: 'analyzing' });

  // 3. Deduplicate and process events
  // Deduplicate based on the verbatim quote (reference text), date, and time.
  // This allows different events on the same date (e.g., "Jury Trial" and "Conference")
  // to be kept, while ensuring the same mention in the text isn't processed twice.
  const uniqueEventsMap = new Map<string, any>();
  combinedEvents.forEach(e => {
    // Normalize quote: lowercase, remove non-alphanumeric, trim
    const normalizedQuote = String(e.verification?.quote || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
    const normalizedDate = e.start_date ? String(e.start_date).trim() : '';
    const normalizedTime = e.start_time ? String(e.start_time).trim() : '';
    
    // The quote is the primary identifier for the mention in the text.
    // We combine it with date and time to ensure we don't accidentally merge 
    // different events that might share a similar generic prefix quote.
    const key = `${normalizedQuote}|${normalizedDate}|${normalizedTime}`;
    
    if (!uniqueEventsMap.has(key)) {
      uniqueEventsMap.set(key, e);
    } else {
      // If we already have a match, we keep the one that has better verification data
      const existing = uniqueEventsMap.get(key);
      const existingHasBB = existing.verification?.bounding_box && existing.verification.bounding_box.length === 4;
      const currentHasBB = e.verification?.bounding_box && e.verification.bounding_box.length === 4;
      
      // Also check if one has a more descriptive title or description
      const existingDescLen = (existing.description || '').length;
      const currentDescLen = (e.description || '').length;

      if ((!existingHasBB && currentHasBB) || (currentDescLen > existingDescLen + 5)) {
        uniqueEventsMap.set(key, e);
      }
    }
  });

  const finalEventsList = Array.from(uniqueEventsMap.values());
  console.log(`Total unique events found across all batches: ${finalEventsList.length}`);

  const processedEvents = finalEventsList.map((e, idx) => {
    let startDate = e.start_date;
    let endDate = e.end_date || e.start_date;
    let startTime = e.start_time || "";
    let endTime = e.end_time || "";

    if (!e.is_all_day) {
        if (startTime && (!endTime || startTime === endTime)) {
            const offset = offsetDateTime(startDate, startTime, ENV_VARS.DEFAULT_EVENT_DURATION_MINUTES);
            endTime = offset.time;
            endDate = offset.date;
        } else if (!startTime && endTime) {
            const offset = offsetDateTime(endDate, endTime, -ENV_VARS.DEFAULT_EVENT_DURATION_MINUTES);
            startTime = offset.time;
            startDate = offset.date;
        } else if (!startTime && !endTime) {
            const offset = offsetDateTime(startDate, ENV_VARS.DEFAULT_EVENT_START_TIME, ENV_VARS.DEFAULT_EVENT_DURATION_MINUTES);
            startTime = ENV_VARS.DEFAULT_EVENT_START_TIME;
            endTime = offset.time;
            endDate = offset.date;
        }
    }

    return {
        ...e,
        start_date: startDate,
        end_date: endDate,
        start_time: startTime,
        end_time: endTime,
        verification: {
          ...e.verification,
          boundingBox: e.verification?.bounding_box
        },
        id: crypto.randomUUID(),
        selected: true,
        doc_index: idx,
        inviteAllStaff: true,
        inviteAllAttorneys: true,
        manualInvitees: []
    };
  });

  return { events: processedEvents, caseType: detectedCaseType };
};

export const applyAutoReminders = async (
  events: Event[], 
  caseType: CaseType,
  sopEvents: SOPEvent[],
  sopReminders: SOPReminder[],
  file?: File
): Promise<{ events: Event[], matchedCount: number, remindersAddedCount: number }> => {
  // Filter SOP events by Case Type first
  const relevantSopEvents = sopEvents.filter(s => s["Case Type"] === caseType);

  // If no relevant SOP data available, return events as is
  if (!relevantSopEvents.length || !sopReminders.length) {
    return { events, matchedCount: 0, remindersAddedCount: 0 };
  }

  // 1. Prepare Data for Matching
  // Minify extracted events for token efficiency
  const extractedForAI = events.map(e => ({
    id: e.id,
    title: e.title,
    description: e.description,
    verification_quote: e.verification?.quote
  }));

  // Minify SOP Events for token efficiency
  const sopListForAI = JSON.stringify(relevantSopEvents.map(s => ({
    RecordID: s.RecordID,
    "SOP Event Name": s["Event Name"] ?? "N/A",
    "Calendar Title": s["Title in Calendar Event"] ?? "N/A",
    "Calendar Description": s["Description in Calendar Event"] ?? "N/A"
  })));

  // 2. Call Server to Match Extracted Events -> SOP Record IDs
  const response = await fetch("/api/gemini/apply-reminders", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ extractedForAI, sopListForAI })
  });

  if (!response.ok) {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `Server error: ${response.statusText}`);
  }

  const resultData = await response.json() as { 
    matches: { 
      eventId: string, 
      matchedRecordId: string | null,
      updatedTitle?: string | null 
    }[] 
  };
  
  let matchedCount = 0;
  let remindersAddedCount = 0;
  const dynamicQueue: { eventId: string, template: string }[] = [];

  // 3. Deterministically Build Reminders based on matches
  const updatedEvents = events.map(originalEvent => {
    const match = resultData.matches.find(m => m.eventId === originalEvent.id);
    
    // If no match found in SOP results, return original
    if (!match || !match.matchedRecordId) return originalEvent;

    // Find the parent SOP Event object from the relevant list
    const matchedRecordIdStr = String(match.matchedRecordId).trim();
    const sopEventConfig = relevantSopEvents.find(s => String(s.RecordID).trim() === matchedRecordIdStr);
    
    if (!sopEventConfig) return originalEvent;

    matchedCount++;

    const baseEventDate = new Date(originalEvent.start_date + 'T00:00:00');
    
    // Get Reminder IDs linked to this Event
    const reminderIds = normalizeStringArray(sopEventConfig.Reminders);
    
    if (reminderIds.length > 0) {
      // Filter SOP Reminders to find the children
      const remindersToCreate = sopReminders.filter(r => 
        reminderIds.includes(String(r.id)) || 
        reminderIds.includes(String(r["Reminder ID"]))
      );

      const newReminders: Reminder[] = remindersToCreate.map(sopReminder => {
          const originalQuantity = sopReminder.Quantity;
          const originalUnit = sopReminder.Unit;
          
          let finalQuantity = originalQuantity;
          let finalUnit = originalUnit;

          // Calculate the initial offset to check for weekends
          let msOffset = 0;
          switch (originalUnit) {
              case 'minutes': msOffset = originalQuantity * 60 * 1000; break;
              case 'hours': msOffset = originalQuantity * 60 * 60 * 1000; break;
              case 'days': msOffset = originalQuantity * 24 * 60 * 60 * 1000; break;
              case 'weeks': msOffset = originalQuantity * 7 * 24 * 60 * 60 * 1000; break;
          }

          // Logic to shift weekend reminders to the previous Friday
          if (originalUnit === 'days' || originalUnit === 'weeks') {
              const reminderDate = new Date(baseEventDate.getTime() - msOffset);
              const dayOfWeek = reminderDate.getDay(); // 0 = Sunday, 6 = Saturday

              if (dayOfWeek === 0) { // Sunday -> move back 2 days to Friday
                  const daysToFriday = 2;
                  const currentDays = originalUnit === 'weeks' ? originalQuantity * 7 : originalQuantity;
                  finalQuantity = currentDays + daysToFriday;
                  finalUnit = 'days';
              } else if (dayOfWeek === 6) { // Saturday -> move back 1 day to Friday
                  const daysToFriday = 1;
                  const currentDays = originalUnit === 'weeks' ? originalQuantity * 7 : originalQuantity;
                  finalQuantity = currentDays + daysToFriday;
                  finalUnit = 'days';
              }
          }

          return {
              id: crypto.randomUUID(),
              type: sopReminder["Type of Reminder"],
              quantity: finalQuantity,
              unit: finalUnit,
              calendarTitle: sopReminder["Calendar Event Reminder Title"],
              calendarDescription: sopReminder["Calendar Event Reminder Description"],
              remindStaff: sopReminder["Remind All Staff Members"] || false,
              remindAttorneys: sopReminder["Remind All Attorneys"] || false,
              manualUsers: []
          };
      });

      remindersAddedCount += newReminders.length;
      originalEvent.reminders = [...(originalEvent.reminders || []), ...newReminders];
    }

    const updatedInviteAttorneys = sopEventConfig["Invite All Attorneys"] !== undefined 
        ? sopEventConfig["Invite All Attorneys"] 
        : originalEvent.inviteAllAttorneys;

    const updatedInviteStaff = sopEventConfig["Invite All Staff Members"] !== undefined
        ? sopEventConfig["Invite All Staff Members"]
        : originalEvent.inviteAllStaff;

    // Use SOP Title and Description if available (and not empty or "N/A")
    const sopTitle = sopEventConfig["Title in Calendar Event"];
    const sopDescription = sopEventConfig["Description in Calendar Event"];

    const finalTitle = (sopTitle && sopTitle.trim() && sopTitle !== "N/A") 
      ? sopTitle 
      : originalEvent.title;

    let finalDescription = (sopDescription && sopDescription.trim() && sopDescription !== "N/A")
      ? sopDescription
      : originalEvent.description;

    // Handle Dynamic Description with {} placeholders
    if (finalDescription.includes("{")) {
      dynamicQueue.push({
        eventId: originalEvent.id,
        template: finalDescription
      });
      finalDescription = "Generating custom description...";
    }

    // Handle SOP-defined duration
    let finalIsAllDay = originalEvent.is_all_day;
    let finalStartTime = originalEvent.start_time;
    let finalEndTime = originalEvent.end_time;
    let finalEndDate = originalEvent.end_date;

    const sopDuration = sopEventConfig["Default Duration (Hours)"];
    if (typeof sopDuration === 'number' && sopDuration !== null) {
      if (sopDuration === 24) {
        finalIsAllDay = true;
        finalStartTime = "";
        finalEndTime = "";
      } else if (finalStartTime) {
        const offsetMinutes = Math.round(sopDuration * 60);
        const offset = offsetDateTime(originalEvent.start_date, finalStartTime, offsetMinutes);
        finalEndTime = offset.time;
        finalEndDate = offset.date;
        finalIsAllDay = false;
      }
    }

    return {
      ...originalEvent,
      sopMatchId: matchedRecordIdStr,
      title: finalTitle,
      description: finalDescription,
      inviteAllAttorneys: updatedInviteAttorneys || false,
      inviteAllStaff: updatedInviteStaff || false,
      is_all_day: finalIsAllDay,
      start_time: finalStartTime,
      end_time: finalEndTime,
      end_date: finalEndDate
    };
  });

  // 4. Process Dynamic Descriptions if any
  if (dynamicQueue.length > 0 && file) {
    try {
      const dynamicResults = await processDynamicDescriptions(file, dynamicQueue);
      dynamicResults.forEach(res => {
        const ev = updatedEvents.find(e => e.id === res.eventId);
        if (ev) {
          ev.description = res.description;
        }
      });
    } catch (err) {
      console.error("Failed to process dynamic descriptions:", err);
      // Fallback: remove placeholder if it failed
      dynamicQueue.forEach(q => {
        const ev = updatedEvents.find(e => e.id === q.eventId);
        if (ev && ev.description === "Generating custom description...") {
          ev.description = q.template; // Fallback to original template
        }
      });
    }
  }

  return { events: updatedEvents, matchedCount, remindersAddedCount };
};

/**
 * Secondary AI Pipeline to handle dynamic descriptions with {} placeholders
 */
async function processDynamicDescriptions(file: File, queue: { eventId: string, template: string }[]): Promise<{ eventId: string, description: string }[]> {
  const filePart = await fileToGenerativePart(file);

  try {
    const response = await fetch("/api/gemini/process-dynamic-descriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ filePart, queue })
    });

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      throw new Error(errData.error || `Server error: ${response.statusText}`);
    }

    return await response.json();
  } catch (e: any) {
    console.error("Dynamic Description Error:", e);
    throw e;
  }
}
