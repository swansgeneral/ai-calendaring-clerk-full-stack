import express from "express";
import path from "path";
import cors from "cors";
import cookieParser from "cookie-parser";
import { WebSocketServer, WebSocket } from "ws";
import { createServer } from "http";
import { CosmosClient, Container } from "@azure/cosmos";
import admin from "firebase-admin";
import { DateTime } from "luxon";
import { GoogleGenAI, Type } from "@google/genai";
import { jsonrepair } from "jsonrepair";
import { systemPrompt, responseSchema, getEventMatchingPrompt, eventMatchingResponseSchema } from "./prompts/systemPrompt";
import { ENV_VARS } from "./env";

const PORT = Number(process.env.PORT) || 3000;
console.log(`Initializing server on port ${PORT}...`);
console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

// ============================================================================
// Storage abstraction — dual-cloud (Cosmos DB on Azure, Firestore on GCP).
// Selected at startup based on which credentials are present in env.
//   - COSMOS_ENDPOINT + COSMOS_KEY  →  Azure Cosmos DB
//   - FIREBASE_PRIVATE_KEY          →  Firebase Firestore
//   - both set                      →  Cosmos wins, warning logged
//   - neither set                   →  SOP and export endpoints return 503
// ============================================================================

const COSMOS_DATABASE = process.env.COSMOS_DATABASE || "calendaring_clerk";
const COSMOS_CONTAINER_NAME = process.env.COSMOS_CONTAINER || "sop_data";
const COSMOS_SOP_DOC_ID = process.env.COSMOS_SOP_DOC_ID || "main_document";
const FIRESTORE_COLLECTION = "sop_data";
const FIRESTORE_SOP_DOC_ID = "main_document";

type SopDocument = { Reminders: any[]; "Calendar Events": any[]; [key: string]: any };

type JobStatus = 'running' | 'complete' | 'error';

interface BaseJob {
  id: string;
  status: JobStatus;
  progress: { current: number; total: number };
  errors: string[];
  errorMessage?: string;
  createdAt: number;
  updatedAt: number;
}

interface ExportJob extends BaseJob {
  summary: { entriesCreated: number; remindersSent: number };
}

interface AnalyzeJob extends BaseJob {
  result?: { case_type: string | null; events: any[] };
}

interface ApplyRemindersJob extends BaseJob {
  result?: { matches: any[] };
}

interface SopStorage {
  get(): Promise<SopDocument | null>;
  put(data: SopDocument): Promise<void>;
}

interface JobStore {
  get<T extends BaseJob = BaseJob>(jobId: string): Promise<T | null>;
  put<T extends BaseJob>(job: T): Promise<void>;
  cleanupExpired(maxAgeMs: number): Promise<void>;
}

class CosmosSopStorage implements SopStorage {
  constructor(private container: Container) {}
  async get(): Promise<SopDocument | null> {
    try {
      const { resource } = await this.container.item(COSMOS_SOP_DOC_ID, COSMOS_SOP_DOC_ID).read();
      if (!resource) return null;
      const { id, _rid, _self, _etag, _attachments, _ts, ...data } = resource;
      return data as SopDocument;
    } catch (err: any) {
      if (err.code === 404) return null;
      throw err;
    }
  }
  async put(data: SopDocument): Promise<void> {
    await this.container.items.upsert({ id: COSMOS_SOP_DOC_ID, ...data });
  }
}

class CosmosJobStore implements JobStore {
  constructor(private container: Container) {}
  async get<T extends BaseJob = BaseJob>(jobId: string): Promise<T | null> {
    try {
      const { resource } = await this.container.item(jobId, jobId).read();
      if (!resource) return null;
      const { _rid, _self, _etag, _attachments, _ts, ...job } = resource;
      return job as T;
    } catch (err: any) {
      if (err.code === 404) return null;
      throw err;
    }
  }
  async put<T extends BaseJob>(job: T): Promise<void> {
    await this.container.items.upsert({ ...job });
  }
  async cleanupExpired(maxAgeMs: number): Promise<void> {
    const cutoff = Date.now() - maxAgeMs;
    try {
      const { resources } = await this.container.items
        .query({
          query: "SELECT c.id FROM c WHERE STARTSWITH(c.id, 'job_') AND c.updatedAt < @cutoff",
          parameters: [{ name: "@cutoff", value: cutoff }],
        })
        .fetchAll();
      for (const { id } of resources) {
        await this.container.item(id, id).delete().catch(() => { /* ignore deletion races */ });
      }
    } catch (err) {
      console.warn("CosmosJobStore.cleanupExpired error:", err);
    }
  }
}

class FirestoreSopStorage implements SopStorage {
  constructor(private db: admin.firestore.Firestore) {}
  async get(): Promise<SopDocument | null> {
    const doc = await this.db.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_SOP_DOC_ID).get();
    if (!doc.exists) return null;
    return doc.data() as SopDocument;
  }
  async put(data: SopDocument): Promise<void> {
    await this.db.collection(FIRESTORE_COLLECTION).doc(FIRESTORE_SOP_DOC_ID).set(data);
  }
}

class FirestoreJobStore implements JobStore {
  constructor(private db: admin.firestore.Firestore) {}
  async get<T extends BaseJob = BaseJob>(jobId: string): Promise<T | null> {
    const doc = await this.db.collection(FIRESTORE_COLLECTION).doc(jobId).get();
    if (!doc.exists) return null;
    return doc.data() as T;
  }
  async put<T extends BaseJob>(job: T): Promise<void> {
    await this.db.collection(FIRESTORE_COLLECTION).doc(job.id).set(job);
  }
  async cleanupExpired(maxAgeMs: number): Promise<void> {
    const cutoff = Date.now() - maxAgeMs;
    try {
      const snap = await this.db.collection(FIRESTORE_COLLECTION)
        .where("updatedAt", "<", cutoff)
        .get();
      const batch = this.db.batch();
      let deletions = 0;
      snap.docs.forEach(d => {
        if (d.id.startsWith("job_")) {
          batch.delete(d.ref);
          deletions++;
        }
      });
      if (deletions > 0) await batch.commit();
    } catch (err) {
      console.warn("FirestoreJobStore.cleanupExpired error:", err);
    }
  }
}

function selectStorage(): { sop: SopStorage; jobs: JobStore } | null {
  const hasCosmos = !!(process.env.COSMOS_ENDPOINT && process.env.COSMOS_KEY);
  const hasFirestore = !!process.env.FIREBASE_PRIVATE_KEY;

  if (hasCosmos && hasFirestore) {
    console.warn("⚠️ Both COSMOS_* and FIREBASE_PRIVATE_KEY credentials present. Using Cosmos DB.");
  }

  if (hasCosmos) {
    try {
      const client = new CosmosClient({
        endpoint: process.env.COSMOS_ENDPOINT!,
        key: process.env.COSMOS_KEY!,
      });
      const container = client.database(COSMOS_DATABASE).container(COSMOS_CONTAINER_NAME);
      console.log("✅ Storage backend: Azure Cosmos DB");
      return { sop: new CosmosSopStorage(container), jobs: new CosmosJobStore(container) };
    } catch (err) {
      console.error("❌ Failed to initialize Cosmos DB:", err);
      return null;
    }
  }

  if (hasFirestore) {
    try {
      const serviceAccount = JSON.parse(process.env.FIREBASE_PRIVATE_KEY!);
      admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
      const db = admin.firestore();
      // Firestore rejects undefined values by default; the ExportJob shape
      // has optional fields (errorMessage) that are undefined when a job
      // first starts. Ignoring undefined keeps the put() calls clean across
      // both backends — Cosmos already drops undefined via JSON serialization.
      db.settings({ ignoreUndefinedProperties: true });
      console.log("✅ Storage backend: Firebase Firestore");
      return { sop: new FirestoreSopStorage(db), jobs: new FirestoreJobStore(db) };
    } catch (err) {
      console.error("❌ Failed to initialize Firestore:", err);
      return null;
    }
  }

  console.warn("⚠️ No storage backend configured. SOP and export endpoints will return 503.");
  return null;
}

const storage = selectStorage();

async function startServer() {
  const app = express();
  // Trust the platform ingress so req.protocol / req.secure reflect the original
  // HTTPS request. Both Cloud Run and Container Apps terminate HTTPS at ingress
  // and forward HTTP to the container — without this, anything that inspects
  // req.secure would think the connection is plain HTTP.
  app.set('trust proxy', 1);
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

  app.use(express.json({ limit: "50mb" }));
  app.use(cookieParser());
  
  // Strict CORS Configuration
  const allowedOrigin = process.env.APP_URL || "*";
  app.use(cors({
    origin: (origin, callback) => {
      // Allow if:
      // 1. No origin (same-origin, mobile, curl)
      // 2. Matches APP_URL exactly
      // 3. APP_URL is "*" (dev fallback when APP_URL is not set)
      if (!origin || origin === allowedOrigin || allowedOrigin === "*") {
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

  // --- Helpers for multi-pass analysis ---

  function parseGeminiResponse(text: string): any {
    let cleaned = text.trim();
    if (cleaned.startsWith("```json")) {
      cleaned = cleaned.replace(/^```json\s*/, "").replace(/\s*```$/, "");
    } else if (cleaned.startsWith("```")) {
      cleaned = cleaned.replace(/^```\s*/, "").replace(/\s*```$/, "");
    }
    const repaired = jsonrepair(cleaned);
    return JSON.parse(repaired);
  }

  function buildContinuationPrompt(allEventsSoFar: any[]): string {
    const lastEvent = allEventsSoFar[allEventsSoFar.length - 1];
    const lastQuote = lastEvent?.verification?.quote || '';
    const lastPage = lastEvent?.verification?.page || '?';

    const skipList = allEventsSoFar.map(e => {
      const quote = (e.verification?.quote || '').substring(0, 50);
      return `- "${quote}" | ${e.start_date} | page ${e.verification?.page || '?'}`;
    }).join('\n');

    return `CONTINUATION INSTRUCTIONS (CRITICAL — READ CAREFULLY):

You are continuing a multi-pass extraction of the same document.

CURSOR — YOUR LAST EXTRACTION:
The last event you extracted was identified by this text on page ${lastPage}:
"${lastQuote}"

Continue reading the document FROM THAT POINT FORWARD on page ${lastPage}.
ONLY extract events that appear AFTER that quote in the document.

The following ${allEventsSoFar.length} events have ALREADY been extracted.
DO NOT include any of these again:
${skipList}

If there are no more events to extract, return an empty events array with is_complete: true.`;
  }

  function deduplicateEvents(events: any[]): any[] {
    // Layer 3: Deterministic server-side dedup
    // Primary key: normalized quote + date + time
    const primaryMap = new Map<string, any>();
    events.forEach(e => {
      const normalizedQuote = String(e.verification?.quote || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
      const normalizedDate = e.start_date ? String(e.start_date).trim() : '';
      const normalizedTime = e.start_time ? String(e.start_time).trim() : '';
      const key = `${normalizedQuote}|${normalizedDate}|${normalizedTime}`;

      if (!primaryMap.has(key)) {
        primaryMap.set(key, e);
      } else {
        const existing = primaryMap.get(key);
        const existingHasBB = existing.verification?.bounding_box && existing.verification.bounding_box.length === 4;
        const currentHasBB = e.verification?.bounding_box && e.verification.bounding_box.length === 4;
        const existingDescLen = (existing.description || '').length;
        const currentDescLen = (e.description || '').length;
        if ((!existingHasBB && currentHasBB) || (currentDescLen > existingDescLen + 5)) {
          primaryMap.set(key, e);
        }
      }
    });

    // Secondary key: normalized title + date (catches same event with slightly different quotes)
    const secondaryMap = new Map<string, any>();
    Array.from(primaryMap.values()).forEach(e => {
      const normalizedTitle = String(e.title || '').toLowerCase().replace(/[^a-z0-9]/g, '').trim();
      const normalizedDate = e.start_date ? String(e.start_date).trim() : '';
      const key = `${normalizedTitle}|${normalizedDate}`;

      if (!secondaryMap.has(key)) {
        secondaryMap.set(key, e);
      } else {
        const existing = secondaryMap.get(key);
        const existingQuoteLen = (existing.verification?.quote || '').length;
        const currentQuoteLen = (e.verification?.quote || '').length;
        if (currentQuoteLen > existingQuoteLen) {
          secondaryMap.set(key, e);
        }
      }
    });

    return Array.from(secondaryMap.values());
  }

  // ============================================================================
  // Gemini Analysis — polling-based (POST kicks off a background job, client
  // polls the status endpoint). The synchronous version held an HTTP connection
  // open for the full Gemini call (up to several minutes for multi-page PDFs),
  // which conflicted with platform ingress timeouts (Container Apps' 240s
  // Envoy default). The polling design returns in <100ms and runs Gemini in
  // a background async function. Job state persists in the storage backend.
  // ============================================================================

  async function runAnalyzeJob(jobId: string, apiKey: string, filePart: any): Promise<void> {
    if (!storage) return;
    const job = await storage.jobs.get<AnalyzeJob>(jobId);
    if (!job) return;

    const log = (msg: string, extra?: object) => {
      process.stdout.write(`[analyze jobId=${jobId}] ${msg}` + (extra ? ` ${JSON.stringify(extra)}` : '') + '\n');
    };
    const persist = async () => {
      try { await storage!.jobs.put(job); }
      catch (err: any) { process.stderr.write(`[analyze jobId=${jobId}] persist failed: ${err?.message || err}\n`); }
    };
    const updateProgress = async (current: number, total: number) => {
      job.progress = { current, total };
      job.updatedAt = Date.now();
      await persist();
    };
    const fail = async (message: string) => {
      log('FAIL', { message });
      job.status = 'error';
      job.errorMessage = message;
      job.updatedAt = Date.now();
      await persist();
    };

    try {
      const ai = new GoogleGenAI({ apiKey });
      const model = ENV_VARS.GEMINI_MODEL;

      const config: any = {
        systemInstruction: systemPrompt,
        responseMimeType: "application/json",
        responseSchema: responseSchema,
        temperature: ENV_VARS.GEMINI_TEMPERATURE,
        maxOutputTokens: ENV_VARS.GEMINI_MAX_OUTPUT_TOKENS,
      };

      if ((ENV_VARS as any).GEMINI_THINKING_LEVEL) {
        config.thinkingConfig = { thinkingLevel: (ENV_VARS as any).GEMINI_THINKING_LEVEL };
      }

      let allEvents: any[] = [];
      let caseType: string | null = null;
      let isComplete = false;
      let pass = 0;

      while (!isComplete && pass < ENV_VARS.GEMINI_MAX_CONTINUATION_PASSES) {
        pass++;
        await updateProgress(pass - 1, ENV_VARS.GEMINI_MAX_CONTINUATION_PASSES);

        const parts: any[] = [filePart];
        if (pass > 1) {
          parts.push({ text: buildContinuationPrompt(allEvents) });
        }

        const result = await ai.models.generateContent({
          model,
          contents: { parts },
          config,
        });

        const data = parseGeminiResponse(result.text || "");

        const newEvents = data.events || [];
        allEvents.push(...newEvents);
        caseType = caseType || data.case_type;

        const finishReason = result.candidates?.[0]?.finishReason;
        const wasTruncated = finishReason === "MAX_TOKENS";
        const modelSaysIncomplete = data.is_complete === false && newEvents.length > 0;
        const noNewEvents = pass > 1 && newEvents.length === 0;

        if (noNewEvents) {
          isComplete = true;
        } else if (wasTruncated || modelSaysIncomplete) {
          isComplete = false;
        } else {
          isComplete = true;
        }

        log(`Pass ${pass}: ${newEvents.length} events, finishReason=${finishReason}, is_complete=${data.is_complete}, continuing=${!isComplete}`);
      }

      const dedupedEvents = deduplicateEvents(allEvents);
      const dupsRemoved = allEvents.length - dedupedEvents.length;
      log(`Complete: ${pass} pass(es), ${allEvents.length} raw → ${dedupedEvents.length} deduped events` + (dupsRemoved > 0 ? ` (${dupsRemoved} duplicates removed)` : ''));

      job.result = { case_type: caseType, events: dedupedEvents };
      job.progress = { current: pass, total: pass };
      job.status = 'complete';
      job.updatedAt = Date.now();
      await persist();
    } catch (error: any) {
      log(`uncaught error: ${error?.message || error}`);
      await fail(error?.message || 'Unknown error during analysis');
    }
  }

  async function runApplyRemindersJob(jobId: string, apiKey: string, extractedForAI: any, sopListForAI: any): Promise<void> {
    if (!storage) return;
    const job = await storage.jobs.get<ApplyRemindersJob>(jobId);
    if (!job) return;

    const log = (msg: string, extra?: object) => {
      process.stdout.write(`[apply-reminders jobId=${jobId}] ${msg}` + (extra ? ` ${JSON.stringify(extra)}` : '') + '\n');
    };
    const persist = async () => {
      try { await storage!.jobs.put(job); }
      catch (err: any) { process.stderr.write(`[apply-reminders jobId=${jobId}] persist failed: ${err?.message || err}\n`); }
    };
    const fail = async (message: string) => {
      log('FAIL', { message });
      job.status = 'error';
      job.errorMessage = message;
      job.updatedAt = Date.now();
      await persist();
    };

    try {
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

      log(`complete: ${(resultData.matches || []).length} matches`);
      job.result = { matches: resultData.matches || [] };
      job.progress = { current: 1, total: 1 };
      job.status = 'complete';
      job.updatedAt = Date.now();
      await persist();
    } catch (error: any) {
      log(`uncaught error: ${error?.message || error}`);
      await fail(error?.message || 'Unknown error during reminders matching');
    }
  }

  // POST kicks off the analyze job, returns 202 + jobId immediately.
  app.post("/api/gemini/analyze", async (req, res) => {
    if (!storage) return res.status(503).json({ error: "No storage backend configured." });

    const apiKey = process.env.API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Gemini API Key is missing on server." });

    const { filePart } = req.body;
    if (!filePart) return res.status(400).json({ error: "Missing file data for analysis." });

    const jobId = generateJobId();
    const job: AnalyzeJob = {
      id: jobId,
      status: 'running',
      progress: { current: 0, total: ENV_VARS.GEMINI_MAX_CONTINUATION_PASSES },
      errors: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      await storage.jobs.put(job);
    } catch (err: any) {
      console.error(`[analyze jobId=${jobId}] failed to create job:`, err);
      return res.status(500).json({ error: "Failed to start analysis job." });
    }

    console.log(`[analyze jobId=${jobId}] starting`);

    runAnalyzeJob(jobId, apiKey, filePart).catch(async (err: any) => {
      process.stderr.write(`[analyze jobId=${jobId}] runAnalyzeJob threw outside try: ${err?.message || err}\n`);
      try {
        const j = await storage!.jobs.get<AnalyzeJob>(jobId);
        if (j) {
          j.status = 'error';
          j.errorMessage = err?.message || String(err);
          j.updatedAt = Date.now();
          await storage!.jobs.put(j);
        }
      } catch { /* best effort */ }
    });

    res.status(202).json({ jobId });
  });

  app.get("/api/gemini/analyze-status/:jobId", async (req, res) => {
    if (!storage) return res.status(503).json({ error: "No storage backend configured." });
    try {
      const job = await storage.jobs.get<AnalyzeJob>(req.params.jobId);
      if (!job) return res.status(404).json({ error: "Job not found or has expired" });
      res.json({
        status: job.status,
        progress: job.progress,
        result: job.result,
        errorMessage: job.errorMessage,
      });
    } catch (err: any) {
      console.error("Error reading analyze job:", err);
      res.status(500).json({ error: "Failed to read job status" });
    }
  });

  // POST kicks off the apply-reminders job, returns 202 + jobId immediately.
  app.post("/api/gemini/apply-reminders", async (req, res) => {
    if (!storage) return res.status(503).json({ error: "No storage backend configured." });

    const apiKey = process.env.API_KEY;
    if (!apiKey) return res.status(500).json({ error: "Gemini API Key is missing on server." });

    const { extractedForAI, sopListForAI } = req.body;

    const jobId = generateJobId();
    const job: ApplyRemindersJob = {
      id: jobId,
      status: 'running',
      progress: { current: 0, total: 1 },
      errors: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      await storage.jobs.put(job);
    } catch (err: any) {
      console.error(`[apply-reminders jobId=${jobId}] failed to create job:`, err);
      return res.status(500).json({ error: "Failed to start apply-reminders job." });
    }

    console.log(`[apply-reminders jobId=${jobId}] starting`);

    runApplyRemindersJob(jobId, apiKey, extractedForAI, sopListForAI).catch(async (err: any) => {
      process.stderr.write(`[apply-reminders jobId=${jobId}] runApplyRemindersJob threw outside try: ${err?.message || err}\n`);
      try {
        const j = await storage!.jobs.get<ApplyRemindersJob>(jobId);
        if (j) {
          j.status = 'error';
          j.errorMessage = err?.message || String(err);
          j.updatedAt = Date.now();
          await storage!.jobs.put(j);
        }
      } catch { /* best effort */ }
    });

    res.status(202).json({ jobId });
  });

  app.get("/api/gemini/apply-reminders-status/:jobId", async (req, res) => {
    if (!storage) return res.status(503).json({ error: "No storage backend configured." });
    try {
      const job = await storage.jobs.get<ApplyRemindersJob>(req.params.jobId);
      if (!job) return res.status(404).json({ error: "Job not found or has expired" });
      res.json({
        status: job.status,
        progress: job.progress,
        result: job.result,
        errorMessage: job.errorMessage,
      });
    } catch (err: any) {
      console.error("Error reading apply-reminders job:", err);
      res.status(500).json({ error: "Failed to read job status" });
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
    if (!storage) {
      return res.status(503).json({ error: "No storage backend configured. Set COSMOS_* or FIREBASE_PRIVATE_KEY env vars." });
    }
    try {
      const data = await storage.sop.get();
      if (data) {
        res.json([data]);
      } else {
        res.json([{ "Reminders": [], "Calendar Events": [] }]);
      }
    } catch (error) {
      console.error("Error reading SOP data:", error);
      res.status(500).json({ error: "Failed to read SOP data" });
    }
  });

  app.post("/api/sop-data", async (req, res) => {
    if (!storage) {
      return res.status(503).json({ error: "No storage backend configured." });
    }
    try {
      const newData = req.body;
      const dataToSave = Array.isArray(newData) ? newData[0] : newData;
      await storage.sop.put(dataToSave);
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
                    window.opener.postMessage(message, window.location.origin);
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

  const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

  // ============================================================================
  // Polling-based Clio export
  //
  // The original SSE design works on Cloud Run but breaks on Azure Container
  // Apps because the platform Authentication middleware buffers/closes
  // streaming responses. POST creates an in-memory job and returns its id;
  // the client polls GET /api/clio/export-status/:jobId for progress until
  // status is 'complete' or 'error'. Plain JSON, no streaming, portable.
  // ============================================================================

  // ExportJob type is defined at module scope alongside the storage abstraction.
  // Job state persists in the configured storage backend (Cosmos or Firestore)
  // so polling works correctly regardless of replica count / session affinity.
  const EXPORT_JOB_TTL_MS = 60 * 60 * 1000;

  if (storage) {
    setInterval(() => {
      storage.jobs.cleanupExpired(EXPORT_JOB_TTL_MS).catch(err => {
        console.warn("Job store cleanup failed:", err);
      });
    }, 5 * 60 * 1000).unref?.();
  }

  const generateJobId = () => "job_" + Math.random().toString(36).slice(2) + Date.now().toString(36);

  // Bare authenticated fetch to Clio — no req/res coupling. Use this inside
  // background jobs where we have an access token but no live response object.
  const clioFetch = (accessToken: string, endpoint: string, options: any = {}) =>
    fetch(endpoint, {
      ...options,
      headers: { ...options.headers, Authorization: `Bearer ${accessToken}` },
    });

  async function runExportJob(
    job: ExportJob,
    accessToken: string,
    params: {
      matterDisplayNumber: string;
      events: any[];
      involvedAttorneys: any[];
      involvedStaff: any[];
      timezone?: string;
    }
  ): Promise<void> {
    if (!storage) return;
    const jobId = job.id;

    const { matterDisplayNumber, events, involvedAttorneys, involvedStaff, timezone } = params;

    const log = (msg: string, extra?: object) => {
      const line = `[export jobId=${jobId}] ${msg}` + (extra ? ` ${JSON.stringify(extra)}` : '');
      process.stdout.write(line + '\n');
    };
    const persist = async () => {
      try { await storage!.jobs.put(job); }
      catch (err: any) { process.stderr.write(`[export jobId=${jobId}] persist failed: ${err?.message || err}\n`); }
    };
    const updateProgress = async (current: number) => {
      job.progress.current = current;
      job.updatedAt = Date.now();
      await persist();
    };
    const fail = async (message: string) => {
      log('FAIL', { message });
      job.status = 'error';
      job.errorMessage = message;
      job.updatedAt = Date.now();
      await persist();
    };

    let currentOp = 0;

    const ensureSeconds = (t: string) => {
      if (!t) return "00:00:00";
      return t.split(':').length === 2 ? `${t}:00` : t;
    };
    const adjustForWeekend = (date: DateTime) => {
      let d = date;
      const day = d.weekday;
      if (day === 7) d = d.minus({ days: 2 });
      else if (day === 6) d = d.minus({ days: 1 });
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

    try {
      // 1. Resolve Matter
      log('looking up matter', { matterDisplayNumber });
      const matterResponse = await clioFetch(accessToken, `https://app.clio.com/api/v4/matters.json?query=${encodeURIComponent(matterDisplayNumber)}&fields=id,display_number,client{id,last_name}`);

      if (matterResponse.status === 401) {
        return fail("Clio authentication expired. Please reconnect Clio and try again.");
      }
      if (!matterResponse.ok) {
        const errText = await matterResponse.text().catch(() => '');
        return fail(`Failed to fetch matter from Clio (status ${matterResponse.status}). ${errText.slice(0, 200)}`);
      }

      const mattersData = await matterResponse.json();
      const matter = mattersData.data?.find((m: any) => m.display_number === matterDisplayNumber);
      if (!matter) {
        return fail(`Matter "${matterDisplayNumber}" not found in Clio.`);
      }
      log('matter resolved', { id: matter.id });

      const clientLastName = matter.client?.last_name || "Client";
      const clientId = matter.client?.id;

      // 2. Fetch Users
      currentOp++;
      await updateProgress(currentOp);

      const usersResponse = await clioFetch(accessToken, "https://app.clio.com/api/v4/users.json?fields=id,name,subscription_type,default_calendar_id,notification_methods");
      if (usersResponse.status === 401) {
        return fail("Clio authentication expired during users lookup.");
      }
      if (!usersResponse.ok) {
        const errText = await usersResponse.text().catch(() => '');
        return fail(`Failed to fetch users (status ${usersResponse.status}). ${errText.slice(0, 200)}`);
      }
      const usersData = await usersResponse.json();
      const allUsers = usersData.data || [];

      // 3. Iterate events
      log('processing events', { count: events.length });
      for (const [eventIdx, event] of events.entries()) {
        currentOp++;
        await updateProgress(currentOp);
        log('processing event', { eventIdx, title: event.title });

        try {
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

          const calendarOwnerId = Number(event["Calendar Owner"]);
          const matterId = Number(matter.id);
          if (isNaN(calendarOwnerId) || isNaN(matterId)) {
            job.errors.push(`Failed to create event "${event.title}": Invalid calendar owner or matter ID`);
            continue;
          }

          const calendarEntryPayload = {
            data: {
              summary: eventTitle,
              description: event.description || "",
              location: event.location || "",
              start_at: startAt,
              end_at: endAt,
              all_day: event.is_all_day,
              calendar_owner: { id: calendarOwnerId },
              matter: { id: matterId },
              attendees: attendees,
              send_email_notification: false
            }
          };

          const createEventResponse = await clioFetch(accessToken, "https://app.clio.com/api/v4/calendar_entries.json", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(calendarEntryPayload)
          });

          if (createEventResponse.status === 401) {
            return fail("Clio authentication expired while creating an event.");
          }
          if (!createEventResponse.ok) {
            const errText = await createEventResponse.text().catch(() => '');
            job.errors.push(`Failed to create event "${event.title}": ${errText.slice(0, 200)}`);
            continue;
          }

          const createdEventData = await createEventResponse.json();
          const clioEventId = createdEventData.data.id;
          job.summary.entriesCreated++;
          job.updatedAt = Date.now();

          if (event["Invite Client"] && clientId) {
            const patchPayload = {
              data: {
                attendees: [{ id: clientId, type: "Contact", _destroy: false }]
              }
            };
            await clioFetch(accessToken, `https://app.clio.com/api/v4/calendar_entries/${clioEventId}.json`, {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(patchPayload)
            });
          }

          // Reminders
          if (event.reminders && event.reminders.length > 0) {
            for (const reminder of event.reminders) {
              currentOp++;
              await updateProgress(currentOp);

              try {
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
                  const reminderTitle = `${clientLastName}: ${reminder.calendarTitle || event.title}`;
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

                  const createReminderCalResponse = await clioFetch(accessToken, "https://app.clio.com/api/v4/calendar_entries.json", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(reminderCalendarPayload)
                  });

                  if (createReminderCalResponse.ok) {
                    job.summary.entriesCreated++;
                    job.updatedAt = Date.now();
                  } else {
                    const errText = await createReminderCalResponse.text().catch(() => '');
                    job.errors.push(`Failed to create calendar reminder for "${event.title}": ${errText.slice(0, 200)}`);
                  }
                } else if (reminder.type === 'Email') {
                  for (const recipientCalendarId of recipients) {
                    const user = allUsers.find((u: any) => u.default_calendar_id === recipientCalendarId);
                    if (!user) continue;

                    const emailMethod = user.notification_methods?.find((m: any) => m.type === 'Email');
                    if (!emailMethod) {
                      job.errors.push(`User ${user.name} does not have an Email notification method configured in Clio.`);
                      continue;
                    }

                    const reminderPayload: any = {
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

                    const createReminderResponse = await clioFetch(accessToken, "https://app.clio.com/api/v4/reminders.json", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify(reminderPayload)
                    });

                    if (createReminderResponse.ok) {
                      job.summary.remindersSent++;
                      job.updatedAt = Date.now();
                    } else {
                      const errText = await createReminderResponse.text().catch(() => '');
                      job.errors.push(`Failed to send email reminder to ${user.name}: ${errText.slice(0, 200)}`);
                    }

                    await sleep(1000);
                  }
                }
              } catch (remErr: any) {
                job.errors.push(`Error processing reminder for "${event.title}": ${remErr?.message || remErr}`);
              }
            }
          }
        } catch (evtErr: any) {
          job.errors.push(`Error processing event "${event.title}": ${evtErr?.message || evtErr}`);
        }
      }

      log('export complete', { entriesCreated: job.summary.entriesCreated, remindersSent: job.summary.remindersSent, errorCount: job.errors.length });
      job.status = 'complete';
      job.updatedAt = Date.now();
      await persist();
    } catch (error: any) {
      process.stderr.write(`[export jobId=${jobId}] UNCAUGHT: ${error?.message || error}\n${error?.stack || ''}\n`);
      return fail(error?.message || 'Unknown error during export');
    }
  }

  app.post("/api/clio/export-direct", async (req, res) => {
    const { matterDisplayNumber, events, involvedAttorneys, involvedStaff, timezone } = req.body;

    if (!storage) {
      return res.status(503).json({ error: "No storage backend configured." });
    }

    if (!matterDisplayNumber) {
      return res.status(400).json({ error: "Matter Display Number is required" });
    }

    const accessToken = req.cookies.clio_access_token;
    if (!accessToken) {
      return res.status(401).json({ error: "Not authenticated with Clio. Please reconnect Clio and try again." });
    }

    const totalOps = 2 + (events?.length || 0) + (events || []).reduce((sum: number, evt: any) => {
      return sum + (evt.reminders?.length || 0);
    }, 0);

    const jobId = generateJobId();
    const job: ExportJob = {
      id: jobId,
      status: 'running',
      progress: { current: 0, total: totalOps },
      summary: { entriesCreated: 0, remindersSent: 0 },
      errors: [],
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    try {
      await storage.jobs.put(job);
    } catch (err: any) {
      console.error(`[export jobId=${jobId}] failed to create job:`, err);
      return res.status(500).json({ error: "Failed to start export job." });
    }

    console.log(`[export jobId=${jobId}] starting`, JSON.stringify({ matterDisplayNumber, eventCount: events?.length || 0, totalOps }));

    // Fire and forget — client polls /api/clio/export-status/:jobId for progress
    runExportJob(job, accessToken, {
      matterDisplayNumber,
      events: events || [],
      involvedAttorneys: involvedAttorneys || [],
      involvedStaff: involvedStaff || [],
      timezone,
    }).catch(async (err: any) => {
      process.stderr.write(`[export jobId=${jobId}] runExportJob threw outside try: ${err?.message || err}\n`);
      try {
        const j = await storage!.jobs.get<ExportJob>(jobId);
        if (j) {
          j.status = 'error';
          j.errorMessage = err?.message || String(err);
          j.updatedAt = Date.now();
          await storage!.jobs.put(j);
        }
      } catch { /* best effort */ }
    });

    res.status(202).json({ jobId });
  });

  app.get("/api/clio/export-status/:jobId", async (req, res) => {
    if (!storage) {
      return res.status(503).json({ error: "No storage backend configured." });
    }
    try {
      const job = await storage.jobs.get<ExportJob>(req.params.jobId);
      if (!job) {
        return res.status(404).json({ error: "Job not found or has expired" });
      }
      res.json({
        status: job.status,
        progress: job.progress,
        summary: job.summary,
        errors: job.errors,
        errorMessage: job.errorMessage,
      });
    } catch (err: any) {
      console.error("Error reading export job:", err);
      res.status(500).json({ error: "Failed to read job status" });
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
