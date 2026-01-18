/**
 * Local File Repository Adapter
 *
 * Implements FileRepository interface using local filesystem.
 * Used for local development - files are stored in ./uploads directory.
 */

import { promises as fs } from 'fs'
import path from 'path'
import type { FileRepository } from '../../types'

const UPLOAD_DIR = process.env.LOCAL_UPLOAD_DIR || './uploads'

export class LocalFileRepository implements FileRepository {
  private audioDir: string
  private transcriptDir: string

  constructor() {
    this.audioDir = path.join(UPLOAD_DIR, 'audio')
    this.transcriptDir = path.join(UPLOAD_DIR, 'transcripts')
  }

  /**
   * Ensure upload directories exist
   */
  private async ensureDirs(): Promise<void> {
    await fs.mkdir(this.audioDir, { recursive: true })
    await fs.mkdir(this.transcriptDir, { recursive: true })
  }

  async uploadAudio(buffer: Buffer, filename: string): Promise<string> {
    await this.ensureDirs()

    const filepath = path.join(this.audioDir, filename)
    await fs.writeFile(filepath, buffer)

    // Return a local URL that can be served by Next.js
    return `/uploads/audio/${filename}`
  }

  async uploadTranscript(content: string, filename: string): Promise<string> {
    await this.ensureDirs()

    const filepath = path.join(this.transcriptDir, filename)
    await fs.writeFile(filepath, content, 'utf-8')

    // Return a local URL that can be served by Next.js
    return `/uploads/transcripts/${filename}`
  }

  async getPublicUrl(fileId: string): Promise<string> {
    // For local files, the fileId is already a path
    return fileId
  }

  async deleteFile(fileId: string): Promise<void> {
    // Convert URL to filepath
    const filepath = path.join(UPLOAD_DIR, fileId.replace('/uploads/', ''))

    try {
      await fs.unlink(filepath)
    } catch (error) {
      // File might not exist, ignore
      console.warn(`Could not delete file: ${filepath}`, error)
    }
  }
}
