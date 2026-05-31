
// New System
import { ThinkingLevel } from "@google/genai";

/**
 * This file serves as a central hub for application configuration.
 * Except for the Gemini API_KEY (which is sensitive and managed by the environment), 
 * all configuration variables are defined here.
 */

export const CASE_TYPES = ["Personal Injury"] as const;
export type CaseType = typeof CASE_TYPES[number];

/**
 * The 25 color families offered by the new Outlook category color picker, in the
 * same two-row grid order Outlook shows them. Microsoft does not publish official
 * hex values for this palette (their guidance is to eyedrop), so these hexes are
 * best-effort matches to how each color reads in new Outlook. They are cosmetic:
 * only the category NAME drives the export prefix / Outlook auto-coloring.
 */
export const OUTLOOK_CATEGORY_COLORS = [
  // Row 1 — hexes eyedropped/approximated from the new Outlook "Edit category" pastel swatches.
  { name: "Dark red", hex: "#E8A0A8" },
  { name: "Cranberry", hex: "#E89DB0" },
  { name: "Dark orange", hex: "#F2A98C" },
  { name: "Bronze", hex: "#DDB58C" },
  { name: "Peach", hex: "#F3D9A4" },
  { name: "Marigold", hex: "#EFD98A" },
  { name: "Gold", hex: "#E3D88C" },
  { name: "Dark brown", hex: "#B08F7E" },
  { name: "Lime", hex: "#C6DA8E" },
  { name: "Forest", hex: "#9FC78F" },
  { name: "Light green", hex: "#ABD2A2" },
  { name: "Dark green", hex: "#82B58B" },
  { name: "Light teal", hex: "#A9DCDB" },
  // Row 2
  { name: "Dark teal", hex: "#82C5C1" },
  { name: "Steel", hex: "#A0B8C5" },
  { name: "Sky blue", hex: "#ABD3ED" },
  { name: "Dark blue", hex: "#A0B5E1" },
  { name: "Lavender", hex: "#BCACDF" },
  { name: "Dark purple", hex: "#AC8FC6" },
  { name: "Pink", hex: "#ECABCA" },
  { name: "Plum", hex: "#C68FAA" },
  { name: "Beige", hex: "#D9D3C9" },
  { name: "Mink", hex: "#BAB0A8" },
  { name: "Silver", hex: "#CACDD1" },
  { name: "Charcoal", hex: "#A8A8A8" },
] as const;

/**
 * Default categories seeded into a firm's SOP document the first time it is
 * created. Firms edit these in the SOP dashboard afterwards. `name` must match
 * the firm's Outlook category name exactly: the export adds a `{name}` prefix to
 * the event description that an Outlook automation reads to auto-color the event.
 * `colorName` is the Outlook color family; `color` is its hex for the UI swatch.
 */
export const DEFAULT_CATEGORIES = [
  { id: "cat_deadline", name: "Deadline", colorName: "Cranberry", color: "#E89DB0" },
  { id: "cat_deft_deadline", name: "Deft Deadline", colorName: "Dark brown", color: "#B08F7E" },
  { id: "cat_deposition", name: "Deposition", colorName: "Lavender", color: "#BCACDF" },
  { id: "cat_in_court", name: "In Court", colorName: "Marigold", color: "#EFD98A" },
  { id: "cat_reminder", name: "Reminder", colorName: "Peach", color: "#F3D9A4" },
  { id: "cat_green", name: "Green category", colorName: "Light green", color: "#ABD2A2" },
  { id: "cat_orange", name: "Orange category", colorName: "Bronze", color: "#DDB58C" },
] as const;

export const ENV_VARS = {
  // Case Configuration
  CASE_TYPES: CASE_TYPES,
  DEFAULT_CASE_TYPE: "Personal Injury" as CaseType,

  // Gemini API Configuration
  GEMINI_MODEL: 'gemini-3.5-flash',
  GEMINI_THINKING_LEVEL: ThinkingLevel.MEDIUM,
  GEMINI_TEMPERATURE: 0.1,
  GEMINI_MAX_OUTPUT_TOKENS: 65536,
  GEMINI_MAX_CONTINUATION_PASSES: 10,
  
  // Prompt Configuration
  NAMING_CONVENTION: "Use professional legal terminology and common sense to create concise, accurate titles for the events.",
  CASE_CLASSIFICATION_PROMPT: `Analyze the legal document to classify it as one of the following: ${CASE_TYPES.join(', ')}. Return the final classification exactly as one of those strings.`,
  
  // Logic Defaults
  DEFAULT_EVENT_DURATION_MINUTES: 120,
  DEFAULT_EVENT_START_TIME: "09:00",
  TIMEZONE: "America/New_York", // Must be a valid IANA tz database code (e.g. "America/Los_Angeles", "Europe/London"). Full list: https://en.wikipedia.org/wiki/List_of_tz_database_time_zones
  
  // UI Simulation & Timeouts
  GET_CALENDARS_TIMEOUT: 60000,
  POST_EVENTS_REQUEST_TIMEOUT: 120000,
  POST_EVENTS_UI_RESET_DELAY: 5000,
};

export default ENV_VARS;
