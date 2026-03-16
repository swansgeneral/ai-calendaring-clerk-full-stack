# AI Calendaring Clerk V2

An advanced, full-stack legal docketing assistant designed for law firms to analyze legal documents (PDFs), extract precise schedules, apply firm-specific SOPs (Standard Operating Procedures), and synchronize everything with Clio Manage.

## 🚀 Overview

The AI Calendaring Clerk V2 automates the complex process of docketing by combining Google's Gemini AI with deep integrations into legal practice management software. It doesn't just extract dates; it understands the context, applies your firm's specific rules (reminders, calendar mappings), and syncs them directly to your system of record.

## ✨ Key Features

- **Intelligent PDF Analysis**: High-fidelity PDF processing using `pdfjs-dist` combined with Gemini's reasoning capabilities.
- **Automated Date Calculation**: Identifies "trigger" events and automatically computes relative deadlines (e.g., "10 days after service").
- **Clio Manage Integration**: Secure OAuth 2.0 connection to Clio Manage for real-time access to users and calendars.
- **SOP Rules Engine**: Configure firm-wide rules in a dedicated dashboard. Map extracted events to specific Clio calendars and set automatic reminders (Email or Calendar).
- **Dynamic Descriptions**: AI-powered description enrichment that fills placeholders (e.g., `[Matter Name]`) with actual data from the document.
- **Source Verification**: Provides 1:1 verbatim quotes and page numbers for every extracted date, with integrated visual highlighting in the built-in PDF viewer.
- **Real-time Dashboard**: Live updates across the application using WebSockets.
- **Secure Architecture**: Sensitive operations (OAuth, API integrations, Firestore) are handled server-side with HTTP-only cookies and proxy endpoints.

## 🛠️ Tech Stack

- **Frontend**: React 19, Framer Motion, Lucide React, Tailwind CSS.
- **Backend**: Node.js, Express, WebSockets (`ws`).
- **AI Engine**: Google Gemini API (`@google/genai`).
- **Database**: Firebase Firestore (for SOP rules).
- **Integrations**: Clio Manage API (OAuth 2.0).

## ⚙️ Environment Variables

Create a `.env` file based on `.env.example`:

```env
# Gemini API
API_KEY=your_gemini_api_key

# Clio Manage Integration
CLIO_CLIENT_ID=your_clio_client_id
CLIO_CLIENT_SECRET=your_clio_client_secret
APP_URL=your_app_url

# Firebase Admin SDK (Firestore)
# You can paste the entire JSON service account key into FIREBASE_PRIVATE_KEY
FIREBASE_PRIVATE_KEY=your_full_service_account_json
```

## 📋 How to Use

1. **Configure SOPs**: Navigate to the **SOP Dashboard** to define how specific court events should be handled (which calendar they go to, what reminders to add).
2. **Connect Clio**: Click **Connect Clio** to authorize the application.
3. **Upload**: Drag and drop a legal PDF (e.g., a Scheduling Order).
4. **Analyze**: The AI extracts dates, matches them against your SOPs, and applies your rules.
5. **Review & Verify**: 
   - Use the side-by-side viewer to verify extracted dates against the source text.
   - Click the **Search** icon to jump to the exact location in the PDF.
6. **Export**: Select events and click **Export to System** to sync them directly with your practice management system.

## ⚖️ Accuracy Disclaimer

AI can make mistakes. The AI Calendaring Clerk is designed to assist docketing professionals, not replace them. Always use the built-in **Source Verification** tools to confirm the accuracy of every extracted date before finalizing the calendar.

---
*Precision docketing for the modern law firm.*
