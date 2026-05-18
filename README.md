# AI Calendaring Clerk - Full Stack

An advanced, full-stack legal docketing assistant designed for law firms to analyze legal documents (PDFs), extract precise schedules, apply firm-specific SOPs (Standard Operating Procedures), and synchronize everything with Clio Manage.

> **Want to try this yourself?** A step-by-step deployment guide is included at the bottom of this document — little technical experience required.

## 🚀 Overview

The AI Calendaring Clerk V2 automates the complex process of docketing by combining Anthropic's Claude AI with deep integrations into legal practice management software. It doesn't just extract dates; it understands the context, applies your firm's specific rules (reminders, calendar mappings), and syncs them directly to your system of record.

## ✨ Key Features

- **Intelligent PDF Analysis**: High-fidelity PDF processing using `pdfjs-dist` combined with Claude's reasoning capabilities.
- **Automated Date Calculation**: Identifies "trigger" events and automatically computes relative deadlines (e.g., "10 days after service").
- **Clio Manage Integration**: Secure OAuth 2.0 connection to Clio Manage for real-time access to users and calendars.
- **SOP Rules Engine**: Configure firm-wide rules in a dedicated dashboard. Map extracted events to specific Clio calendars and set automatic reminders (Email or Calendar).
- **Dynamic Descriptions**: AI-powered description enrichment that fills placeholders (e.g., `[Matter Name]`) with actual data from the document.
- **Source Verification**: Provides 1:1 verbatim quotes and page numbers for every extracted date, with integrated visual highlighting in the built-in PDF viewer.
- **Secure Architecture**: Sensitive operations (OAuth, API integrations, database access) are handled server-side with HTTP-only cookies and proxy endpoints. Access is restricted to your team's accounts via cloud-platform authentication (Identity-Aware Proxy on Google Cloud Run, App Service Authentication on Azure Container Apps).

## 🛠️ Tech Stack

- **Frontend**: React 19, Framer Motion, Lucide React, Tailwind CSS.
- **Backend**: Node.js, Express, WebSockets (`ws`).
- **AI Engine**: Anthropic Claude API (`@anthropic-ai/sdk`, Opus 4.7).
- **Database**: Firebase Firestore (Google Cloud) or Azure Cosmos DB (Azure) — for SOP rules. The same image works with either; pick the one for the cloud you're deploying to.
- **Integrations**: Clio Manage API (OAuth 2.0).

## 📋 How to Use

1. **Configure SOPs**: Navigate to the **SOP Dashboard** to define how specific court events should be handled (which calendar they go to, what reminders to add).
2. **Connect Clio**: Click **Connect Clio** to authorize the application.
3. **Upload**: Drag and drop a legal PDF (e.g., a Scheduling Order).
4. **Analyze**: The AI extracts dates, matches them against your SOPs, and applies your rules.
5. **Review & Verify**:
   - Use the side-by-side viewer to verify extracted dates against the source text.
   - Click the **Search** icon to jump to the exact location in the PDF.
6. **Export**: Select events and click **Export to System** to sync them directly with your practice management system.

## ⚖️ Accuracy Disclaimer & Legal Notice

AI can make mistakes. The AI Calendaring Clerk is designed to assist docketing professionals, not replace them. Always use the built-in **Source Verification** tools to confirm the accuracy of every extracted date before finalizing the calendar.

**This software is provided without warranty, express or implied. The authors and contributors shall not be liable for any claim, damages, or other liability arising from the use of this software.**

Missed deadlines and docketing errors can have serious legal consequences. This tool does not constitute legal advice and is not a substitute for qualified legal professionals or proper docketing review procedures. Users assume full responsibility for verifying all dates and deadlines extracted by this application before acting on them.

## 🚀 Deployment Guide

The app runs on either **Google Cloud Run** (with Firestore) or **Azure Container Apps** (with Cosmos DB). Pick whichever cloud your firm already uses:

- **Option A — [Google Cloud Run](#option-a--deploy-to-google-cloud-run)** — original target. Best if your firm uses Google Workspace.
- **Option B — [Azure Container Apps](#option-b--deploy-to-azure-container-apps)** — best if your firm uses Microsoft 365.

Same Docker image powers both. The app picks the storage backend automatically based on which env vars you set.

---

## Option A — Deploy to Google Cloud Run

### Prerequisites

- A [GitHub account](https://github.com)
- A [Google Cloud account](https://console.cloud.google.com/) with billing enabled
- A [Clio Manage](https://developers.clio.com/) account with developer access

---

### Step 1 — Fork the Repository

A **fork** is your own copy of this codebase hosted under your GitHub account. You'll deploy from your fork, which gives you full control over the code and your own Cloud Run instance.

1. Go to the repository: [github.com/swansgeneral/ai-calendaring-clerk-full-stack](https://github.com/swansgeneral/ai-calendaring-clerk-full-stack)
2. Click **Fork** (top right) → **Create fork**

> **Note:** If updates are published to the original repository, you can sync your fork from GitHub using the **"Sync fork"** button on your fork's page.

---

### Step 2 — Create a Google Cloud Project

1. Go to [console.cloud.google.com](https://console.cloud.google.com/)
2. Click the project dropdown → **New Project**
3. Name your project and click **Create**

---

### Step 3 — Set Up Billing

1. Go to [Billing](https://console.cloud.google.com/billing) and link a billing account to your new project

> Running this app has minimal cost. Aside from standard Cloud Run infrastructure (which has a generous free tier), the only ongoing cost is Anthropic API usage — typically under a dollar per dozen files analyzed.

---

### Step 4 — Deploy to Cloud Run

1. Go to [Cloud Run](https://console.cloud.google.com/run) and click **Connect repository**

![Cloud Run overview showing Connect repository option](docs/images/cloud-run-overview.png)

2. Select **"Continuously deploy from a repository"** then click **Set up with Cloud Build**

![Cloud Run create service screen](docs/images/cloud-run-create-service.png)

3. Connect your GitHub account and select your forked repository, set the branch to `main`, and click **Next**

   > **Note:** If no repositories appear, you may need to install the **Google Cloud Build** GitHub App first. Click **Install Google Cloud Build** when prompted, authorize it on your GitHub account, and grant it access to your forked repository. Then return to Cloud Build and your repository will appear in the list.

**Security (IMPORTANT):** Enable **Identity-Aware Proxy (IAP)** authentication to restrict access to Google accounts within your domain only.

![IAP configuration screen](docs/images/cloud-run-iap.png)

4. Click **Create** and wait for the initial deployment to complete

5. Once deployed, copy your app URL from the service details page — you will need it in later steps

![Cloud Run service details showing the app URL](docs/images/cloud-run-app-url.png)

---

### Step 5 — Set Up Firebase (Firestore Database)

1. Go to [console.firebase.google.com](https://console.firebase.google.com/) and click **Add project**
2. Select the **same Google Cloud project** you created in Step 2
3. Inside your Firebase project, go to **Databases & Storage → Firestore** → **Create database**

![Firebase Firestore create database screen](docs/images/firebase-create-database.png)

4. Choose **Production mode** and select a region close to your users
5. Go to **Settings → Service accounts** → **Generate new private key**
6. A `.json` file will be downloaded — keep it safe, you will need its contents in Step 8

![Firebase Project Settings showing Generate new private key](docs/images/firebase-private-key.png)

---

### Step 6 — Create a Clio Developer App


1. Go to the [Clio Developer Portal](https://developers.clio.com/) and sign in
2. Click **Create App** and fill in the details:
   - **Name:** anything descriptive
   - **Website URL:** your firm's website (e.g. `https://yourfirm.com`)
   - **Redirect URL:** your app URL + `/api/auth/clio/callback`
     - Example: `https://your-app-405499094876.us-south1.run.app/api/auth/clio/callback`
3. Under **Permissions**, enable **Read and Write** access for the following scopes:
   - API, Calendars, Contacts, Custom Fields, Imports, General, Matters, Users, Webhooks, Custom Actions, Activities
4. Save the app and note down the **Client ID** and **Client Secret**

---

### Step 7 — Get an Anthropic API Key

1. Go to the [Anthropic Console](https://console.anthropic.com/)
2. Create a project (or pick an existing one) → **Settings → API Keys → Create Key** → copy it
3. **Set a spend cap** on the project (Settings → Limits) to prevent runaway cost from a bug or misuse

---

### Step 8 — Configure & Redeploy: Environment Variables & Timeout

1. Go to your Cloud Run service and click **Edit & deploy new revision**

![Cloud Run Edit and deploy new revision button](docs/images/cloud-run-edit-revision.png)

2. Open the **Variables & Secrets** tab and add the following environment variables:

![Cloud Run Variables and Secrets tab with all environment variables filled in](docs/images/cloud-run-env-vars.png)

| Variable | Value |
|---|---|
| `FIREBASE_PRIVATE_KEY` | Paste the full contents of the `.json` file downloaded in Step 5 |
| `APP_URL` | Your Cloud Run app URL (e.g. `https://your-app-405499094876.us-south1.run.app`) |
| `CLIO_CLIENT_ID` | From the Clio Developer Portal (Step 6) |
| `CLIO_CLIENT_SECRET` | From the Clio Developer Portal (Step 6) |
| `API_KEY` | Your Anthropic API key (Step 7) |

3. Still in the same revision editor, scroll down to the **Requests** section and set **Request timeout** to `600` seconds. This is required for large exports with many events and reminders.

4. Click **Deploy** and wait for the new revision to go live. Your app is now fully configured and ready to use.

> **Customizing app defaults:** To change the timezone, default event duration, case types, or other application settings, edit the [`env.tsx`](env.tsx) file in your fork and redeploy.

---

## Option B — Deploy to Azure Container Apps

### Prerequisites

- A [GitHub account](https://github.com)
- An [Azure account](https://portal.azure.com) with an active subscription
- A [Clio Manage](https://developers.clio.com/) account with developer access
- An [Anthropic API key](https://console.anthropic.com/) with a spend cap configured

> **Note:** Unlike the Cloud Run path, you don't need to fork the repository. The app's Docker image is published publicly to GitHub Container Registry and pulled directly by Azure.

---

### Step 1 — Create a Resource Group

In the [Azure Portal](https://portal.azure.com), search for **Resource groups** and create a new one. Pick a name like `rg-ai-calendaring` and a region close to your firm (e.g. `East US`).

> **Heads up — Azure quotas.** New Azure subscriptions sometimes start with 0 vCPU quota in certain regions. If a later step fails with a quota error, request a quota increase via Subscriptions → Usage + quotas, or try a different region.

---

### Step 2 — Create a Cosmos DB account

Search for **Azure Cosmos DB** → **+ Create** → choose **Azure Cosmos DB for NoSQL**. Fill in:

- **Workload Type:** Development / Testing
- **Account Name:** something globally unique (e.g. `cosmos-aical-yourfirm`)
- **Location:** same region as the Resource Group
- **Capacity mode:** Provisioned throughput
- **Apply Free Tier Discount:** Apply (saves ~$25/month)

After provisioning (~5 min), open the account → **Data Explorer** → **New Container**:

- **Database id:** `calendaring_clerk`
- **Container id:** `sop_data`
- **Partition key:** `/id`
- **Throughput:** Manual, **400 RU/s** (stays inside Free Tier)

Then go to **Settings → Keys** and copy the **URI** and **PRIMARY KEY** — you'll paste them in Step 5.

---

### Step 3 — Create the Container App

Search for **Container Apps** → **+ Create → Container App**. Fill in:

**Basics:**
- **Container app name:** `ca-ai-calendaring`
- **Region:** same as Resource Group
- **Deployment source:** Container image
- **Container Apps Environment:** click **Create new** → Plan: **Consumption only** → Create

**Container tab:**
- **Image source:** **Docker Hub or other registries**
- **Image type:** **Public**
- **Registry login server:** `ghcr.io`
- **Image and tag:** `swansgeneral/ai-calendaring-clerk:latest`

**Ingress tab:**
- **Ingress:** Enabled, accepting traffic from anywhere, HTTP
- **Target port:** `8080`
- **Session affinity:** Enabled

**Review + create → Create.** After it's running, copy the **Application URL** from the Overview page — you'll need it for Steps 4 and 5.

---

### Step 4 — Create a Clio Developer App

1. Go to the [Clio Developer Portal](https://developers.clio.com/) and sign in.
2. Click **Create App** and fill in:
   - **Name:** anything descriptive
   - **Website URL:** your firm's website
   - **Redirect URL:** your Container App URL + `/api/auth/clio/callback`
3. Under **Permissions**, enable **Read and Write** for: API, Calendars, Contacts, Custom Fields, Imports, General, Matters, Users, Webhooks, Custom Actions, Activities.
4. Save and note down the **Client ID** and **Client Secret**.

---

### Step 5 — Configure Environment Variables

In the Container App → **Application → Containers** → click the `main` container → **Edit and deploy**. Switch to the **Environment variables** tab and add:

| Name | Value |
|---|---|
| `PORT` | `8080` |
| `NODE_ENV` | `production` |
| `APP_URL` | Your Container App URL (from Step 3) |
| `COSMOS_ENDPOINT` | URI from Cosmos Keys (Step 2) |
| `COSMOS_KEY` | Primary key from Cosmos Keys (Step 2) |
| `COSMOS_DATABASE` | `calendaring_clerk` |
| `COSMOS_CONTAINER` | `sop_data` |
| `COSMOS_SOP_DOC_ID` | `main_document` |
| `API_KEY` | Your Anthropic API key |
| `CLIO_CLIENT_ID` | From the Clio Developer Portal (Step 4) |
| `CLIO_CLIENT_SECRET` | From the Clio Developer Portal (Step 4) |

Save → click **Create** at the top to deploy a new revision. ~1 min.

---

### Step 6 — Enable Microsoft Login

In the Container App → **Settings → Authentication** → **+ Add identity provider** → **Microsoft**:

- **App registration type:** Create new
- **Supported account types:** **Current tenant - Single tenant** (locks login to your firm)
- **Restrict access:** **Require authentication**
- **Unauthenticated requests:** **HTTP 302 Found redirect** (so unauthorized visitors get sent to the Microsoft sign-in page, not a 401 error)

Save. Open the Container App's URL in an incognito window to verify you're redirected to Microsoft sign-in.

---

### Updates

To pull a newer version, edit the Container App's image tag in **Application → Containers** and bump the tag (e.g. `0.2.0-dryrun` → `0.3.0`). Save → new revision rolls out in ~1 min. Versions are listed at [github.com/orgs/swansgeneral/packages](https://github.com/orgs/swansgeneral/packages).
