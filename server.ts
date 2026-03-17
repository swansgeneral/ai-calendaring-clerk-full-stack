import express from "express";
import path from "path";
import cors from "cors";
import cookieParser from "cookie-parser";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import admin from "firebase-admin";
import { DateTime } from "luxon";
import { GoogleGenAI, Type } from "@google/genai";
import { jsonrepair } from "jsonrepair";
import { systemPrompt, responseSchema, getEventMatchingPrompt, eventMatchingResponseSchema } from "./prompts/systemPrompt";
import { ENV_VARS } from "./env";

const PORT = Number(process.env.PORT) || 3000;
console.log(`Initializing server on port ${PORT}...`);
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

// Initialize Firebase Admin
let db: admin.firestore.Firestore | null = null;
try {
  if (process.env.FIREBASE_PRIVATE_KEY) {
    let credential;
    try {
      // Check if the user pasted the entire JSON file into the private key field
      const serviceAccountJson = JSON.parse(process.env.FIREBASE_PRIVATE_KEY);
      credential = admin.credential.cert(serviceAccountJson);
    } catch (err) {
      // Otherwise, assume they provided the individual fields
      if (process.env.FIREBASE_PROJECT_ID && process.env.FIREBASE_CLIENT_EMAIL) {
        credential = admin.credential.cert({
          projectId: process.env.FIREBASE_PROJECT_ID,
          clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
          privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n'),
        });
      } else {
        throw new Error("Missing FIREBASE_PROJECT_ID or FIREBASE_CLIENT_EMAIL for individual field setup.");
      }
    }
    
    admin.initializeApp({ credential });
    db = admin.firestore();
    console.log("✅ Firebase Admin initialized successfully.");
  } else {
    console.warn("⚠️ Firebase credentials missing. Database will not be initialized.");
  }
} catch (error) {
  console.error("❌ Failed to initialize Firebase Admin:", error);
}

const FIRESTORE_COLLECTION = "sop_data";
const FIRESTORE_DOC_ID = "main_document";

async function startServer() {
  const app = express();
  const server = createServer(app);
  
  // Initialize WebSocket Server
  const wss = new WebSocketServer({ server });
  
  const broadcast = (data: any) => {
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(JSON.stringify(data));
      }
    });
  };

  app.use(express.json());
  app.use(cookieParser());
  
  // Strict CORS Configuration
  const allowedOrigin = process.env.APP_URL || "*";
  app.use(cors({
    origin: (origin, callback) => {
      // Allow if:
      // 1. No origin (same-origin, mobile, curl)
      // 2. Matches APP_URL exactly
      // 3. APP_URL is "*"
      // 4. It's a .run.app subdomain (common in AI Studio preview)
      const isRunApp = origin && (origin.endsWith(".run.app") || origin.includes(".googleusercontent.com"));
      
      if (!origin || origin === allowedOrigin || allowedOrigin === "*" || isRunApp) {
        callback(null, true);
      } else {
        console.warn(`CORS blocked request from origin: ${origin}`);
        callback(new Error('Not allowed by CORS'));
      }
    },
    credentials: true
  }));

  // API Routes
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  });

  // Gemini Analysis Proxy
  app.post("/api/gemini/analyze", async (req, res) => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API Key is missing on server." });
    }

    try {
      const { filePart } = req.body;
      if (!filePart) {
        return res.status(400).json({ error: "Missing file data for analysis." });
      }

      const ai = new GoogleGenAI({ apiKey });
      const model = ENV_VARS.GEMINI_MODEL;

      const config: any = {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: ENV_VARS.GEMINI_TEMPERATURE,
        maxOutputTokens: 32768,
      };

      if ((ENV_VARS as any).GEMINI_THINKING_LEVEL) {
        config.thinkingConfig = { thinkingLevel: (ENV_VARS as any).GEMINI_THINKING_LEVEL };
      }

      const result = await ai.models.generateContent({
        model,
        contents: { parts: [filePart] },
        config,
      });

      let text = result.text || "";
      text = text.trim();
      if (text.startsWith("```json")) {
        text = text.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (text.startsWith("```")) {
        text = text.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }

      const repairedText = jsonrepair(text);
      const resultData = JSON.parse(repairedText);
      
      res.json(resultData);
    } catch (error: any) {
      console.error("Gemini Analysis Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/gemini/apply-reminders", async (req, res) => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API Key is missing on server." });
    }

    try {
      const { extractedForAI, sopListForAI } = req.body;
      
      const ai = new GoogleGenAI({ apiKey });
      const model = ENV_VARS.GEMINI_MODEL;

      const prompt = getEventMatchingPrompt(sopListForAI);
      const userContent = `Here are the extracted events to classify: ${JSON.stringify(extractedForAI)}`;

      const config: any = {
        systemInstruction: prompt,
        responseMimeType: "application/json",
        responseSchema: eventMatchingResponseSchema,
        temperature: ENV_VARS.GEMINI_TEMPERATURE, 
        maxOutputTokens: 4096,
      };

      if ((ENV_VARS as any).GEMINI_THINKING_LEVEL) {
        config.thinkingConfig = { thinkingLevel: (ENV_VARS as any).GEMINI_THINKING_LEVEL };
      }

      const response = await ai.models.generateContent({
        model,
        contents: userContent,
        config,
      });

      let text = response.text || "";
      text = text.trim();
      if (text.startsWith("```json")) {
        text = text.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (text.startsWith("```")) {
        text = text.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }

      const repairedText = jsonrepair(text);
      const resultData = JSON.parse(repairedText);
      
      res.json(resultData);
    } catch (error: any) {
      console.error("Gemini Reminders Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/gemini/process-dynamic-descriptions", async (req, res) => {
    const apiKey = process.env.API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: "Gemini API Key is missing on server." });
    }

    try {
      const { filePart, queue } = req.body;
      
      const ai = new GoogleGenAI({ apiKey });
      const model = ENV_VARS.GEMINI_MODEL;

      const systemInstruction = "You are a Legal Assistant. Read the document. For each Event ID and Template provided, fill in the placeholders indicated by {prompt} with specific details found in the document. Return the full description with the placeholders replaced by the extracted information. If information for a placeholder is not found, replace it with 'Information not found'. Keep the text outside the curly braces exactly as it is in the template.";
      
      const responseSchema = {
        type: Type.OBJECT,
        properties: {
          results: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                eventId: { type: Type.STRING },
                description: { type: Type.STRING }
              },
              required: ["eventId", "description"]
            }
          }
        },
        required: ["results"]
      };

      const userPrompt = `Templates for events:\n${JSON.stringify(queue)}`;

      const config: any = {
        systemInstruction,
        responseMimeType: "application/json",
        responseSchema,
        temperature: 0.1, 
        maxOutputTokens: 4096,
      };

      if ((ENV_VARS as any).GEMINI_THINKING_LEVEL) {
        config.thinkingConfig = { thinkingLevel: (ENV_VARS as any).GEMINI_THINKING_LEVEL };
      }

      const response = await ai.models.generateContent({
        model,
        contents: { parts: [filePart, { text: userPrompt }] },
        config,
      });

      let text = response.text || "";
      text = text.trim();
      if (text.startsWith("```json")) {
        text = text.replace(/^```json\s*/, "").replace(/\s*```$/, "");
      } else if (text.startsWith("```")) {
        text = text.replace(/^```\s*/, "").replace(/\s*```$/, "");
      }

      const repairedText = jsonrepair(text);
      const resultData = JSON.parse(repairedText);
      
      res.json(resultData.results);
    } catch (error: any) {
      console.error("Gemini Dynamic Descriptions Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/sop-data", async (req, res) => {
    try {
      if (db) {
        // Fetch from Firestore
        const docRef = db.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC_ID);
        const doc = await docRef.get();
        if (doc.exists) {
          res.json([doc.data()]); // Wrap in array to match expected structure
        } else {
          // If document doesn't exist in Firestore, return empty structure
          console.log("Firestore document not found, returning empty default.");
          res.json([{
            "Reminders": [],
            "Calendar Events": []
          }]);
        }
      } else {
        res.status(500).json({ error: "Database not initialized" });
      }
    } catch (error) {
      console.error("Error reading SOP data:", error);
      res.status(500).json({ error: "Failed to read SOP data" });
    }
  });

  app.post("/api/sop-data", async (req, res) => {
    try {
      if (!db) {
        return res.status(500).json({ error: "Database not initialized" });
      }
      
      const newData = req.body;
      const dataToSave = Array.isArray(newData) ? newData[0] : newData;

      // Save to Firestore
      const docRef = db.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_DOC_ID);
      await docRef.set(dataToSave);
      
      // Broadcast update to all connected clients
      broadcast({ type: 'SOP_UPDATE', data: newData });
      
      res.json({ success: true });
    } catch (error) {
      console.error("Error writing SOP data:", error);
      res.status(500).json({ error: "Failed to save SOP data" });
    }
  });

  // Clio OAuth & API Proxy
  const COOKIE_OPTIONS = {
    httpOnly: true,
    secure: true,
    sameSite: 'none' as const,
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days for refresh token
  };

  const ACCESS_TOKEN_COOKIE_OPTIONS = {
    ...COOKIE_OPTIONS,
    maxAge: 8 * 60 * 60 * 1000, // 8 hours for access token
  };

  app.get("/api/auth/clio/url", (req, res) => {
    const clientId = process.env.CLIO_CLIENT_ID;
    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
    const redirectUri = `${appUrl}/api/auth/clio/callback`;

    if (!clientId) {
      return res.status(500).json({ error: "CLIO_CLIENT_ID not configured" });
    }

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: "code",
    });

    const authUrl = `https://app.clio.com/oauth/authorize?${params.toString()}`;
    res.json({ url: authUrl });
  });

  app.get("/api/auth/clio/callback", async (req, res) => {
    const { code } = req.query;
    const clientId = process.env.CLIO_CLIENT_ID;
    const clientSecret = process.env.CLIO_CLIENT_SECRET;
    const appUrl = process.env.APP_URL || `http://localhost:${PORT}`;
    const redirectUri = `${appUrl}/api/auth/clio/callback`;

    if (!code || !clientId || !clientSecret) {
      return res.status(400).send("Missing required parameters for OAuth callback");
    }

    try {
      const response = await fetch("https://app.clio.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: clientId,
          client_secret: clientSecret,
          grant_type: "authorization_code",
          code: code as string,
          redirect_uri: redirectUri,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        console.error("Clio token exchange failed:", errText);
        return res.status(response.status).send(`Failed to exchange code for tokens: ${errText}`);
      }

      const tokens = await response.json();
      
      res.cookie("clio_access_token", tokens.access_token, ACCESS_TOKEN_COOKIE_OPTIONS);
      if (tokens.refresh_token) {
        res.cookie("clio_refresh_token", tokens.refresh_token, COOKIE_OPTIONS);
      }

      res.send(`
        <html>
          <head>
            <title>Authentication Successful</title>
            <style>
              body { font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; color: #0f172a; }
              .card { background: white; padding: 2rem; border-radius: 0.75rem; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); text-align: center; max-width: 400px; border: 1px solid #e2e8f0; }
              h2 { color: #00076F; margin-top: 0; }
              p { color: #64748b; line-height: 1.5; }
              button { background: #00076F; color: white; border: none; padding: 0.75rem 1.5rem; border-radius: 0.5rem; font-weight: bold; cursor: pointer; margin-top: 1rem; transition: opacity 0.2s; }
              button:hover { opacity: 0.9; }
            </style>
          </head>
          <body>
            <div class="card">
              <h2>Connection Successful!</h2>
              <p>Your Clio account has been connected. You can now close this window and return to the application.</p>
              <button onclick="window.close()">Close This Window</button>
            </div>
            <script>
              function notifyAndClose() {
                const message = { type: 'CLIO_AUTH_SUCCESS' };
                
                // 1. Try postMessage to opener (primary)
                if (window.opener) {
                  try {
                    window.opener.postMessage(message, '*');
                  } catch (e) {
                    console.error("Failed to postMessage to opener:", e);
                  }
                }
                
                // 2. Fallback: use localStorage for same-origin communication
                // This works even if window.opener is lost or blocked
                try {
                  localStorage.setItem('clio_auth_status', 'success_' + Date.now());
                } catch (e) {
                  console.error("Failed to set localStorage:", e);
                }
                
                // Auto-close after a short delay to ensure message is sent
                setTimeout(() => {
                  try {
                    window.close();
                  } catch (e) {}
                }, 2000);
              }
              
              notifyAndClose();
            </script>
          </body>
        </html>
      `);
    } catch (error) {
      console.error("Error in Clio callback:", error);
      res.status(500).send("Internal server error during authentication");
    }
  });

  async function refreshClioToken(refreshToken: string) {
    try {
      const response = await fetch("https://app.clio.com/oauth/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          client_id: process.env.CLIO_CLIENT_ID!,
          client_secret: process.env.CLIO_CLIENT_SECRET!,
          grant_type: "refresh_token",
          refresh_token: refreshToken,
        }),
      });

      if (!response.ok) return null;
      return await response.json();
    } catch (e) {
      return null;
    }
  }

  // Helper to make Clio API calls with automatic retry on 401
  async function callClioApi(req: express.Request, res: express.Response, endpoint: string, options: any = {}): Promise<Response | null> {
    let accessToken = req.cookies.clio_access_token;
    const refreshToken = req.cookies.clio_refresh_token;

    if (!accessToken && refreshToken) {
      console.log("Access token missing but refresh token present. Attempting refresh...");
      const newTokens = await refreshClioToken(refreshToken);
      if (newTokens) {
        accessToken = newTokens.access_token;
        res.cookie("clio_access_token", accessToken, ACCESS_TOKEN_COOKIE_OPTIONS);
        if (newTokens.refresh_token) {
          res.cookie("clio_refresh_token", newTokens.refresh_token, COOKIE_OPTIONS);
        }
      }
    }

    if (!accessToken) {
      res.status(401).json({ error: "Not authenticated" });
      return null;
    }

    let response = await fetch(endpoint, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.status === 401 && refreshToken) {
      console.log("Clio API returned 401. Attempting refresh...");
      const newTokens = await refreshClioToken(refreshToken);
      if (newTokens) {
        accessToken = newTokens.access_token;
        res.cookie("clio_access_token", accessToken, ACCESS_TOKEN_COOKIE_OPTIONS);
        if (newTokens.refresh_token) {
          res.cookie("clio_refresh_token", newTokens.refresh_token, COOKIE_OPTIONS);
        }
        
        response = await fetch(endpoint, {
          ...options,
          headers: {
            ...options.headers,
            Authorization: `Bearer ${accessToken}`,
          },
        });
      }
    }

    return response;
  }

  app.get("/api/clio/users", async (req, res) => {
    try {
      const response = await callClioApi(req, res, "https://app.clio.com/api/v4/users?fields=id,name,subscription_type,default_calendar_id");
      if (!response) return;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return res.status(response.status).json({ error: errorData.error || `Clio API error: ${response.statusText}` });
      }

      const data = await response.json();
      res.json(data.data);
    } catch (error: any) {
      console.error("Clio API Exception (Users):", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/clio/calendars", async (req, res) => {
    try {
      const response = await callClioApi(req, res, "https://app.clio.com/api/v4/calendars?fields=id,name");
      if (!response) return;

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        return res.status(response.status).json({ error: errorData.error || `Clio API error: ${response.statusText}` });
      }

      const data = await response.json();
      res.json(data.data);
    } catch (error: any) {
      console.error("Clio API Exception (Calendars):", error);
      res.status(500).json({ error: error.message });
    }
  });

  app.get("/api/clio/status", async (req, res) => {
    const hasAccessToken = !!req.cookies.clio_access_token;
    const hasRefreshToken = !!req.cookies.clio_refresh_token;
    const configured = !!process.env.CLIO_CLIENT_ID && !!process.env.CLIO_CLIENT_SECRET;
    
    res.json({ 
      authenticated: hasAccessToken || hasRefreshToken,
      configured: configured
    });
  });

  app.post("/api/clio/logout", (req, res) => {
    res.clearCookie("clio_access_token", COOKIE_OPTIONS);
    res.clearCookie("clio_refresh_token", COOKIE_OPTIONS);
    res.json({ success: true });
  });

  app.post("/api/clio/post-events", async (req, res) => {
    const webhookUrl = process.env.WEBHOOK_POST_EVENTS_URL;
    const webhookApiKey = process.env.WEBHOOK_API_KEY;

    if (!webhookUrl) {
      return res.status(500).json({ error: "WEBHOOK_POST_EVENTS_URL not configured on server" });
    }

    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-make-apikey': webhookApiKey || '',
          'X-API-Key': webhookApiKey || ''
        },
        body: JSON.stringify(req.body)
      });

      if (!response.ok) {
        const errorText = await response.text();
        return res.status(response.status).send(errorText || response.statusText);
      }

      const data = await response.json().catch(() => ({ success: true }));
      res.json(data);
    } catch (error: any) {
      console.error("Webhook Proxy Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  app.post("/api/clio/export-direct", async (req, res) => {
    const { matterDisplayNumber, events, involvedAttorneys, involvedStaff, timezone } = req.body;
    
    if (!matterDisplayNumber) {
      return res.status(400).json({ error: "Matter Display Number is required" });
    }

    try {
      // 1. Resolve Matter
      const matterResponse = await callClioApi(req, res, `https://app.clio.com/api/v4/matters.json?query=${encodeURIComponent(matterDisplayNumber)}&fields=id,display_number,client{id,last_name}`);
      if (!matterResponse) return; 
      
      if (!matterResponse.ok) {
        return res.status(matterResponse.status).json({ error: "Failed to fetch matter from Clio" });
      }
      
      const mattersData = await matterResponse.json();
      const matter = mattersData.data.find((m: any) => m.display_number === matterDisplayNumber);
      
      if (!matter) {
        return res.status(404).json({ error: `Matter "${matterDisplayNumber}" not found in Clio.` });
      }

      const clientLastName = matter.client?.last_name || "Client";
      const clientId = matter.client?.id;

      // 2. Fetch All Clio Users for resolution (including notification methods)
      const usersResponse = await callClioApi(req, res, "https://app.clio.com/api/v4/users.json?fields=id,name,subscription_type,default_calendar_id,notification_methods");
      if (!usersResponse) return;
      
      const usersData = await usersResponse.json();
      const allUsers = usersData.data;

      let entriesCreated = 0;
      let remindersSent = 0;
      const errors: string[] = [];
      
      const ensureSeconds = (t: string) => {
        if (!t) return "00:00:00";
        return t.split(':').length === 2 ? `${t}:00` : t;
      };

      const adjustForWeekend = (date: DateTime) => {
        let d = date;
        const day = d.weekday; // 1 = Monday, 7 = Sunday in Luxon
        if (day === 7) d = d.minus({ days: 2 }); // Sunday -> Friday
        else if (day === 6) d = d.minus({ days: 1 }); // Saturday -> Friday
        return d;
      };

      const calculateReminderDate = (baseDateStr: string, quantity: number, unit: string, isAllDay: boolean, timeStr?: string, tz?: string) => {
        let date: DateTime;
        const zone = tz || "UTC";
        
        if (isAllDay) {
          date = DateTime.fromISO(`${baseDateStr}T00:00:00`, { zone });
        } else {
          date = DateTime.fromISO(`${baseDateStr}T${ensureSeconds(timeStr || '00:00:00')}`, { zone });
        }

        if (unit === 'minutes') date = date.minus({ minutes: quantity });
        else if (unit === 'hours') date = date.minus({ hours: quantity });
        else if (unit === 'days') date = date.minus({ days: quantity });
        else if (unit === 'weeks') date = date.minus({ weeks: quantity });

        return adjustForWeekend(date);
      };

      // 3. Iterate through events
      for (const event of events) {
        try {
          // Resolve Attendees
          const attendeeIds = new Set<number>();
          
          if (event.inviteAllAttorneys && involvedAttorneys) {
            involvedAttorneys.forEach((u: any) => attendeeIds.add(u.calendar_id));
          }
          if (event.inviteAllStaff && involvedStaff) {
            involvedStaff.forEach((u: any) => attendeeIds.add(u.calendar_id));
          }
          if (event["Firm Invitees"]) {
            event["Firm Invitees"].forEach((i: any) => attendeeIds.add(i.calendar_id));
          }

          const attendees = Array.from(attendeeIds).map(id => ({ id: Number(id), type: "Calendar", _destroy: false }));

          // Create Primary Calendar Entry
          const eventTitle = `${clientLastName}: ${event.title}`;
          
          let startAt: string;
          let endAt: string;

          if (event.is_all_day) {
            startAt = DateTime.fromISO(event.start_date, { zone: timezone || "UTC" }).startOf('day').toISO() || "";
            endAt = DateTime.fromISO(event.end_date, { zone: timezone || "UTC" }).plus({ days: 1 }).startOf('day').toISO() || "";
          } else {
            const startTimeStr = ensureSeconds(event.start_time || '09:00:00');
            const endTimeStr = ensureSeconds(event.end_time || '10:00:00');
            startAt = DateTime.fromISO(`${event.start_date}T${startTimeStr}`, { zone: timezone || "UTC" }).toISO() || "";
            endAt = DateTime.fromISO(`${event.end_date}T${endTimeStr}`, { zone: timezone || "UTC" }).toISO() || "";
          }

          const calendarEntryPayload = {
            data: {
              summary: eventTitle,
              description: event.description || "",
              location: event.location || "",
              start_at: startAt,
              end_at: endAt,
              all_day: event.is_all_day,
              calendar_owner: { id: Number(event["Calendar Owner"]) },
              matter: { id: Number(matter.id) },
              attendees: attendees,
              send_email_notification: false
            }
          };

          console.log(`Creating event: ${eventTitle}`, JSON.stringify(calendarEntryPayload));

          const createEventResponse = await callClioApi(req, res, "https://app.clio.com/api/v4/calendar_entries.json", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(calendarEntryPayload)
          });

          if (!createEventResponse || !createEventResponse.ok) {
            const errText = createEventResponse ? await createEventResponse.text() : "Auth failed";
            console.error(`Failed to create event "${event.title}":`, errText);
            errors.push(`Failed to create event "${event.title}": ${errText}`);
            continue;
          }

          const createdEventData = await createEventResponse.json();
          const clioEventId = createdEventData.data.id;
          entriesCreated++;

          // Invite Client if requested
          if (event["Invite Client"] && clientId) {
            const patchPayload = {
              data: {
                attendees: [
                  {
                    id: clientId,
                    type: "Contact",
                    _destroy: false
                  }
                ]
              }
            };
            await callClioApi(req, res, `https://app.clio.com/api/v4/calendar_entries/${clioEventId}.json`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(patchPayload)
            });
          }

          // 4. Iterate through reminders
          if (event.reminders && event.reminders.length > 0) {
            for (const reminder of event.reminders) {
              try {
                // Resolve Recipients
                const recipientIds = new Set<number>();
                if (reminder.remindAllAttorneys && involvedAttorneys) {
                  involvedAttorneys.forEach((u: any) => recipientIds.add(u.calendar_id));
                }
                if (reminder.remindAllStaff && involvedStaff) {
                  involvedStaff.forEach((u: any) => recipientIds.add(u.calendar_id));
                }
                if (reminder.manualUsers) {
                  reminder.manualUsers.forEach((u: any) => recipientIds.add(u.calendar_id));
                }

                const recipients = Array.from(recipientIds);

                if (reminder.type === 'Calendar Event') {
                  const reminderTitle = `General Info - ${clientLastName}: ${reminder.calendarTitle || event.title}`;
                  const reminderDate = calculateReminderDate(event.start_date, reminder.quantity, reminder.unit, event.is_all_day, event.start_time, timezone);
                  const reminderDateStr = reminderDate.toISO() || "";
                  
                  const reminderEndDateStr = reminderDate.plus({ days: 1 }).startOf('day').toISO() || "";

                  const reminderCalendarPayload = {
                    data: {
                      summary: reminderTitle,
                      description: reminder.calendarDescription || "",
                      start_at: reminderDateStr,
                      end_at: reminderEndDateStr,
                      all_day: true,
                      calendar_owner: { id: Number(event["Calendar Owner"]) },
                      matter: { id: Number(matter.id) },
                      attendees: recipients.map(id => ({ id: Number(id), type: "Calendar", _destroy: false })),
                      send_email_notification: false
                    }
                  };

                  const createReminderCalResponse = await callClioApi(req, res, "https://app.clio.com/api/v4/calendar_entries.json", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(reminderCalendarPayload)
                  });

                  if (createReminderCalResponse && createReminderCalResponse.ok) {
                    entriesCreated++;
                  } else {
                    const errText = createReminderCalResponse ? await createReminderCalResponse.text() : "Auth failed";
                    console.error(`Failed to create calendar reminder for "${event.title}":`, errText);
                    errors.push(`Failed to create calendar reminder for "${event.title}": ${errText}`);
                  }
                } else if (reminder.type === 'Email') {
                  for (const recipientCalendarId of recipients) {
                    const user = allUsers.find((u: any) => u.default_calendar_id === recipientCalendarId);
                    if (!user) continue;

                    const emailMethod = user.notification_methods?.find((m: any) => m.type === 'Email');
                    if (!emailMethod) {
                      errors.push(`User ${user.name} does not have an Email notification method configured in Clio.`);
                      continue;
                    }

                    const reminderPayload = {
                      data: {
                        subject: { id: Number(clioEventId), type: "CalendarEntry" },
                        notification_method: { id: Number(emailMethod.id) },
                        duration_value: Number(reminder.quantity),
                        duration_unit: reminder.unit === 'weeks' ? 'days' : reminder.unit
                      }
                    };

                    if (reminder.unit === 'weeks') {
                      reminderPayload.data.duration_value = reminder.quantity * 7;
                      reminderPayload.data.duration_unit = 'days';
                    }

                    const createReminderResponse = await callClioApi(req, res, "https://app.clio.com/api/v4/reminders.json", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(reminderPayload)
                    });

                    if (createReminderResponse && createReminderResponse.ok) {
                      remindersSent++;
                    } else {
                      const errText = createReminderResponse ? await createReminderResponse.text() : "Auth failed";
                      errors.push(`Failed to send email reminder to ${user.name}: ${errText}`);
                    }

                    await sleep(1000);
                  }
                }
              } catch (remErr: any) {
                errors.push(`Error processing reminder for "${event.title}": ${remErr.message}`);
              }
            }
          }
        } catch (evtErr: any) {
          errors.push(`Error processing event "${event.title}": ${evtErr.message}`);
        }
      }

      res.json({
        success: true,
        summary: {
          entriesCreated,
          remindersSent
        },
        errors: errors.length > 0 ? errors : undefined
      });

    } catch (error: any) {
      console.error("Direct Export Error:", error);
      res.status(500).json({ error: error.message });
    }
  });

  // Vite middleware for development
  const isProduction = process.env.NODE_ENV === "production";
  
  if (!isProduction) {
    console.log("Mode: DEVELOPMENT (Vite middleware)");
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    console.log("Mode: PRODUCTION (Static files)");
    const distPath = path.resolve("dist");
    const indexPath = path.join(distPath, "index.html");
    
    // In production, we assume dist exists. If not, it will fail gracefully.
    app.use(express.static(distPath));
    
    app.get(/.*/, (req, res) => {
      res.sendFile(indexPath);
    });
  }

  // Global Express Error Handler
  app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
    console.error("Express App Error:", err);
    res.status(500).json({ error: "Internal Server Error", message: err.message });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 SUCCESS: Server is listening on port ${PORT}`);
    console.log(`Target: http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("CRITICAL: Failed to start server:", err);
  process.exit(1);
});
