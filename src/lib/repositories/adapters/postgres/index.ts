/**
 * PostgreSQL Adapters for Local Development
 *
 * These adapters use Prisma to interact with a local PostgreSQL database.
 * Used when DATA_ADAPTER=postgres in environment.
 */

export { PostgresEmployeeRepository } from './employee.adapter'
export { PostgresReportRepository } from './report.adapter'
export { LocalFileRepository } from './file.adapter'
