/**
 * DynamoDB Client Configuration
 *
 * Creates and exports a singleton DynamoDB Document Client
 * for use across all DynamoDB adapters.
 */

import { DynamoDBClient } from '@aws-sdk/client-dynamodb'
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb'

let docClient: DynamoDBDocumentClient | null = null

export function getDynamoClient(): DynamoDBDocumentClient {
  if (docClient) return docClient

  const client = new DynamoDBClient({
    region: process.env.DYNAMO_REGION || 'us-east-1',
  })

  docClient = DynamoDBDocumentClient.from(client, {
    marshallOptions: {
      removeUndefinedValues: true,
    },
  })

  return docClient
}

export const DYNAMO_CONFIG = {
  TABLE_NAME: process.env.DYNAMODB_TABLE_NAME || 'sitelogix-v4-reports',
  INDEXES: {
    BY_DATE: 'byDate',
    BY_SITE: 'bySite',
    BY_TENANT_DATE: 'byTenantDate',
  },
}
