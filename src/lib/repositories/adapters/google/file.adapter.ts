/**
 * Google Drive File Repository Adapter
 *
 * Implements FileRepository interface using Google Drive API.
 * Uploads files to specific Parkway Database subfolders.
 */

import { Readable } from 'stream'
import type { FileRepository } from '../../types'
import { getDriveClient, getGoogleConfig } from './auth'

export class GoogleDriveFileRepository implements FileRepository {
  private drive = getDriveClient()
  private audioFolderId: string
  private transcriptsFolderId: string

  constructor(tenantId: string = 'parkway') {
    const config = getGoogleConfig(tenantId)
    this.audioFolderId = config.DRIVE_FOLDERS.AUDIO
    this.transcriptsFolderId = config.DRIVE_FOLDERS.TRANSCRIPTS
  }

  /**
   * Upload audio buffer to Google Drive
   */
  async uploadAudio(buffer: Buffer, filename: string): Promise<string> {
    const folderId = this.audioFolderId

    const response = await this.drive.files.create({
      requestBody: {
        name: filename,
        parents: [folderId],
      },
      media: {
        mimeType: 'audio/mpeg',
        body: Readable.from(buffer),
      },
      fields: 'id, webViewLink',
    })

    // Make file shareable via link
    await this.drive.permissions.create({
      fileId: response.data.id!,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    })

    return response.data.webViewLink || `https://drive.google.com/file/d/${response.data.id}/view`
  }

  /**
   * Download audio from a URL and upload to Google Drive
   */
  async uploadAudioFromUrl(url: string, filename: string): Promise<string> {
    console.log('[FileAdapter] Downloading audio from:', url)

    // Download the audio file from ElevenLabs
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`Failed to download audio: ${response.status} ${response.statusText}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    console.log('[FileAdapter] Downloaded audio, size:', buffer.length, 'bytes')

    // Upload to Google Drive
    return this.uploadAudio(buffer, filename)
  }

  /**
   * Upload transcript content to Google Drive
   */
  async uploadTranscript(content: string, filename: string): Promise<string> {
    const folderId = this.transcriptsFolderId

    const response = await this.drive.files.create({
      requestBody: {
        name: filename,
        parents: [folderId],
      },
      media: {
        mimeType: filename.endsWith('.json') ? 'application/json' : 'text/plain',
        body: Readable.from(Buffer.from(content, 'utf-8')),
      },
      fields: 'id, webViewLink',
    })

    // Make file shareable via link
    await this.drive.permissions.create({
      fileId: response.data.id!,
      requestBody: {
        role: 'reader',
        type: 'anyone',
      },
    })

    return response.data.webViewLink || `https://drive.google.com/file/d/${response.data.id}/view`
  }

  async getPublicUrl(fileId: string): Promise<string> {
    const response = await this.drive.files.get({
      fileId,
      fields: 'webViewLink',
    })

    return response.data.webViewLink || `https://drive.google.com/file/d/${fileId}/view`
  }

  async deleteFile(fileId: string): Promise<void> {
    try {
      await this.drive.files.delete({
        fileId,
      })
    } catch (error) {
      console.warn(`Could not delete file: ${fileId}`, error)
    }
  }
}
