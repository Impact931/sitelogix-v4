import type { TenantConfig } from './types'

const TENANTS: Record<string, TenantConfig> = {
  parkway: {
    id: 'parkway',
    name: 'Parkway Construction Services',
    slug: 'parkway',
    logo: '/tenants/parkway/logo.png',
    primaryColor: '#eab308',
    accentColor: '#1e3a5f',
    googleSheetsId: process.env.GOOGLE_SHEETS_ID || '1lb8nmFjvKdWmoqSLaowEKWEzGzNUPw7CuTTZ7k1FIg4',
    googleDriveFolderId: process.env.GOOGLE_DRIVE_FOLDER_ID || '1UFwgLhlBdgdK8As2EmzW-nHNreHsYeqm',
    googleDriveAudioFolderId: process.env.GOOGLE_DRIVE_AUDIO_FOLDER_ID || '1QfnjfPbsGCJDSDH04o7nqwl0TiRosXD7',
    googleDriveTranscriptsFolderId: process.env.GOOGLE_DRIVE_TRANSCRIPTS_FOLDER_ID || '1mTBMlD7ksiJSu9Qh-vnjjPB6hGIiaArf',
    elevenLabsAgentId: process.env.ELEVEN_LABS_AGENT_ID || 'agent_5101k6atqv7gezstbzcpvdqhvmgh',
    adminEmails: ['jayson@jhr-photography.com'],
    sesFromEmail: process.env.SES_FROM_EMAIL || 'jayson@impactconsulting931.com',
    sesToEmails: (process.env.SES_TO_EMAILS || 'jayson@jhr-photography.com').split(','),
    timezone: 'America/New_York',
  },
  jrconstruction: {
    id: 'jrconstruction',
    name: 'JR Construction Co',
    slug: 'jrconstruction',
    logo: '/tenants/jrconstruction/logo.png',
    primaryColor: '#2563eb',
    accentColor: '#1e293b',
    googleSheetsId: process.env.JR_CONSTRUCTION_SHEETS_ID || '',
    googleDriveFolderId: process.env.JR_CONSTRUCTION_DRIVE_FOLDER_ID || '',
    googleDriveAudioFolderId: process.env.JR_CONSTRUCTION_DRIVE_AUDIO_FOLDER_ID || '',
    googleDriveTranscriptsFolderId: process.env.JR_CONSTRUCTION_DRIVE_TRANSCRIPTS_FOLDER_ID || '',
    elevenLabsAgentId: process.env.ELEVEN_LABS_AGENT_ID || 'agent_5101k6atqv7gezstbzcpvdqhvmgh',
    adminEmails: ['jayson@jhr-photography.com'],
    sesFromEmail: process.env.SES_FROM_EMAIL || 'jayson@impactconsulting931.com',
    sesToEmails: (process.env.SES_TO_EMAILS || 'jayson@jhr-photography.com').split(','),
    timezone: 'America/Chicago',
  },
}

export function getTenantConfig(slug: string): TenantConfig | null {
  return TENANTS[slug] || null
}

export function getAllTenants(): TenantConfig[] {
  return Object.values(TENANTS)
}

export function getTenantSlugs(): string[] {
  return Object.keys(TENANTS)
}
