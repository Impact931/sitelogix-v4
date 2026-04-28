/**
 * Migration: Add tenantId to existing DynamoDB reports
 *
 * Backfills tenantId='parkway' on all existing records in sitelogix-v4-reports.
 * Safe to run multiple times (idempotent).
 *
 * Usage: npx tsx scripts/migrate-add-tenant-id.ts
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient, ScanCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb'

const TABLE_NAME = process.env.DYNAMODB_TABLE_NAME || 'sitelogix-v4-reports'
const REGION = process.env.DYNAMO_REGION || 'us-east-1'
const TENANT_ID = 'parkway'

const client = DynamoDBDocumentClient.from(
  new DynamoDBClient({ region: REGION }),
  { marshallOptions: { removeUndefinedValues: true } }
)

async function migrate() {
  console.log(`Migrating table: ${TABLE_NAME}`)
  console.log(`Setting tenantId='${TENANT_ID}' on all records without tenantId...\n`)

  let updated = 0
  let skipped = 0
  let lastKey: Record<string, unknown> | undefined

  do {
    const scan = await client.send(
      new ScanCommand({
        TableName: TABLE_NAME,
        ExclusiveStartKey: lastKey,
        FilterExpression: 'attribute_not_exists(tenantId)',
        ProjectionExpression: 'reportId',
      })
    )

    const items = scan.Items || []
    lastKey = scan.LastEvaluatedKey

    for (const item of items) {
      try {
        await client.send(
          new UpdateCommand({
            TableName: TABLE_NAME,
            Key: { reportId: item.reportId },
            UpdateExpression: 'SET tenantId = :tid',
            ExpressionAttributeValues: { ':tid': TENANT_ID },
          })
        )
        updated++
        if (updated % 10 === 0) {
          console.log(`  Updated ${updated} records...`)
        }
      } catch (err) {
        console.error(`  Failed to update ${item.reportId}:`, err)
      }
    }

    if (items.length === 0 && !lastKey) {
      console.log('  No records need migration.')
    }
  } while (lastKey)

  console.log(`\nMigration complete: ${updated} updated, ${skipped} skipped`)
}

migrate().catch((err) => {
  console.error('Migration failed:', err)
  process.exit(1)
})
