/**
 * SiteLogix-v4 Repository Pattern Type Definitions
 *
 * These interfaces define the contract for data operations.
 * Business logic uses these interfaces, not specific implementations.
 * Adapters (Google Sheets, PostgreSQL) implement these interfaces.
 */

// ============================================
// ENTITY TYPES
// ============================================

export interface Employee {
  id: string
  name: string
  active: boolean
  createdAt?: Date
  updatedAt?: Date
}

export interface EmployeeHours {
  employeeId?: string
  name: string              // Original name from voice input
  normalizedName: string    // Name after fuzzy matching
  regularHours: number
  overtimeHours: number
  totalHours: number
}

export interface Delivery {
  vendorId?: string
  vendor: string            // Original vendor name from voice
  normalizedVendor: string  // Vendor name after fuzzy matching
  material: string
  quantity?: string
  notes?: string
}

export interface Equipment {
  name: string
  hours?: number
  notes?: string
}

export interface Subcontractor {
  subcontractorId?: string
  company: string           // Original company name from voice
  normalizedCompany: string // Company name after fuzzy matching
  trade?: string
  headcount?: number
  workPerformed?: string
}

export interface SafetyEntry {
  type: 'incident' | 'near_miss' | 'hazard' | 'positive'
  description: string
  actionTaken?: string
}

export interface DelayEntry {
  reason: string
  duration?: string
  impact?: string
}

export interface WorkEntry {
  description: string
  area?: string
}

export interface DailyReport {
  id?: string
  submittedAt: Date
  timezone: string
  jobSite?: string

  // People
  employees: EmployeeHours[]
  subcontractors?: Subcontractor[]

  // Materials & Equipment
  deliveries?: Delivery[]
  equipment?: Equipment[]
  shortages?: string

  // Conditions
  weatherConditions?: string
  weatherImpact?: string

  // Safety & Issues
  safety?: SafetyEntry[]
  delays?: DelayEntry[]

  // Work Summary
  workPerformed?: WorkEntry[]
  notes?: string

  // File references
  audioUrl?: string
  transcriptUrl?: string

  createdAt?: Date
  updatedAt?: Date
}

// ============================================
// REPOSITORY INTERFACES
// ============================================

/**
 * Employee Repository Interface
 * Handles employee reference data operations
 */
export interface EmployeeRepository {
  /**
   * Get all active employees
   */
  getAllActive(): Promise<Employee[]>

  /**
   * Get all employees (including inactive)
   */
  getAll(): Promise<Employee[]>

  /**
   * Find employee by exact name match
   */
  findByName(name: string): Promise<Employee | null>

  /**
   * Find employee using fuzzy matching
   * @param name - The name to search for
   * @param threshold - Similarity threshold (0-1, default 0.6)
   */
  fuzzyMatch(name: string, threshold?: number): Promise<Employee | null>

  /**
   * Create a new employee
   */
  create(employee: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>): Promise<Employee>

  /**
   * Update an employee
   */
  update(id: string, data: Partial<Employee>): Promise<Employee>
}

/**
 * Report Repository Interface
 * Handles daily report operations
 */
export interface ReportRepository {
  /**
   * Save a new daily report
   * @returns The ID of the created report
   */
  saveReport(report: Omit<DailyReport, 'id' | 'createdAt' | 'updatedAt'>): Promise<string>

  /**
   * Get a report by ID
   */
  getReportById(id: string): Promise<DailyReport | null>

  /**
   * Get reports within a date range
   */
  getReportsByDateRange(start: Date, end: Date): Promise<DailyReport[]>

  /**
   * Get the most recent reports
   * @param limit - Maximum number of reports to return
   */
  getRecentReports(limit?: number): Promise<DailyReport[]>

  /**
   * Update file URLs for a report (after upload)
   */
  updateFileUrls(id: string, audioUrl?: string, transcriptUrl?: string): Promise<void>
}

/**
 * File Repository Interface
 * Handles audio and transcript file storage
 */
export interface FileRepository {
  /**
   * Upload an audio file
   * @param buffer - The file content
   * @param filename - The filename to use
   * @returns The public URL of the uploaded file
   */
  uploadAudio(buffer: Buffer, filename: string): Promise<string>

  /**
   * Download audio from a URL and upload to storage
   * @param url - The URL to download from (e.g., ElevenLabs recording URL)
   * @param filename - The filename to use
   * @returns The public URL of the uploaded file
   */
  uploadAudioFromUrl(url: string, filename: string): Promise<string>

  /**
   * Upload a transcript file
   * @param content - The transcript content (JSON or text)
   * @param filename - The filename to use
   * @returns The public URL of the uploaded file
   */
  uploadTranscript(content: string, filename: string): Promise<string>

  /**
   * Get a public URL for a file
   */
  getPublicUrl(fileId: string): Promise<string>

  /**
   * Delete a file
   */
  deleteFile(fileId: string): Promise<void>
}

// ============================================
// ADAPTER TYPES
// ============================================

export type DataAdapterType = 'postgres' | 'google'
export type FileAdapterType = 'local' | 'google' | 's3'

export interface AdapterConfig {
  dataAdapter: DataAdapterType
  fileAdapter: FileAdapterType
}

// ============================================
// UTILITY TYPES
// ============================================

export interface FuzzyMatchResult {
  employee: Employee
  score: number  // 0-1, higher is better match
}

/**
 * Result from ElevenLabs webhook containing parsed conversation data
 * This matches the submit_daily_report tool schema in ElevenLabs
 */
export interface RoxyWebhookData {
  job_site?: string
  employees: Array<{
    name: string
    regular_hours: number
    overtime_hours: number
  }>
  deliveries?: Array<{
    vendor: string
    material: string
    quantity?: string
    notes?: string
  }>
  equipment?: Array<{
    name: string
    hours?: number
    notes?: string
  }>
  subcontractors?: Array<{
    company: string
    trade?: string
    headcount?: number
    work_performed?: string
  }>
  weather_conditions?: string
  weather_impact?: string
  safety?: Array<{
    type: string
    description: string
    action_taken?: string
  }>
  delays?: Array<{
    reason: string
    duration?: string
    impact?: string
  }>
  work_performed?: Array<{
    description: string
    area?: string
  }>
  shortages?: string
  notes?: string
  // Metadata added by our system
  timestamp?: string
  audioUrl?: string
  transcript?: string
}

/**
 * ElevenLabs Post-Call Webhook Payload
 * Sent after a conversation ends with transcript and audio data
 *
 * Note: ElevenLabs sends webhooks in a wrapped format:
 * {
 *   type: 'post_call_transcription' | 'post_call_audio',
 *   event_timestamp: number,
 *   data: ElevenLabsPostCallPayload | { conversation_id, audio_data }
 * }
 */
export interface ElevenLabsPostCallPayload {
  conversation_id: string
  agent_id: string
  call_duration_secs?: number
  status: 'done' | 'failed' | 'timeout'
  transcript?: ElevenLabsTranscriptEntry[]
  metadata?: {
    start_time_unix_secs?: number
    call_duration_secs?: number
    [key: string]: unknown
  }
  analysis?: {
    call_successful?: string
    transcript_summary?: string
    evaluation_criteria_results?: Record<string, unknown>
    data_collection_results?: Record<string, unknown>
  }
  // Audio URL is only included if send_audio is enabled (old format)
  recording_url?: string
  // User ID if provided in conversation initiation
  user_id?: string
}

export interface ElevenLabsTranscriptEntry {
  role: 'user' | 'agent'
  message: string
  time_in_call_secs?: number
}
