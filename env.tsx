
// New System
import { ThinkingLevel } from "@google/genai";

/**
 * This file serves as a central hub for application configuration.
 * Except for the Gemini API_KEY (which is sensitive and managed by the environment), 
 * all configuration variables are defined here.
 */

export const CASE_TYPES = ["Other", "Personal Injury"] as const;
export type CaseType = typeof CASE_TYPES[number];

export const ENV_VARS = {
  // Case Configuration
  CASE_TYPES: CASE_TYPES,
  DEFAULT_CASE_TYPE: "Personal Injury" as CaseType,

  // Gemini API Configuration
  GEMINI_MODEL: 'gemini-3-flash-preview',
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
