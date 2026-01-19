/**
 * Lambda function to handle ElevenLabs post-call webhook
 *
 * Modes:
 * 1. Single conversation: POST with {status: "done", conversation_id: "..."}
 * 2. Batch processing: POST with {batch: true} - processes all recent unprocessed conversations
 *
 * Files are named: "Daily Report - DD-MMM-YY" (e.g., "Daily Report - 18-Jan-26")
 */

const { google } = require('googleapis');
const https = require('https');
const { Readable } = require('stream');

// Environment variables
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const GOOGLE_SHEETS_ID = process.env.GOOGLE_SHEETS_ID;
const GOOGLE_DRIVE_AUDIO_FOLDER = process.env.GOOGLE_DRIVE_AUDIO_FOLDER || '1QfnjfPbsGCJDSDH04o7nqwl0TiRosXD7';
const GOOGLE_DRIVE_TRANSCRIPTS_FOLDER = process.env.GOOGLE_DRIVE_TRANSCRIPTS_FOLDER || '1mTBMlD7ksiJSu9Qh-vnjjPB6hGIiaArf';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;

// Initialize Google Auth
function getGoogleAuth() {
  const oauth2Client = new google.auth.OAuth2(
    GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET
  );
  oauth2Client.setCredentials({
    refresh_token: GOOGLE_REFRESH_TOKEN
  });
  return oauth2Client;
}

/**
 * Format date as "DD-MMM-YY HHMMhrs" in Central Time (e.g., "18-Jan-26 1430hrs")
 */
function formatDateForFilename(date) {
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // Convert to Central Time
  const centralTime = new Date(date.toLocaleString('en-US', { timeZone: 'America/Chicago' }));

  const day = String(centralTime.getDate()).padStart(2, '0');
  const month = months[centralTime.getMonth()];
  const year = String(centralTime.getFullYear()).slice(-2);
  const hours = String(centralTime.getHours()).padStart(2, '0');
  const minutes = String(centralTime.getMinutes()).padStart(2, '0');

  return `${day}-${month}-${year} ${hours}${minutes}hrs`;
}

/**
 * Generate filename: "Daily Report DD-MMM-YY HHMMhrs" in Central Time
 * Example: "Daily Report 18-Jan-26 1430hrs.mp3"
 */
function generateFilename(date, extension, existingFiles = []) {
  const dateStr = formatDateForFilename(date);
  const baseName = `Daily Report ${dateStr}`;

  // Check if base name exists
  let filename = `${baseName}.${extension}`;
  let counter = 1;

  while (existingFiles.includes(filename)) {
    counter++;
    filename = `${baseName} (${counter}).${extension}`;
  }

  return filename;
}

// Fetch from ElevenLabs API
async function fetchFromElevenLabs(endpoint) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'api.elevenlabs.io',
      path: endpoint,
      method: 'GET',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
      },
    };

    const req = https.request(options, (response) => {
      if (response.statusCode === 302 || response.statusCode === 301) {
        fetchFromElevenLabs(response.headers.location).then(resolve).catch(reject);
        return;
      }

      const chunks = [];
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const buffer = Buffer.concat(chunks);
        resolve({ buffer, contentType: response.headers['content-type'], statusCode: response.statusCode });
      });
      response.on('error', reject);
    });

    req.on('error', reject);
    req.end();
  });
}

// List recent conversations from ElevenLabs
async function listRecentConversations(limit = 20) {
  const { buffer } = await fetchFromElevenLabs(`/v1/convai/conversations?page_size=${limit}`);
  const data = JSON.parse(buffer.toString());
  return data.conversations || [];
}

// Fetch conversation details from ElevenLabs
async function getConversationDetails(conversationId) {
  const { buffer } = await fetchFromElevenLabs(`/v1/convai/conversations/${conversationId}`);
  return JSON.parse(buffer.toString());
}

// Fetch audio from ElevenLabs
async function getConversationAudio(conversationId) {
  const { buffer, contentType, statusCode } = await fetchFromElevenLabs(`/v1/convai/conversations/${conversationId}/audio`);
  if (statusCode !== 200) {
    throw new Error(`Failed to fetch audio: ${statusCode}`);
  }
  return { buffer, contentType };
}

// List files in a Google Drive folder
async function listDriveFiles(auth, folderId) {
  const drive = google.drive({ version: 'v3', auth });
  const response = await drive.files.list({
    q: `'${folderId}' in parents and trashed = false`,
    fields: 'files(name)',
    pageSize: 100,
  });
  return (response.data.files || []).map(f => f.name);
}

// Upload file to Google Drive
async function uploadToDrive(auth, buffer, filename, folderId, mimeType) {
  const drive = google.drive({ version: 'v3', auth });

  const response = await drive.files.create({
    requestBody: {
      name: filename,
      parents: [folderId],
    },
    media: {
      mimeType,
      body: Readable.from(buffer),
    },
    fields: 'id, webViewLink',
  });

  // Make file shareable
  await drive.permissions.create({
    fileId: response.data.id,
    requestBody: {
      role: 'reader',
      type: 'anyone',
    },
  });

  return response.data.webViewLink || `https://drive.google.com/file/d/${response.data.id}/view`;
}

// Find recent report without files and update it
async function updateReportWithFiles(auth, audioUrl, transcriptUrl) {
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEETS_ID,
    range: "'Main Report Log'!A:Q",
  });

  const rows = response.data.values || [];
  if (rows.length <= 1) {
    console.log('No data rows found');
    return null;
  }

  // Find rows without audio/transcript grouped by Report ID
  const reportGroups = new Map();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const reportId = row[16]; // Column Q - Report ID
    const hasAudio = row[10]; // Column K
    const hasTranscript = row[11]; // Column L
    const timestamp = new Date(row[0]);

    if (!reportId) continue;

    if (!reportGroups.has(reportId)) {
      reportGroups.set(reportId, {
        timestamp,
        rowIndices: [],
        hasFiles: !!(hasAudio || hasTranscript),
      });
    }

    const group = reportGroups.get(reportId);
    group.rowIndices.push(i + 1);
    if (hasAudio || hasTranscript) {
      group.hasFiles = true;
    }
  }

  // Find most recent report without files
  let mostRecent = null;
  for (const [id, group] of reportGroups) {
    if (group.hasFiles) continue;
    if (!mostRecent || group.timestamp > mostRecent.timestamp) {
      mostRecent = { id, ...group };
    }
  }

  if (!mostRecent) {
    console.log('No report found without files');
    return null;
  }

  console.log(`Found report ${mostRecent.id} with ${mostRecent.rowIndices.length} rows`);

  // Update the rows with file URLs
  const updates = [];
  for (const rowIndex of mostRecent.rowIndices) {
    if (audioUrl) {
      updates.push({
        range: `'Main Report Log'!K${rowIndex}`,
        values: [[audioUrl]],
      });
    }
    if (transcriptUrl) {
      updates.push({
        range: `'Main Report Log'!L${rowIndex}`,
        values: [[transcriptUrl]],
      });
    }
  }

  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: GOOGLE_SHEETS_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: updates,
      },
    });
    console.log(`Updated ${mostRecent.rowIndices.length} rows with file URLs`);
  }

  return mostRecent.id;
}

// Get all reports without files
async function getReportsWithoutFiles(auth) {
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEETS_ID,
    range: "'Main Report Log'!A:Q",
  });

  const rows = response.data.values || [];
  if (rows.length <= 1) return [];

  const reportGroups = new Map();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const reportId = row[16];
    const hasAudio = row[10];
    const hasTranscript = row[11];

    // Parse timestamp - extract from report ID if date parsing fails
    // Report ID format: RPT-{timestamp_ms}
    let timestamp;
    try {
      timestamp = new Date(row[0]);
      if (isNaN(timestamp.getTime())) {
        // Try extracting from report ID
        const match = reportId?.match(/RPT-(\d+)/);
        if (match) {
          timestamp = new Date(parseInt(match[1]));
        }
      }
    } catch (e) {
      const match = reportId?.match(/RPT-(\d+)/);
      if (match) {
        timestamp = new Date(parseInt(match[1]));
      }
    }

    if (!reportId || !timestamp || isNaN(timestamp.getTime())) continue;

    if (!reportGroups.has(reportId)) {
      reportGroups.set(reportId, {
        timestamp,
        rowIndices: [],
        hasFiles: !!(hasAudio || hasTranscript),
      });
    }

    const group = reportGroups.get(reportId);
    group.rowIndices.push(i + 1);
    if (hasAudio || hasTranscript) {
      group.hasFiles = true;
    }
  }

  // Return reports without files, sorted by timestamp (oldest first)
  const reportsWithoutFiles = [];
  for (const [id, group] of reportGroups) {
    if (!group.hasFiles) {
      reportsWithoutFiles.push({ id, ...group });
    }
  }

  return reportsWithoutFiles.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());
}

// Update specific report with file URLs
async function updateSpecificReport(auth, reportId, rowIndices, audioUrl, transcriptUrl) {
  const sheets = google.sheets({ version: 'v4', auth });

  const updates = [];
  for (const rowIndex of rowIndices) {
    if (audioUrl) {
      updates.push({
        range: `'Main Report Log'!K${rowIndex}`,
        values: [[audioUrl]],
      });
    }
    if (transcriptUrl) {
      updates.push({
        range: `'Main Report Log'!L${rowIndex}`,
        values: [[transcriptUrl]],
      });
    }
  }

  if (updates.length > 0) {
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: GOOGLE_SHEETS_ID,
      requestBody: {
        valueInputOption: 'USER_ENTERED',
        data: updates,
      },
    });
  }
}

// Format transcript
function formatTranscript(transcript) {
  if (!transcript || transcript.length === 0) return '';

  return transcript.map((entry) => {
    const role = entry.role === 'agent' ? 'Roxy' : 'User';
    const time = entry.time_in_call_secs
      ? ` [${Math.floor(entry.time_in_call_secs / 60)}:${String(Math.floor(entry.time_in_call_secs % 60)).padStart(2, '0')}]`
      : '';
    return `${role}${time}: ${entry.message}`;
  }).join('\n');
}

// Process a single conversation
async function processConversation(auth, conversationId, conversationDate, existingAudioFiles, existingTranscriptFiles) {
  let audioUrl = null;
  let transcriptUrl = null;

  // Fetch and upload audio
  try {
    console.log(`Fetching audio for ${conversationId}...`);
    const { buffer: audioBuffer } = await getConversationAudio(conversationId);
    console.log(`Downloaded audio, size: ${audioBuffer.length}`);

    if (audioBuffer.length > 0) {
      const audioFilename = generateFilename(conversationDate, 'mp3', existingAudioFiles);
      audioUrl = await uploadToDrive(auth, audioBuffer, audioFilename, GOOGLE_DRIVE_AUDIO_FOLDER, 'audio/mpeg');
      existingAudioFiles.push(audioFilename); // Track for duplicates
      console.log(`Uploaded audio: ${audioFilename}`);
    }
  } catch (error) {
    console.log(`Failed to fetch audio for ${conversationId}:`, error.message);
  }

  // Fetch and upload transcript
  try {
    console.log(`Fetching transcript for ${conversationId}...`);
    const details = await getConversationDetails(conversationId);

    if (details.transcript && details.transcript.length > 0) {
      const transcriptText = formatTranscript(details.transcript);
      const transcriptBuffer = Buffer.from(transcriptText, 'utf-8');
      const transcriptFilename = generateFilename(conversationDate, 'txt', existingTranscriptFiles);
      transcriptUrl = await uploadToDrive(auth, transcriptBuffer, transcriptFilename, GOOGLE_DRIVE_TRANSCRIPTS_FOLDER, 'text/plain');
      existingTranscriptFiles.push(transcriptFilename); // Track for duplicates
      console.log(`Uploaded transcript: ${transcriptFilename}`);
    }
  } catch (error) {
    console.log(`Failed to fetch transcript for ${conversationId}:`, error.message);
  }

  return { audioUrl, transcriptUrl };
}

// Batch process: match conversations to reports by timestamp
async function batchProcess(auth) {
  console.log('Starting batch processing...');

  // Get reports without files
  const reportsWithoutFiles = await getReportsWithoutFiles(auth);
  console.log(`Found ${reportsWithoutFiles.length} reports without files`);

  if (reportsWithoutFiles.length === 0) {
    return { processed: 0, message: 'No reports without files found' };
  }

  // Get recent conversations from ElevenLabs
  const conversations = await listRecentConversations(50);
  console.log(`Found ${conversations.length} recent conversations`);

  // Get existing files in Drive folders
  const existingAudioFiles = await listDriveFiles(auth, GOOGLE_DRIVE_AUDIO_FOLDER);
  const existingTranscriptFiles = await listDriveFiles(auth, GOOGLE_DRIVE_TRANSCRIPTS_FOLDER);

  let processed = 0;
  const results = [];
  const usedConversations = new Set();

  // Match conversations to reports by timestamp
  // Report timestamp is END of call, conversation start_time is START of call
  // So: reportTime should be approximately (convStartTime + callDuration)
  for (const report of reportsWithoutFiles) {
    const reportTime = report.timestamp.getTime();
    console.log(`Report ${report.id} timestamp: ${report.timestamp.toISOString()} (${reportTime})`);

    // Find best matching conversation
    let bestMatch = null;
    let bestDiff = Infinity;

    for (const conv of conversations) {
      if (conv.status !== 'done') continue;
      if (usedConversations.has(conv.conversation_id)) continue;

      const convStartTime = conv.start_time_unix_secs * 1000;
      const convEndTime = convStartTime + (conv.call_duration_secs * 1000);

      // Report should be submitted shortly after call ends (within 5 minutes)
      // So reportTime should be between convEndTime and convEndTime + 5 min
      const diff = reportTime - convEndTime;

      console.log(`  Checking conv ${conv.conversation_id}: start=${new Date(convStartTime).toISOString()}, end=${new Date(convEndTime).toISOString()}, diff=${diff/1000}s`);

      // Match if report was submitted 0-5 minutes after call ended
      if (diff >= -60000 && diff < 5 * 60 * 1000 && Math.abs(diff) < bestDiff) {
        bestDiff = Math.abs(diff);
        bestMatch = conv;
      }
    }

    if (bestMatch) {
      console.log(`Matched report ${report.id} to conversation ${bestMatch.conversation_id} (diff: ${bestDiff/1000}s)`);
      usedConversations.add(bestMatch.conversation_id);

      const convDate = new Date(bestMatch.start_time_unix_secs * 1000);
      const { audioUrl, transcriptUrl } = await processConversation(
        auth,
        bestMatch.conversation_id,
        convDate,
        existingAudioFiles,
        existingTranscriptFiles
      );

      if (audioUrl || transcriptUrl) {
        await updateSpecificReport(auth, report.id, report.rowIndices, audioUrl, transcriptUrl);
        processed++;
        results.push({
          reportId: report.id,
          conversationId: bestMatch.conversation_id,
          audioUploaded: !!audioUrl,
          transcriptUploaded: !!transcriptUrl,
        });
      }
    } else {
      console.log(`No matching conversation found for report ${report.id}`);
    }
  }

  return { processed, results };
}

// Main handler
exports.handler = async (event) => {
  console.log('Received event:', JSON.stringify(event, null, 2));

  try {
    const body = typeof event.body === 'string' ? JSON.parse(event.body) : (event.body || {});
    const auth = getGoogleAuth();

    // Batch mode
    if (body.batch === true) {
      console.log('Batch mode requested');
      const result = await batchProcess(auth);
      return {
        statusCode: 200,
        body: JSON.stringify({
          success: true,
          mode: 'batch',
          ...result,
        }),
      };
    }

    // Single conversation mode
    console.log('Parsed body:', JSON.stringify({
      conversation_id: body.conversation_id,
      status: body.status,
    }));

    if (body.status !== 'done') {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, message: `Status: ${body.status}` }),
      };
    }

    if (!body.conversation_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'Missing conversation_id' }),
      };
    }

    // Get conversation date
    let conversationDate = new Date();
    try {
      const details = await getConversationDetails(body.conversation_id);
      if (details.start_time_unix_secs) {
        conversationDate = new Date(details.start_time_unix_secs * 1000);
      }
    } catch (e) {
      console.log('Could not fetch conversation details for date, using current date');
    }

    // Get existing files
    const existingAudioFiles = await listDriveFiles(auth, GOOGLE_DRIVE_AUDIO_FOLDER);
    const existingTranscriptFiles = await listDriveFiles(auth, GOOGLE_DRIVE_TRANSCRIPTS_FOLDER);

    const { audioUrl, transcriptUrl } = await processConversation(
      auth,
      body.conversation_id,
      conversationDate,
      existingAudioFiles,
      existingTranscriptFiles
    );

    // Update Google Sheet
    if (audioUrl || transcriptUrl) {
      const reportId = await updateReportWithFiles(auth, audioUrl, transcriptUrl);
      console.log('Updated report:', reportId);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        conversation_id: body.conversation_id,
        audio_uploaded: !!audioUrl,
        transcript_uploaded: !!transcriptUrl,
      }),
    };
  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message }),
    };
  }
};
