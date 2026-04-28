export interface TenantConfig {
  id: string
  name: string
  slug: string
  logo: string
  primaryColor: string
  accentColor: string
  googleSheetsId: string
  googleDriveFolderId: string
  googleDriveAudioFolderId: string
  googleDriveTranscriptsFolderId: string
  elevenLabsAgentId: string
  adminEmails: string[]
  sesFromEmail: string
  sesToEmails: string[]
  timezone: string
}
