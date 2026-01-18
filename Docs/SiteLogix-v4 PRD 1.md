# **SiteLogix-v4 - Product Requirements Document**

## **Definition of Success**

**Success = This exact scenario works flawlessly:**

1. **Jayson texts Corey a link**
2. **Corey clicks link** → Opens in browser
3. **Corey installs app** → Icon appears on his phone home screen
4. **Corey taps icon** → Starts conversation with Roxy
5. **Roxy guides him through daily report questions**
6. **Roxy reads back summary** → Corey confirms
7. **System submits report**
8. **Bookkeeper receives email**: "Daily Payroll Report Submitted - [Date]"
9. **Bookkeeper clicks link in email** → Opens Google Sheet
10. **Bookkeeper sees**: Corey's submission with correct timestamp, employee names, and hours

**That's it. If those 10 steps work, we win.**

---

## **Problem Statement**

Parkway Construction field managers currently submit daily reports via:
- Manual paper forms
- Text messages to office
- Phone calls to bookkeeper

This creates:
- ❌ Delayed payroll processing
- ❌ Data entry errors
- ❌ No audit trail for OSHA
- ❌ Wasted time for everyone

**Current Technical Blocker**: Existing voice agent prototype works on localhost but fails when deployed as publicly accessible web app.

**We need**: One-button voice reporting that takes <3 minutes and requires zero training.

---

## **Solution Overview**

**SiteLogix-v4** = Voice-first daily reporting system

**User Experience:**
- Install web app to phone (like installing from App Store)
- Tap icon → Talk to Roxy (AI voice agent)
- Roxy asks questions, confirms answers, submits report
- Bookkeeper gets email + updated Google Sheet
- Done.

**Tech Stack (High-Level):**
- **Frontend**: Next.js 15 PWA (App Router, TypeScript, Tailwind CSS)
- **Voice Agent**: 11Labs Conversational AI (Roxy - already built, config in .ENV)
- **Backend**: Next.js API Routes (local dev) → AWS Lambda (production)
- **Data Layer**: Repository Pattern with swappable adapters
  - **Parkway Production**: Google Sheets + Google Drive
  - **Local Development**: PostgreSQL + Local filesystem
  - **Future SaaS**: PostgreSQL (RDS) + S3
- **ORM**: Prisma (for PostgreSQL adapters)
- **Hosting**: AWS Amplify (SSR/static hybrid with auto HTTPS)
- **Notifications**: AWS SES or compatible email service
- **AWS Organization**: All resources must reside in `/sitelogix-2026/sitelogix-v4/` folder structure

**Architecture Philosophy:**
> Build once, deploy anywhere. The repository pattern abstracts data storage so business logic doesn't change when switching between Google Sheets (Parkway) and PostgreSQL (future multi-tenant SaaS).

---

## **Technical Architecture & Data Flow**

### **System Architecture Requirements**

```
┌─────────────────────────────────────────────────────────────────┐
│ USER LAYER                                                       │
├─────────────────────────────────────────────────────────────────┤
│ Phone (iOS/Android)                                             │
│   └─ PWA installed as home screen icon                          │
│      └─ Tap icon → Opens in standalone mode                     │
└─────────────────────────────────────────────────────────────────┘
                              ↓ HTTPS
┌─────────────────────────────────────────────────────────────────┐
│ FRONTEND LAYER (AWS)                                            │
├─────────────────────────────────────────────────────────────────┤
│ AWS Amplify Hosted PWA                                          │
│   - Static HTML/CSS/JS bundle                                   │
│   - manifest.json (PWA config)                                  │
│   - Service worker (optional for V4)                            │
│   - Automatic HTTPS provisioning                                │
│                                                                  │
│ Requirements:                                                    │
│   ✓ Must be installable to home screen (iOS Safari + Android)  │
│   ✓ Must work in standalone mode (no browser chrome)           │
│   ✓ Must be shareable via simple URL                           │
└─────────────────────────────────────────────────────────────────┘
                              ↓ API Calls
┌─────────────────────────────────────────────────────────────────┐
│ BACKEND LAYER (AWS)                                             │
├─────────────────────────────────────────────────────────────────┤
│ AWS API Gateway                                                  │
│   └─ REST or HTTP API (dev team choice)                        │
│   └─ CORS configured for Amplify domain                        │
│                                                                  │
│ AWS Lambda Functions (serverless)                               │
│   ├─ Session Initiator                                          │
│   │    └─ Creates 11Labs conversation session                  │
│   │    └─ Returns session URL to frontend                      │
│   │                                                              │
│   ├─ Webhook Handler                                            │
│   │    └─ Receives structured data from 11Labs                 │
│   │    └─ Triggers data processing pipeline                    │
│   │                                                              │
│   ├─ Data Processor                                             │
│   │    └─ Normalizes employee names                            │
│   │    └─ Parses hours logic                                   │
│   │    └─ Prepares data for Google APIs                        │
│   │                                                              │
│   ├─ Google Drive Handler                                       │
│   │    └─ Uploads audio file (MP3 from 11Labs)                │
│   │    └─ Uploads transcript (JSON/text)                       │
│   │    └─ Generates shareable links                            │
│   │                                                              │
│   ├─ Google Sheets Writer                                       │
│   │    └─ Writes to Main Report Log tab                        │
│   │    └─ Writes to Payroll Summary tab                        │
│   │    └─ Looks up Employee Reference for validation           │
│   │                                                              │
│   └─ Email Notifier                                             │
│        └─ Sends formatted email to bookkeeper                   │
│        └─ Includes direct link to Payroll Summary              │
│                                                                  │
│ Requirements:                                                    │
│   ✓ All functions must be in /sitelogix-2026/sitelogix-v4/    │
│   ✓ Must handle authentication to Google APIs                  │
│   ✓ Must include error handling & logging                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓ API Calls
┌─────────────────────────────────────────────────────────────────┐
│ VOICE LAYER (11Labs)                                            │
├─────────────────────────────────────────────────────────────────┤
│ 11Labs Conversational AI (Roxy)                                 │
│   - Already configured (credentials in .ENV)                    │
│   - Conversation flow pre-built                                 │
│   - Returns structured data via webhook                         │
│                                                                  │
│ Requirements:                                                    │
│   ✓ Must be accessible from browser context                    │
│   ✓ Must work over HTTPS from Amplify domain                   │
│   ✓ Must return parseable structured data                      │
└─────────────────────────────────────────────────────────────────┘
                              ↓ Webhook
┌─────────────────────────────────────────────────────────────────┐
│ DATA STORAGE LAYER (Google Workspace)                           │
├─────────────────────────────────────────────────────────────────┤
│ Google Drive: Parkway Database                                  │
│   Folder ID: 1UFwgLhlBdgdK8As2EmzW-nHNreHsYeqm                  │
│   Account: jayson@impactconsulting931.com                       │
│                                                                  │
│   Subfolder Structure:                                          │
│   ├─ /Parkway Audio Recordings/                                │
│   │    └─ Stores MP3 files from 11Labs                         │
│   │    └─ Naming: [DATE]_[TIME]_report.mp3                     │
│   │                                                              │
│   └─ /Parkway Transcripts/                                      │
│        └─ Stores conversation transcripts                       │
│        └─ Format: JSON or TXT (dev team choice)                │
│                                                                  │
│ Google Sheets: Parkway Reporting Database                       │
│   Sheet ID: 1lb8nmFjvKdWmoqSLaowEKWEzGzNUPw7CuTTZ7k1FIg4       │
│   Account: jayson@impactconsulting931.com                       │
│                                                                  │
│   Tab Structure:                                                │
│   ├─ Employee Reference                                         │
│   │    └─ Source of truth for employee names                   │
│   │    └─ Used for fuzzy matching/validation                   │
│   │                                                              │
│   ├─ Main Report Log                                            │
│   │    └─ Complete daily report details                        │
│   │    └─ Includes links to audio/transcript files            │
│   │    └─ All fields captured by Roxy                          │
│   │                                                              │
│   └─ Payroll Summary (Bookkeeper View)                          │
│        └─ Focused view: Date, Employee, Hours                  │
│        └─ Direct link sent in email notification               │
│                                                                  │
│ Integration Requirements:                                        │
│   ✓ Must use Google Sheets API v4                              │
│   ✓ Must use Google Drive API v3                               │
│   ✓ Must authenticate via service account or OAuth             │
│   ✓ Must handle rate limits gracefully                         │
│   ✓ Files must be uploaded to correct subfolders              │
│   ✓ Sheet writes must be idempotent (no duplicates)           │
└─────────────────────────────────────────────────────────────────┘
                              ↓ Success Trigger
┌─────────────────────────────────────────────────────────────────┐
│ NOTIFICATION LAYER                                               │
├─────────────────────────────────────────────────────────────────┤
│ Email Service (AWS SES or alternative)                          │
│                                                                  │
│ Email Template Requirements:                                     │
│   To: [Bookkeeper Email - TBD during build]                    │
│   From: [System Email - TBD, must be verified]                 │
│   Subject: Daily Payroll Report Submitted - [Date]             │
│                                                                  │
│   Body must include:                                            │
│   ✓ Manager name who submitted                                 │
│   ✓ Date/time with timezone                                    │
│   ✓ Job site name                                              │
│   ✓ Employee count                                             │
│   ✓ Direct clickable link to Payroll Summary tab              │
│                                                                  │
│ Trigger Requirements:                                            │
│   ✓ Send ONLY after successful Google Sheets write             │
│   ✓ Include error handling (retry logic)                       │
│   ✓ Log all email sends for debugging                          │
└─────────────────────────────────────────────────────────────────┘
```

---

## **Critical Integration Points**

### **1. AWS → 11Labs Integration**
**Requirement**: Frontend must be able to initiate and maintain 11Labs conversation session

**Technical Constraints**:
- 11Labs session must be accessible via HTTPS
- Session URL must work in mobile browser context
- Credentials stored in .ENV file (already configured)
- Roxy configuration already exists - just need to connect

**Data Flow**:
- User taps "Start Report" → API call to Lambda
- Lambda creates 11Labs session → Returns session URL
- Frontend connects to 11Labs via returned URL
- Conversation happens in browser
- 11Labs webhooks back to Lambda when complete

---

### **2. 11Labs → AWS Webhook Integration**
**Requirement**: Receive structured conversation data from 11Labs

**Technical Constraints**:
- Lambda must expose webhook endpoint
- Endpoint must be publicly accessible (HTTPS)
- Must validate webhook authenticity (11Labs signature)
- Must handle webhook retry logic

**Expected Data Structure** (from Roxy):
```json
{
  "job_site": "string (optional)",
  "employees": [
    {
      "name": "string",
      "regular_hours": number,
      "overtime_hours": number
    }
  ],
  "deliveries": "string (optional)",
  "incidents": "string (optional)",
  "shortages": "string (optional)",
  "timestamp": "ISO 8601 datetime",
  "audio_url": "URL to recording",
  "transcript": "full text transcript"
}
```

---

### **3. AWS → Google Workspace Integration**
**Requirement**: Write data to Sheets and upload files to Drive

**Google Sheets API Requirements**:
- **Authentication**: Service account with access to Sheet ID `1lb8nmFjvKdWmoqSLaowEKWEzGzNUPw7CuTTZ7k1FIg4`
- **Permissions**: Read/Write access to all tabs
- **Operations Needed**:
  - Read Employee Reference tab (for name validation)
  - Append rows to Main Report Log tab
  - Append rows to Payroll Summary tab
  - Generate shareable link to Payroll Summary tab

**Google Drive API Requirements**:
- **Authentication**: Same service account as Sheets
- **Permissions**: Write access to Folder ID `1UFwgLhlBdgdK8As2EmzW-nHNreHsYeqm`
- **Operations Needed**:
  - Upload audio file to `/Parkway Audio Recordings/` subfolder
  - Upload transcript to `/Parkway Transcripts/` subfolder
  - Generate shareable links for both files
  - Return links to include in Sheets rows

**Data Integrity Requirements**:
- Employee names must be normalized against Employee Reference
- Timestamps must include timezone information
- File naming must be consistent and sortable
- No duplicate entries (check before insert)

---

## **Data Abstraction Layer Architecture**

### **Why This Matters**
SiteLogix-v4 is built for Parkway Construction using Google Sheets/Drive. However, the architecture must support future multi-tenant SaaS deployment without rewriting business logic. The **Repository Pattern** solves this.

### **Repository Pattern Overview**

```
┌─────────────────────────────────────────────────────────────────┐
│ BUSINESS LOGIC LAYER                                            │
│   (Voice processing, name matching, hours parsing, email)       │
│                                                                  │
│   Calls repository methods - doesn't know WHERE data lives      │
│   Example: await reportRepo.saveReport(data)                    │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ REPOSITORY INTERFACE LAYER                                       │
├─────────────────────────────────────────────────────────────────┤
│ ReportRepository                                                 │
│   ├─ saveReport(report: DailyReport): Promise<void>             │
│   ├─ getReportById(id: string): Promise<DailyReport>            │
│   └─ getReportsByDate(date: Date): Promise<DailyReport[]>       │
│                                                                  │
│ EmployeeRepository                                               │
│   ├─ getAllEmployees(): Promise<Employee[]>                     │
│   ├─ findByName(name: string): Promise<Employee | null>         │
│   └─ fuzzyMatch(name: string): Promise<Employee | null>         │
│                                                                  │
│ FileRepository                                                   │
│   ├─ uploadAudio(buffer: Buffer, name: string): Promise<string> │
│   ├─ uploadTranscript(content: string, name: string): Promise<string>│
│   └─ getFileUrl(fileId: string): Promise<string>                │
└─────────────────────────────────────────────────────────────────┘
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ ADAPTER LAYER (Swappable Implementations)                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐ │
│  │ Google Adapter  │  │ Postgres Adapter│  │ S3 Adapter      │ │
│  │ (Parkway Prod)  │  │ (Local Dev)     │  │ (Future SaaS)   │ │
│  ├─────────────────┤  ├─────────────────┤  ├─────────────────┤ │
│  │ Google Sheets   │  │ PostgreSQL      │  │ PostgreSQL      │ │
│  │ Google Drive    │  │ Local Files     │  │ AWS S3          │ │
│  │ OAuth/Service   │  │ Prisma ORM      │  │ Prisma ORM      │ │
│  └─────────────────┘  └─────────────────┘  └─────────────────┘ │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### **Adapter Selection**

Adapters are selected via environment variable:

```typescript
// src/lib/repositories/index.ts
export function getReportRepository(): ReportRepository {
  const adapter = process.env.DATA_ADAPTER || 'google'

  switch (adapter) {
    case 'google':
      return new GoogleSheetsReportRepository()
    case 'postgres':
      return new PostgresReportRepository()
    default:
      throw new Error(`Unknown adapter: ${adapter}`)
  }
}
```

### **Environment Configuration**

| Environment | DATA_ADAPTER | FILE_ADAPTER | Database |
|-------------|--------------|--------------|----------|
| Local Dev   | `postgres`   | `local`      | Docker PostgreSQL |
| Parkway Prod| `google`     | `google`     | Google Sheets/Drive |
| Future SaaS | `postgres`   | `s3`         | AWS RDS + S3 |

### **Interface Definitions**

```typescript
// src/lib/repositories/types.ts

interface DailyReport {
  id?: string
  timestamp: Date
  timezone: string
  jobSite?: string
  employees: EmployeeHours[]
  deliveries?: string
  incidents?: string
  shortages?: string
  audioUrl?: string
  transcriptUrl?: string
}

interface EmployeeHours {
  employeeId?: string
  name: string
  normalizedName: string
  regularHours: number
  overtimeHours: number
  totalHours: number
}

interface Employee {
  id: string
  name: string
  active: boolean
}

interface ReportRepository {
  saveReport(report: DailyReport): Promise<string>
  getReportById(id: string): Promise<DailyReport | null>
  getReportsByDateRange(start: Date, end: Date): Promise<DailyReport[]>
}

interface EmployeeRepository {
  getAllActive(): Promise<Employee[]>
  findByName(name: string): Promise<Employee | null>
  fuzzyMatch(name: string, threshold?: number): Promise<Employee | null>
}

interface FileRepository {
  uploadAudio(buffer: Buffer, filename: string): Promise<string>
  uploadTranscript(content: string, filename: string): Promise<string>
  getPublicUrl(fileId: string): Promise<string>
}
```

### **Benefits of This Architecture**

| Benefit | Description |
|---------|-------------|
| **No Code Duplication** | Business logic written once, works with any backend |
| **Fast Local Dev** | PostgreSQL is faster than hitting Google APIs |
| **No API Rate Limits** | Local dev doesn't count against Google quotas |
| **Easy Testing** | Can mock repositories for unit tests |
| **Future-Proof** | Add new adapters without changing business logic |
| **Client Flexibility** | Some clients want Google, others want database |

### **File Structure for Repositories**

```
src/lib/repositories/
├── types.ts                      # Interface definitions
├── index.ts                      # Factory functions
├── adapters/
│   ├── google/
│   │   ├── sheets-report.adapter.ts
│   │   ├── sheets-employee.adapter.ts
│   │   └── drive-file.adapter.ts
│   ├── postgres/
│   │   ├── postgres-report.adapter.ts
│   │   ├── postgres-employee.adapter.ts
│   │   └── local-file.adapter.ts
│   └── s3/
│       └── s3-file.adapter.ts    # Future: for SaaS
└── utils/
    └── fuzzy-match.ts            # Shared name matching logic
```

---

## **Core Features (V4 Scope)**

### **In Scope:**
✅ PWA installable to iOS/Android home screen  
✅ One-button "Start Daily Report" interface  
✅ Voice conversation with Roxy covering:
   - Job site name (optional field)
   - Employee names who worked (list)
   - Hours worked per employee (regular + overtime)
   - Deliveries (free text, optional)
   - Incidents/safety issues (free text, optional)
   - Shortages/missing materials (free text, optional)
✅ Roxy reads back summary for user confirmation  
✅ Employee name normalization (fuzzy matching against reference list)  
✅ Hours parsing logic (handle "everyone worked X, Person Y had Z OT")  
✅ Auto-write to Google Sheets (2 tabs: Main Log + Payroll Summary)  
✅ Audio recording storage in Google Drive  
✅ Transcript storage in Google Drive  
✅ Email notification to bookkeeper with direct Sheet link  
✅ Timezone-aware timestamps (detect from device)  

### **Out of Scope (Future):**
❌ User login/authentication  
❌ View past reports in app  
❌ Analytics/dashboard  
❌ Multi-language support  
❌ Offline mode  
❌ Edit submitted reports  
❌ Multiple job site selection UI  

---

## **Data Model**

### **Google Sheets: Parkway Reporting Database**
**Sheet ID**: `1lb8nmFjvKdWmoqSLaowEKWEzGzNUPw7CuTTZ7k1FIg4`

**Tab 1: Employee Reference**
| Column | Data Type | Purpose |
|--------|-----------|---------|
| Employee Name | String | Source of truth for spelling |
| Active Status | Boolean | Filter for current employees |

**Tab 2: Main Report Log** 
| Column | Data Type | Purpose |
|--------|-----------|---------|
| Timestamp | DateTime with TZ | When report submitted |
| Job Site | String | Job site name (optional) |
| Employee Name | String | One row per employee |
| Regular Hours | Number | Standard hours worked |
| OT Hours | Number | Overtime hours |
| Deliveries | String | Delivery notes (optional) |
| Incidents | String | Safety incidents (optional) |
| Shortages | String | Missing materials (optional) |
| Audio Link | URL | Link to Drive recording |
| Transcript Link | URL | Link to Drive transcript |

**Tab 3: Payroll Summary** (Bookkeeper view)
| Column | Data Type | Purpose |
|--------|-----------|---------|
| Date | Date | Report date |
| Employee Name | String | Employee who worked |
| Regular Hours | Number | Regular hours |
| OT Hours | Number | Overtime hours |
| Total Hours | Number | Calculated: Reg + OT |

**Sheet Requirements**:
- Timestamp must include timezone (e.g., "2025-01-18 2:45 PM EST")
- One row per employee in Payroll Summary
- Audio/Transcript links must be clickable
- Total Hours must be auto-calculated or written correctly

---

### **Google Drive: Parkway Database**
**Folder ID**: `1UFwgLhlBdgdK8As2EmzW-nHNreHsYeqm`

**Folder Structure**:
```
Parkway Database/
├─ Parkway Audio Recordings/
│  └─ [YYYY-MM-DD]_[HHMMSS]_report.mp3
│
└─ Parkway Transcripts/
   └─ [YYYY-MM-DD]_[HHMMSS]_transcript.[json|txt]
```

**File Requirements**:
- Audio: MP3 format from 11Labs
- Transcript: Structured format (JSON preferred, TXT acceptable)
- Naming: Sortable by datetime
- Permissions: Shareable via link

---

## **Business Logic Requirements**

### **Employee Name Normalization**
**Problem**: Users say "Jon" but database has "John", or "Corey" vs "Cory"

**Required Behavior**:
1. When employee name is received from Roxy:
   - Look up in Employee Reference tab
   - If exact match → use that spelling
   - If fuzzy match (Levenshtein distance < 3) → use database spelling
   - If no match or low confidence → flag for review (V2 feature)
2. For V4: Use best match from reference list
3. Log all name matching for debugging

---

### **Hours Parsing Logic**
**Problem**: "Everyone worked 8 hours, Corey had 2 hours overtime"

**Required Interpretation**:
- "Everyone worked 8" = All employees get 8 regular hours
- "Corey had 2 OT" = Corey Davis gets 8 regular + 2 OT = 10 total
- Everyone else gets 8 regular + 0 OT = 8 total

**Required Behavior**:
1. Roxy must confirm this interpretation during conversation
2. Example: "So Corey worked 8 regular plus 2 overtime, for 10 total hours. Is that correct?"
3. User must confirm before submission
4. Data written to sheet must reflect this accurately

**Edge Cases to Handle**:
- "Everyone worked 10" (no OT, just long day)
- "Corey worked 6, everyone else worked 8" (different regular hours)
- Multiple people with OT

---

### **Timezone Handling**
**Requirement**: Bookkeeper needs to know WHEN report was submitted in local time

**Required Behavior**:
- Detect timezone from user's device/browser
- Store timestamp with timezone identifier
- Display in human-readable format: "January 18, 2025, 2:45 PM EST"
- Use for file naming (consistent format)

---

## **Email Notification Specification**

**Trigger**: Sent immediately after successful Google Sheets write

**To**: [Bookkeeper Email - TBD during build]  
**From**: [System Email - TBD, must be verified for SES]  
**Subject**: `Daily Payroll Report Submitted - [Month DD, YYYY]`

**Body Template**:
```
A new daily payroll report has been submitted by [Manager First Name].

Date: [Month DD, YYYY at HH:MM AM/PM TIMEZONE]
Job Site: [Job Site Name or "Not specified"]
Employees Reported: [Count]

View the updated payroll sheet:
[Direct link to Payroll Summary tab with appropriate gid parameter]

---
SiteLogix Automated Reporting System
```

**Requirements**:
- Must be HTML formatted (not plain text)
- Link must open directly to Payroll Summary tab
- Must include error handling (retry failed sends)
- Must log all email attempts for debugging

---

## **PWA Installation Requirements**

### **Must Work On:**
- ✅ iOS (Safari browser)
- ✅ Android (Chrome browser)

### **Installation Experience:**
**iOS (Safari)**:
1. User opens URL in Safari
2. Taps Share button
3. Selects "Add to Home Screen"
4. Icon appears on home screen
5. Tapping icon opens app in standalone mode (no browser UI)

**Android (Chrome)**:
1. User opens URL in Chrome
2. Chrome prompts "Add SiteLogix to Home screen"
3. User taps "Add"
4. Icon appears on home screen
5. Tapping icon opens app in standalone mode

### **Technical Requirements for PWA**:
- Valid `manifest.json` file
- App icons: 192x192, 512x512, 180x180 (iOS)
- Served over HTTPS (Amplify provides this)
- `display: "standalone"` in manifest
- Optional: Service worker for offline capability (not required for V4)

---

## **Success Metrics**

**Adoption:**
- 80% of daily reports via SiteLogix within 2 weeks
- 100% of field managers install successfully on first attempt

**Efficiency:**
- Average report completion time <3 minutes
- 90% of reports completed without restart/correction

**Data Quality:**
- 95% of reports require zero manual correction by bookkeeper
- 100% of audio/transcript files successfully stored
- Zero duplicate entries in Google Sheets

**Reliability:**
- 98% uptime (successful end-to-end completions)
- <2 second load time from icon tap to "Start Report" button

**User Satisfaction:**
- Field managers prefer SiteLogix to manual method
- Bookkeeper confirms payroll processing is faster/cleaner

---

## **Development Phases**

### **Phase 0: Foundation & Setup**

#### **0.1: GitHub & Project Initialization**
- [ ] Create GitHub repository: `sitelogix-v4`
- [ ] Initialize Next.js 15 project with TypeScript, Tailwind CSS, App Router
- [ ] Configure ESLint, Prettier, and TypeScript strict mode
- [ ] Set up project folder structure (see below)
- [ ] Create `.env.example` and `.env.local` files
- [ ] Configure `.gitignore` for sensitive files

#### **0.2: Local Development Environment**
- [ ] Create `docker-compose.yml` for local PostgreSQL
- [ ] Initialize Prisma ORM with PostgreSQL schema
- [ ] Create database migrations for local dev
- [ ] Seed local database with test employees
- [ ] Verify local PostgreSQL connection

#### **0.3: Repository Pattern Infrastructure**
- [ ] Define TypeScript interfaces (`src/lib/repositories/types.ts`)
- [ ] Create repository factory functions (`src/lib/repositories/index.ts`)
- [ ] Build PostgreSQL adapter for ReportRepository
- [ ] Build PostgreSQL adapter for EmployeeRepository
- [ ] Build Local File adapter for FileRepository
- [ ] Build Google Sheets adapter for ReportRepository
- [ ] Build Google Sheets adapter for EmployeeRepository
- [ ] Build Google Drive adapter for FileRepository
- [ ] Create shared fuzzy matching utility
- [ ] Test adapter switching via environment variable

#### **0.4: Google Workspace Configuration**
- [ ] Verify .ENV credentials for Google APIs
- [ ] Create Employee Reference tab in Google Sheets
- [ ] Create Main Report Log tab in Google Sheets
- [ ] Create Payroll Summary tab in Google Sheets
- [ ] Create subfolders in Google Drive (Audio Recordings, Transcripts)
- [ ] Test Google Sheets read/write from local dev
- [ ] Test Google Drive upload from local dev

#### **0.5: AWS & Amplify Setup**
- [ ] Set up AWS folder structure: `/sitelogix-2026/sitelogix-v4/`
- [ ] Create AWS Amplify app connected to GitHub repo
- [ ] Configure Amplify build settings for Next.js
- [ ] Set up environment variables in Amplify console
- [ ] Verify .ENV credentials for 11Labs, AWS, Google

#### **0.6: PWA Assets**
- [ ] Design and export PWA icons (192x192, 512x512, 180x180 for iOS)
- [ ] Create `manifest.json` with standalone display mode
- [ ] Create basic service worker (optional for V4)
- [ ] Test Roxy locally to confirm 11Labs configuration

**Success Criteria**:
- Local dev environment fully functional with PostgreSQL
- Repository pattern working with adapter switching
- Google Sheets/Drive accessible from local dev
- AWS Amplify app created and connected to GitHub

---

### **Phase 1: Core Voice Flow**

#### **1.1: PWA Shell**
- [ ] Build main page layout with "Start Report" button
- [ ] Implement responsive design for mobile
- [ ] Add loading states and error handling UI
- [ ] Configure PWA manifest for home screen installation

#### **1.2: 11Labs Integration**
- [ ] Create API route for 11Labs session initiation
- [ ] Connect frontend to 11Labs conversation widget
- [ ] Handle conversation state (starting, active, complete)
- [ ] Create webhook endpoint for 11Labs completion data

#### **1.3: PWA Testing**
- [ ] Deploy to AWS Amplify (staging)
- [ ] Test PWA installation on iOS Safari
- [ ] Test PWA installation on Android Chrome
- [ ] Test voice conversation end-to-end
- [ ] Verify webhook data structure from Roxy

**Success Criteria**: Can install app to home screen, talk to Roxy, receive structured data from 11Labs webhook

---

### **Phase 2: Data Processing & Storage**

#### **2.1: Business Logic**
- [ ] Implement employee name fuzzy matching (using repository pattern)
- [ ] Implement hours parsing logic (regular + overtime)
- [ ] Create data normalization pipeline
- [ ] Add validation for required fields

#### **2.2: Data Persistence (via Repository Pattern)**
- [ ] Wire webhook handler to ReportRepository
- [ ] Wire webhook handler to EmployeeRepository for name lookup
- [ ] Wire webhook handler to FileRepository for audio/transcript upload
- [ ] Generate shareable links for files
- [ ] Test with PostgreSQL adapter (local dev)
- [ ] Test with Google adapter (staging)

#### **2.3: Integration Testing**
- [ ] Test full data flow: Roxy → Webhook → Repository → Storage
- [ ] Verify data appears correctly in Google Sheets
- [ ] Verify files appear correctly in Google Drive
- [ ] Test idempotency (no duplicate entries)

**Success Criteria**: Completed report appears correctly in Parkway Reporting Database with links to audio/transcript in Drive

---

### **Phase 3: Email Notifications**

- [ ] Configure AWS SES (or alternative)
- [ ] Verify sender email domain
- [ ] Build HTML email template
- [ ] Create email service using repository pattern
- [ ] Generate direct link to Payroll Summary tab (with gid parameter)
- [ ] Trigger email after successful repository write
- [ ] Test email delivery to bookkeeper

**Success Criteria**: Bookkeeper receives formatted email with working Sheet link immediately after report submission

---

### **Phase 4: Production Deployment & Testing**

- [ ] Configure production environment variables in Amplify
- [ ] Configure production email addresses (bookkeeper, sender)
- [ ] Switch DATA_ADAPTER to `google` for production
- [ ] Deploy to production Amplify environment
- [ ] End-to-end test with real phone
- [ ] Load actual 25 employee names to Employee Reference
- [ ] Test with pilot user (Jayson's phone first)

**Success Criteria**: Jayson → Corey success scenario works perfectly

---

### **Phase 5: User Onboarding & Validation**

- [ ] Create installation guide (PDF with screenshots)
- [ ] Create 30-second installation video
- [ ] Generate QR code for easy URL sharing
- [ ] Onboard 2-3 field managers
- [ ] Monitor first week of reports
- [ ] Collect feedback and fix issues

**Success Criteria**: 5 consecutive days of clean reports without Jayson's intervention

---

## **Configuration Placeholders**

*The following will be determined/configured during the build process:*

### **URLs & Domains**
- [ ] AWS Amplify deployment URL
- [ ] Optional: Custom domain (e.g., sitelogix.impactconsulting931.com)
- [ ] API Gateway endpoint URLs
- [ ] 11Labs webhook callback URL

### **Email Configuration**
- [ ] Bookkeeper email address (recipient)
- [ ] System sender email (must be SES-verified)
- [ ] Reply-to email (if different from sender)

### **AWS Resources**
- [ ] Amplify App ID
- [ ] Lambda function ARNs
- [ ] API Gateway ID
- [ ] SES configuration region

### **Google Authentication**
- [✅] Drive Folder ID: `1UFwgLhlBdgdK8As2EmzW-nHNreHsYeqm`
- [✅] Sheets ID: `1lb8nmFjvKdWmoqSLaowEKWEzGzNUPw7CuTTZ7k1FIg4`
- [ ] Service account JSON credentials
- [ ] OAuth scopes (if using OAuth instead of service account)

*Note: These are implementation details to be configured during build - not requirements that restrict technical approach.*

---

## **Known Risks & Mitigation Strategies**

### **Risk 1: PWA Installation Friction**
**Risk**: Users don't know how to "Add to Home Screen"  
**Impact**: Low adoption, managers revert to manual reports  
**Mitigation**:
- Create clear installation guides (video + PDF)
- Use QR codes on laminated cards for job sites
- Jayson does first install walkthrough via video call
- Consider SMS with installation link + instructions

---

### **Risk 2: Voice Recognition Errors**
**Risk**: Roxy misunderstands employee names or numbers  
**Impact**: Incorrect payroll data  
**Mitigation**:
- Roxy MUST read back full summary before submission
- User MUST confirm "Yes" to proceed
- Name normalization helps with spelling variations
- Audio + transcript stored for manual verification if needed

---

### **Risk 3: Spotty Cell Signal on Job Sites**
**Risk**: Connection drops mid-report  
**Impact**: Frustrated users, incomplete data  
**Mitigation**:
- Keep report flow short (<3 min)
- Provide clear error messaging
- Allow users to restart easily
- Consider offline mode in V5 (out of scope for V4)

---

### **Risk 4: Google API Rate Limits**
**Risk**: Too many reports in short time period hit rate limits  
**Impact**: Failed submissions, data not saved  
**Mitigation**:
- Implement exponential backoff retry logic
- Queue writes if needed
- Monitor usage patterns
- Upgrade Google API quotas if necessary

---

### **Risk 5: HTTPS/CORS Configuration**
**Risk**: App works locally but fails in production (current blocker)  
**Impact**: Can't deploy, project stalled  
**Mitigation**:
- Use AWS Amplify (auto-configures HTTPS)
- Carefully configure API Gateway CORS
- Test with ngrok/tunnel before full deployment
- Document all CORS configurations for debugging

---

## **Future Enhancements (Post-V4)**

**Not in scope for V4, but documented for future planning:**

- User authentication (assign reports to specific managers)
- View historical reports in app
- Analytics dashboard (trends, patterns, insights)
- Job site management (track progress by site)
- Photo uploads (site conditions, deliveries, incidents)
- Offline mode (submit when back in signal)
- Push notifications (reminders to submit daily report)
- Multi-language support (Spanish for crews)
- Equipment tracking
- Material tracking/inventory
- Integration with accounting software (QuickBooks, etc.)

---

## **Multi-Tenant SaaS Architecture (Future)**

### **Why This Section Exists**
The repository pattern built into V4 enables future multi-tenant deployment without rewriting business logic. This section documents the path from single-tenant (Parkway) to multi-tenant SaaS.

### **Migration Path**

```
┌─────────────────────────────────────────────────────────────────┐
│ V4: SINGLE TENANT (Parkway)                                     │
├─────────────────────────────────────────────────────────────────┤
│ DATA_ADAPTER=google                                             │
│ FILE_ADAPTER=google                                             │
│                                                                  │
│ ┌─────────────┐                                                 │
│ │  Parkway    │──→ Google Sheets ──→ Bookkeeper Email          │
│ │  (Corey)    │──→ Google Drive                                │
│ └─────────────┘                                                 │
└─────────────────────────────────────────────────────────────────┘
                              ↓
                    Add PostgreSQL Adapter
                              ↓
┌─────────────────────────────────────────────────────────────────┐
│ V5: MULTI-TENANT SaaS                                           │
├─────────────────────────────────────────────────────────────────┤
│ DATA_ADAPTER=postgres                                           │
│ FILE_ADAPTER=s3                                                 │
│                                                                  │
│ ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│ │  Parkway    │  │  Client B   │  │  Client C   │             │
│ │  tenant_id  │  │  tenant_id  │  │  tenant_id  │             │
│ └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│        │                │                │                      │
│        └────────────────┼────────────────┘                      │
│                         ↓                                        │
│              ┌─────────────────────┐                            │
│              │   AWS RDS Postgres  │                            │
│              │   (Multi-tenant)    │                            │
│              └─────────────────────┘                            │
│                         ↓                                        │
│              ┌─────────────────────┐                            │
│              │      AWS S3         │                            │
│              │  /tenant_id/files/  │                            │
│              └─────────────────────┘                            │
└─────────────────────────────────────────────────────────────────┘
```

### **Database Schema Changes for Multi-Tenant**

```sql
-- Add tenant isolation to all tables
CREATE TABLE tenants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(100) UNIQUE NOT NULL,
  settings JSONB DEFAULT '{}',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),  -- Multi-tenant key
  name VARCHAR(255) NOT NULL,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES tenants(id),  -- Multi-tenant key
  submitted_at TIMESTAMP NOT NULL,
  timezone VARCHAR(50),
  job_site VARCHAR(255),
  deliveries TEXT,
  incidents TEXT,
  shortages TEXT,
  audio_url TEXT,
  transcript_url TEXT
);

CREATE TABLE report_employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id UUID REFERENCES reports(id),
  employee_id UUID REFERENCES employees(id),
  regular_hours DECIMAL(4,2),
  overtime_hours DECIMAL(4,2),
  total_hours DECIMAL(4,2)
);

-- Row-level security for tenant isolation
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY tenant_isolation_employees ON employees
  USING (tenant_id = current_setting('app.tenant_id')::UUID);

CREATE POLICY tenant_isolation_reports ON reports
  USING (tenant_id = current_setting('app.tenant_id')::UUID);
```

### **What Changes vs. What Stays The Same**

| Component | V4 (Parkway) | V5 (Multi-Tenant) | Changes Required |
|-----------|--------------|-------------------|------------------|
| Business Logic | ✅ Same | ✅ Same | None |
| Repository Interfaces | ✅ Same | ✅ Same | None |
| Google Adapters | ✅ Used | ⚪ Available | None |
| Postgres Adapters | ⚪ Local only | ✅ Production | Add tenant_id |
| S3 Adapter | ❌ Not built | ✅ Built | New adapter |
| Authentication | ❌ None | ✅ Required | New feature |
| Tenant Management | ❌ None | ✅ Required | New feature |

### **Key Principle**
> The V4 architecture is designed so that adding multi-tenant support is **additive**, not a rewrite. The business logic (voice processing, name matching, hours parsing) remains unchanged. Only the adapters and authentication layer need updates.

---

## **Next Steps**

1. ✅ **Review & Approve PRD** - Jayson confirms this scope and approach
2. **Initialize GitHub Repo** - Set up `sitelogix-v4` with folder structure
3. **Audit Existing Assets**:
   - Review .ENV file for all credentials
   - Test Roxy configuration locally
   - Verify Google Sheets/Drive access
4. **Configure Google Resources**:
   - Create 3 tabs in Parkway Reporting Database
   - Create 2 subfolders in Parkway Database Drive
   - Set up service account permissions
5. **Begin Phase 1**: Build PWA + 11Labs integration