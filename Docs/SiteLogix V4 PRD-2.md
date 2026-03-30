# **SiteLogix-v4: Comprehensive Product Requirements Document (PRD)**

## **1. Vision & Goals**
The objective of SiteLogix-v4 is to replace fragmented, manual construction reporting with a **voice-first, automated data pipeline**. The system must capture field data via natural conversation and distribute it into two distinct formats: a structured, high-performance database for administrators and a familiar spreadsheet for payroll processing.

**Success is defined by the "Flawless Ten-Step" scenario:**
A field manager initiates a call, completes a report via voice, and within seconds, the data is accurately mirrored in an Admin Dashboard and a Bookkeeper’s Google Sheet with zero manual entry.

---

## **2. End-User Personas & Functional Requirements**

### **Persona A: The Field Manager (The Submitter)**
* **Context**: Working on a loud, active job site; needs a "hands-busy, eyes-busy" solution.
* **Requirement**: A single-screen PWA with a "one-touch" interface to trigger the AI voice agent (Roxy).
* **Requirement**: Must function in a "standalone" mobile mode without browser chrome.
* **Condition**: The user must receive a verbal summary of their report for confirmation before the system finalizes the submission.

### **Persona B: The Administrator (The Auditor)**
* **Context**: Needs to oversee multiple sites, track trends, and verify the accuracy of AI transcriptions.
* **Requirement**: A secure, authenticated web portal to view a real-time feed of all reports.
* **Requirement**: Access to the **full text transcript** of every conversation to audit Roxy’s data parsing.
* **Requirement**: High-level summaries and statistics (e.g., total man-hours, frequency of incidents, or material shortages).

### **Persona C: The Bookkeeper (The Processor)**
* **Context**: Needs clean, standardized data for payroll software entry.
* **Requirement**: Data delivered via a specific Google Sheet structure.
* **Requirement**: Every employee name must be **normalized**—matched against a master reference list—to ensure entries are consistent regardless of how the manager says the name.
* **Requirement**: Automated separation of "Regular Hours" and "Overtime Hours" as interpreted from the voice conversation.

---

## **3. Technical Architecture & Data Strategy**

### **3.1. Data Persistence (The Mirror Model)**
The system must utilize a **Dual-Persistence Architecture**. Every successful submission must be written to two locations simultaneously to satisfy the needs of all users:
1.  **System of Record (DynamoDB)**: A NoSQL database designed for the Admin Dashboard. This must store the rich payload, including the full conversation transcript and raw metadata.
2.  **User Mirror (Google Sheets)**: A flattened version of the data for the Bookkeeper, containing only the finalized payroll figures and direct links to storage.

### **3.2. Voice-to-Data Pipeline**
* **Webhook Ingestion**: The system must expose a secure endpoint to receive structured JSON from the voice provider.
* **Normalization Engine**: A logic layer must exist between the webhook and the databases to perform fuzzy matching on employee names and parse complex hour statements (e.g., "Everyone worked 8, but Corey worked 10").
* **Storage**: Audio recordings and text transcripts must be stored in organized, sortable folders within Google Drive with shareable links generated for the databases.

---

## **4. Conditions for Success (Operational Requirements)**

### **4.1. Reliability & Accuracy**
* **Data Integrity**: 100% of audio and transcript files must be successfully linked to their corresponding database entries.
* **Name Accuracy**: 95% of reports must require zero manual correction by the bookkeeper due to the normalization engine.
* **Latency**: Data must appear in the Admin Dashboard within 5 seconds of the conversation concluding.

### **4.2. Security & Access**
* **Field Access**: Must be shareable via a simple URL for ease of installation but protected by technical obfuscation or unique identifiers to prevent unauthorized use.
* **Admin Access**: The backend dashboard must be protected by a modern authentication layer (e.g., RBAC) to ensure only authorized personnel view payroll and site details.

### **4.3. Communication**
* **Notification Trigger**: An automated email (via AWS SES) must be sent to the bookkeeper and managers - only after the data has been successfully confirmed in both the database and the spreadsheet.
* **Email Content**: email will notifiy key personnel that new reports are submitted - There should be a link to the current Google Sheet. as well as a button to view the Admin access of the Dashboard.

---

## **5. Out of Scope for v4**
* Direct integration with accounting software (QuickBooks/Sage).
* Offline mode for voice reporting.
* Historical report editing by field managers.

---

## **6. Final Acceptance Criteria for Development**
The development team has succeeded when an administrator can log into the dashboard, read a transcript of a manager’s report, and simultaneously see a perfectly formatted, correctly-named row in the payroll spreadsheet reflecting that exact data.