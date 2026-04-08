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
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');

// Environment variables
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;
const GOOGLE_REFRESH_TOKEN = process.env.GOOGLE_REFRESH_TOKEN;
const GOOGLE_SHEETS_ID = process.env.GOOGLE_SHEETS_ID;
const GOOGLE_DRIVE_AUDIO_FOLDER = process.env.GOOGLE_DRIVE_AUDIO_FOLDER || '1QfnjfPbsGCJDSDH04o7nqwl0TiRosXD7';
const GOOGLE_DRIVE_TRANSCRIPTS_FOLDER = process.env.GOOGLE_DRIVE_TRANSCRIPTS_FOLDER || '1mTBMlD7ksiJSu9Qh-vnjjPB6hGIiaArf';
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
const DYNAMODB_TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'sitelogix-v4-reports';

// DynamoDB client
const dynamoClient = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: 'us-east-1' }),
  { marshallOptions: { removeUndefinedValues: true } }
);

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
    range: "'Main Report Log'!A:S",
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
    const reportId = row[12]; // Column Q - Report ID
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
    range: "'Main Report Log'!A:S",
  });

  const rows = response.data.values || [];
  if (rows.length <= 1) return [];

  const reportGroups = new Map();

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const reportId = row[12];
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

        // Sync to DynamoDB
        try {
          const convDetails = await getConversationDetails(bestMatch.conversation_id);
          const transcript = convDetails.transcript || [];
          const transcriptText = formatTranscript(transcript);
          const callDurationSecs = convDetails.metadata?.call_duration_secs || convDetails.call_duration_secs || null;
          const reportData = await getRecentReportData(auth, report.id);
          const transcriptReportData = extractReportDataFromTranscript(transcript);
          await writeToDynamoDB(report.id, bestMatch.conversation_id, transcript, transcriptText, audioUrl, transcriptUrl, callDurationSecs, reportData, transcriptReportData);
        } catch (dynamoErr) {
          console.error(`[DynamoDB] Batch sync failed for ${report.id}:`, dynamoErr.message);
        }

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

// Write/update report in DynamoDB with transcript and file URLs
async function writeToDynamoDB(reportId, conversationId, transcript, transcriptText, audioUrl, transcriptUrl, callDurationSecs, reportData, transcriptReportData) {
  const now = new Date().toISOString();

  // Try to find existing report by looking at recent items
  const existing = await dynamoClient.send(new QueryCommand({
    TableName: DYNAMODB_TABLE_NAME,
    IndexName: 'byDate',
    KeyConditionExpression: 'entityType = :et',
    ExpressionAttributeValues: { ':et': 'REPORT' },
    ScanIndexForward: false,
    Limit: 5,
  }));

  // Check if this reportId already exists
  const existingItem = (existing.Items || []).find(i => i.reportId === reportId);

  if (existingItem) {
    // Update existing report with transcript + files + structured data
    const rd = transcriptReportData || {};
    const employees = reportData?.employees || existingItem.employees || [];
    const summary = generateReportSummary(rd, employees, callDurationSecs);

    const updates = ['#updatedAt = :now'];
    const names = { '#updatedAt': 'updatedAt' };
    const values = { ':now': now };

    // Helper to add field to update expression
    const addField = (field, value) => {
      if (value !== undefined && value !== null) {
        const placeholder = `:${field}`;
        const nameKey = `#${field}`;
        updates.push(`${nameKey} = ${placeholder}`);
        names[nameKey] = field;
        values[placeholder] = value;
      }
    };

    addField('transcript', transcript);
    addField('transcriptText', transcriptText);
    addField('audioUrl', audioUrl);
    addField('transcriptUrl', transcriptUrl);
    addField('conversationId', conversationId);
    addField('callDurationSecs', callDurationSecs);
    addField('summary', summary);

    // Structured report fields from transcript tool call
    if (rd.workPerformed?.length) addField('workPerformed', rd.workPerformed);
    if (rd.deliveries?.length) addField('deliveries', rd.deliveries);
    if (rd.equipment?.length) addField('equipment', rd.equipment);
    if (rd.safety?.length) addField('safety', rd.safety);
    if (rd.delays?.length) addField('delays', rd.delays);
    if (rd.subcontractors?.length) addField('subcontractors', rd.subcontractors);
    if (rd.weatherConditions) addField('weatherConditions', rd.weatherConditions);
    if (rd.weatherImpact) addField('weatherImpact', rd.weatherImpact);
    if (rd.shortages || reportData?.shortages) addField('shortages', rd.shortages || reportData.shortages);
    if (rd.notes || reportData?.notes) addField('notes', rd.notes || reportData.notes);

    await dynamoClient.send(new UpdateCommand({
      TableName: DYNAMODB_TABLE_NAME,
      Key: { reportId },
      UpdateExpression: `SET ${updates.join(', ')}`,
      ExpressionAttributeNames: names,
      ExpressionAttributeValues: values,
    }));
    console.log(`[DynamoDB] Updated report: ${reportId}`);
  } else {
    // Merge data: transcript tool call data is richest, fall back to Sheets data
    const rd = transcriptReportData || {};
    const employees = reportData?.employees || [];
    const summary = generateReportSummary(rd, employees, callDurationSecs);

    const item = {
      reportId,
      entityType: 'REPORT',
      submittedAt: now,
      jobSite: rd.jobSite || reportData?.jobSite || 'Unknown',
      timezone: 'America/New_York',
      employees,
      // Structured fields from transcript tool call
      workPerformed: rd.workPerformed?.length ? rd.workPerformed : undefined,
      deliveries: rd.deliveries?.length ? rd.deliveries : undefined,
      equipment: rd.equipment?.length ? rd.equipment : undefined,
      safety: rd.safety?.length ? rd.safety : undefined,
      delays: rd.delays?.length ? rd.delays : undefined,
      subcontractors: rd.subcontractors?.length ? rd.subcontractors : undefined,
      weatherConditions: rd.weatherConditions || reportData?.weatherConditions || undefined,
      weatherImpact: rd.weatherImpact || undefined,
      shortages: rd.shortages || reportData?.shortages || undefined,
      notes: rd.notes || reportData?.notes || undefined,
      summary,
      // Files & transcript
      transcript,
      transcriptText,
      audioUrl,
      transcriptUrl,
      conversationId,
      callDurationSecs,
      createdAt: now,
      updatedAt: now,
    };

    // Remove undefined values (DynamoDB doesn't like them)
    Object.keys(item).forEach(k => { if (item[k] === undefined) delete item[k]; });

    await dynamoClient.send(new PutCommand({
      TableName: DYNAMODB_TABLE_NAME,
      Item: item,
    }));
    console.log(`[DynamoDB] Created report: ${reportId}`);
  }
}

// Load employee roster from Google Sheets for name matching
async function loadEmployeeRoster(auth) {
  const sheets = google.sheets({ version: 'v4', auth });
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEETS_ID,
    range: "'Employee Roster'!A2:B",
  });
  const rows = response.data.values || [];
  return rows
    .filter(row => row[0] && (!row[1] || row[1].toLowerCase() !== 'inactive'))
    .map(row => row[0].trim());
}

// Levenshtein distance for fuzzy name matching
function levenshtein(a, b) {
  const m = [];
  for (let i = 0; i <= b.length; i++) m[i] = [i];
  for (let j = 0; j <= a.length; j++) m[0][j] = j;
  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      m[i][j] = b[i-1] === a[j-1]
        ? m[i-1][j-1]
        : Math.min(m[i-1][j-1]+1, m[i][j-1]+1, m[i-1][j]+1);
    }
  }
  return m[b.length][a.length];
}

// Match a spoken name to the closest employee roster name
// Handles: first-name-only ("Jayson" → "Jayson Rivas"), nicknames, typos
function matchEmployeeName(spokenName, roster) {
  if (!roster || roster.length === 0) return spokenName;

  const spoken = spokenName.toLowerCase().trim();

  // 1. Exact match
  const exact = roster.find(r => r.toLowerCase() === spoken);
  if (exact) return exact;

  // 2. First-name match (e.g., "Jayson" matches "Jayson Rivas")
  const firstNameMatches = roster.filter(r =>
    r.toLowerCase().split(' ')[0] === spoken.split(' ')[0]
  );
  if (firstNameMatches.length === 1) return firstNameMatches[0];

  // 3. Partial/contains match (spoken name is part of roster name or vice versa)
  const containsMatches = roster.filter(r =>
    r.toLowerCase().includes(spoken) || spoken.includes(r.toLowerCase())
  );
  if (containsMatches.length === 1) return containsMatches[0];

  // 4. Levenshtein fuzzy match
  let bestMatch = null;
  let bestScore = Infinity;
  for (const name of roster) {
    const dist = levenshtein(spoken, name.toLowerCase());
    const maxLen = Math.max(spoken.length, name.length);
    const similarity = 1 - (dist / maxLen);
    if (similarity > 0.5 && dist < bestScore) {
      bestScore = dist;
      bestMatch = name;
    }
  }
  if (bestMatch) return bestMatch;

  // No match found — return original
  return spokenName;
}

// Extract structured report data from the transcript's submit_daily_report tool call
// This is the richest data source — contains all fields Roxy collected during the call
function extractReportDataFromTranscript(transcript) {
  if (!transcript || !Array.isArray(transcript)) return null;

  for (const entry of transcript) {
    if (!entry.tool_calls || !Array.isArray(entry.tool_calls)) continue;
    for (const tc of entry.tool_calls) {
      if (tc.tool_name !== 'submit_daily_report') continue;

      let params = null;
      try {
        // Try params_as_json first (cleaner), fall back to tool_details.body
        if (tc.params_as_json) {
          params = typeof tc.params_as_json === 'string' ? JSON.parse(tc.params_as_json) : tc.params_as_json;
        } else if (tc.tool_details?.body) {
          params = typeof tc.tool_details.body === 'string' ? JSON.parse(tc.tool_details.body) : tc.tool_details.body;
        }
      } catch (e) {
        console.warn('[ExtractReport] Failed to parse tool call params:', e.message);
        continue;
      }

      if (!params) continue;

      console.log('[ExtractReport] Found submit_daily_report data:', JSON.stringify(params).substring(0, 300));

      // Convert snake_case from ElevenLabs to camelCase for DynamoDB
      return {
        jobSite: params.job_site,
        workPerformed: (params.work_performed || []).map(w => ({
          description: w.description,
          area: w.area || undefined,
        })),
        deliveries: (params.deliveries || []).map(d => ({
          vendor: d.vendor,
          material: d.material,
          quantity: d.quantity || undefined,
          notes: d.notes || undefined,
        })),
        equipment: (params.equipment || []).map(e => ({
          name: e.name,
          hours: e.hours || undefined,
          notes: e.notes || undefined,
        })),
        safety: (params.safety || []).map(s => ({
          type: s.type,
          description: s.description,
          actionTaken: s.action_taken || undefined,
        })),
        delays: (params.delays || []).map(d => ({
          reason: d.reason,
          duration: d.duration || undefined,
          impact: d.impact || undefined,
        })),
        subcontractors: (params.subcontractors || []).map(s => ({
          company: s.company,
          trade: s.trade || undefined,
          headcount: s.headcount || undefined,
          workPerformed: s.work_performed || undefined,
        })),
        weatherConditions: params.weather_conditions || undefined,
        weatherImpact: params.weather_impact || undefined,
        shortages: params.shortages || undefined,
        notes: params.notes || undefined,
      };
    }
  }

  return null;
}

// Generate a foreman-friendly summary from structured report data
function generateReportSummary(reportData, employees, callDurationSecs) {
  const parts = [];

  // Crew summary
  if (employees && employees.length > 0) {
    const totalHours = employees.reduce((s, e) => s + (e.totalHours || 0), 0);
    const totalOT = employees.reduce((s, e) => s + (e.overtimeHours || 0), 0);
    let crewLine = `${employees.length}-person crew logged ${totalHours} total hours`;
    if (totalOT > 0) crewLine += ` (${totalOT} OT)`;
    parts.push(crewLine);
  }

  // Work performed
  if (reportData?.workPerformed?.length > 0) {
    const workItems = reportData.workPerformed.map(w => {
      let desc = w.description;
      if (w.area) desc += ` (${w.area})`;
      return desc;
    });
    parts.push(`Work: ${workItems.join('; ')}`);
  }

  // Safety
  if (reportData?.safety?.length > 0) {
    const incidents = reportData.safety.filter(s => s.type === 'incident');
    const nearMisses = reportData.safety.filter(s => s.type === 'near_miss');
    const hazards = reportData.safety.filter(s => s.type === 'hazard');
    const safetyParts = [];
    if (incidents.length > 0) safetyParts.push(`${incidents.length} incident(s): ${incidents.map(i => i.description).join('; ')}`);
    if (nearMisses.length > 0) safetyParts.push(`${nearMisses.length} near miss(es)`);
    if (hazards.length > 0) safetyParts.push(`${hazards.length} hazard(s)`);
    if (safetyParts.length > 0) parts.push(`Safety: ${safetyParts.join('. ')}`);
  }

  // Weather
  if (reportData?.weatherConditions) {
    let weatherLine = `Weather: ${reportData.weatherConditions}`;
    if (reportData.weatherImpact) weatherLine += ` — ${reportData.weatherImpact}`;
    parts.push(weatherLine);
  }

  // Deliveries
  if (reportData?.deliveries?.length > 0) {
    const deliveryItems = reportData.deliveries.map(d => `${d.vendor} (${d.material})`);
    parts.push(`Deliveries: ${deliveryItems.join(', ')}`);
  }

  // Delays
  if (reportData?.delays?.length > 0) {
    const delayItems = reportData.delays.map(d => {
      let desc = d.reason;
      if (d.duration) desc += ` (${d.duration})`;
      return desc;
    });
    parts.push(`Delays: ${delayItems.join('; ')}`);
  }

  // Shortages
  if (reportData?.shortages) {
    parts.push(`Shortages: ${reportData.shortages}`);
  }

  return parts.join('. ') + '.';
}

// Read the most recent report data from Google Sheets for DynamoDB sync
// Also applies employee name matching against the roster
async function getRecentReportData(auth, reportId) {
  const sheets = google.sheets({ version: 'v4', auth });

  // Load roster for name matching
  let roster = [];
  try {
    roster = await loadEmployeeRoster(auth);
    console.log(`[NameMatch] Loaded ${roster.length} employees from roster`);
  } catch (e) {
    console.warn('[NameMatch] Could not load roster:', e.message);
  }

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: GOOGLE_SHEETS_ID,
    range: "'Main Report Log'!A:S",
  });

  const rows = response.data.values || [];
  const employees = [];
  let jobSite = 'Unknown';

  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    if (row[12] === reportId) {
      jobSite = row[1] || jobSite;
      const originalName = row[2] || 'Unknown';
      const normalizedName = matchEmployeeName(originalName, roster);
      if (normalizedName !== originalName) {
        console.log(`[NameMatch] "${originalName}" → "${normalizedName}"`);
      }
      employees.push({
        name: originalName,
        normalizedName,
        regularHours: Number(row[3]) || 0,
        overtimeHours: Number(row[4]) || 0,
        totalHours: (Number(row[3]) || 0) + (Number(row[4]) || 0),
      });
    }
  }

  const matchedRow = rows.find(r => r[12] === reportId);
  return {
    jobSite,
    employees,
    workPerformedText: matchedRow?.[5] || undefined,
    deliveriesText: matchedRow?.[6] || undefined,
    equipmentText: matchedRow?.[7] || undefined,
    safetyText: matchedRow?.[8] || undefined,
    weatherConditions: matchedRow?.[9] || undefined,
    delaysText: matchedRow?.[13] || undefined,
    shortages: matchedRow?.[14] || undefined,
    subcontractorsText: matchedRow?.[15] || undefined,
    notes: matchedRow?.[16] || undefined,
    other: matchedRow?.[17] || undefined,
  };
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

    // ElevenLabs sends post-call webhooks in a wrapped format:
    // { type: "post_call_transcription", event_timestamp: ..., data: { status, conversation_id, ... } }
    // Unwrap to get the actual conversation data
    let convData = body;
    if (body.type && body.data) {
      console.log(`[PostCall] Unwrapping ElevenLabs envelope: type=${body.type}`);
      convData = body.data;
    }

    // Single conversation mode
    console.log('Parsed body:', JSON.stringify({
      conversation_id: convData.conversation_id,
      status: convData.status,
    }));

    if (convData.status !== 'done') {
      return {
        statusCode: 200,
        body: JSON.stringify({ success: true, message: `Status: ${convData.status}` }),
      };
    }

    if (!convData.conversation_id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, error: 'Missing conversation_id' }),
      };
    }

    // Get conversation date
    let conversationDate = new Date();
    try {
      const details = await getConversationDetails(convData.conversation_id);
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
      convData.conversation_id,
      conversationDate,
      existingAudioFiles,
      existingTranscriptFiles
    );

    // Update Google Sheet
    let reportId = null;
    if (audioUrl || transcriptUrl) {
      reportId = await updateReportWithFiles(auth, audioUrl, transcriptUrl);
      console.log('Updated report:', reportId);
    }

    // Write to DynamoDB (system of record)
    try {
      const details = await getConversationDetails(convData.conversation_id);
      const transcript = details.transcript || [];
      const transcriptText = formatTranscript(transcript);
      const callDurationSecs = details.metadata?.call_duration_secs || details.call_duration_secs || null;

      // If we matched a report in Sheets, pull its data for DynamoDB
      let reportData = null;
      if (reportId) {
        reportData = await getRecentReportData(auth, reportId);
      }

      // Extract structured data from transcript tool call
      const transcriptReportData = extractReportDataFromTranscript(transcript);

      await writeToDynamoDB(
        reportId || `RPT-${Date.now()}`,
        convData.conversation_id,
        transcript,
        transcriptText,
        audioUrl,
        transcriptUrl,
        callDurationSecs,
        reportData,
        transcriptReportData
      );
      console.log('[DynamoDB] Write complete for conversation:', convData.conversation_id);
    } catch (dynamoError) {
      console.error('[DynamoDB] Write failed (non-blocking):', dynamoError.message);
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        conversation_id: convData.conversation_id,
        audio_uploaded: !!audioUrl,
        transcript_uploaded: !!transcriptUrl,
        dynamo_synced: true,
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
