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

export interface DailyReport {
  id?: string
  submittedAt: Date
  timezone: string
  jobSite?: string
  employees: EmployeeHours[]
  deliveries?: string
  incidents?: string
  shortages?: string
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
 */
export interface RoxyWebhookData {
  jobSite?: string
  employees: Array<{
    name: string
    regularHours: number
    overtimeHours: number
  }>
  deliveries?: string
  incidents?: string
  shortages?: string
  timestamp: string
  audioUrl?: string
  transcript?: string
}
