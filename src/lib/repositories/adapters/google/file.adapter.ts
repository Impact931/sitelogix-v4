/**
 * Google Drive File Repository Adapter
 *
 * Implements FileRepository interface using Google Drive API.
 * Uploads files to Parkway Database folder structure.
 */

import { Readable } from 'stream'
import type { FileRepository } from '../../types'
import { getDriveClient, GOOGLE_CONFIG } from './auth'

export class GoogleDriveFileRepository implements FileRepository {
  private drive = getDriveClient()
  private parentFolderId = GOOGLE_CONFIG.DRIVE_FOLDER_ID

  // Cache subfolder IDs to avoid repeated lookups
  private subfolderIds: Map<string, string> = new Map()

  /**
   * Get or create a subfolder within the parent folder
   */
  private async getSubfolderId(folderName: string): Promise<string> {
    // Check cache first
    if (this.subfolderIds.has(folderName)) {
      return this.subfolderIds.get(folderName)!
    }

    // Search for existing folder
    const response = await this.drive.files.list({
      q: `name='${folderName}' and '${this.parentFolderId}' in parents and mimeType='application/vnd.google-apps.folder' and trashed=false`,
      fields: 'files(id, name)',
    })

    if (response.data.files && response.data.files.length > 0) {
      const folderId = response.data.files[0].id!
      this.subfolderIds.set(folderName, folderId)
      return folderId
    }

    // Create folder if it doesn't exist
    const createResponse = await this.drive.files.create({
      requestBody: {
        name: folderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [this.parentFolderId],
      },
      fields: 'id',
    })

    const newFolderId = createResponse.data.id!
    this.subfolderIds.set(folderName, newFolderId)
    return newFolderId
  }

  async uploadAudio(buffer: Buffer, filename: string): Promise<string> {
    const folderId = await this.getSubfolderId(GOOGLE_CONFIG.DRIVE_SUBFOLDERS.AUDIO)

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

  async uploadTranscript(content: string, filename: string): Promise<string> {
    const folderId = await this.getSubfolderId(GOOGLE_CONFIG.DRIVE_SUBFOLDERS.TRANSCRIPTS)

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
