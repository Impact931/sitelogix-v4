/**
 * DynamoDB Adapters - System of Record
 *
 * DynamoDB serves as the primary data store for SiteLogix-v4.
 * Stores rich report payloads including full transcripts.
 * Google Sheets remains as the "User Mirror" for bookkeepers.
 */

export { DynamoDBReportRepository } from './report.adapter'
export { getDynamoClient, DYNAMO_CONFIG } from './client'
