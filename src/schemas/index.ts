import { z } from 'zod'

/**
 * Database engine enum schema
 */
export const DatabaseEngineSchema = z.enum(['mssql', 'postgres'])

/**
 * SSL configuration schema for PostgreSQL
 */
export const SslConfigSchema = z.union([
    z.boolean(),
    z.object({
        rejectUnauthorized: z.boolean().optional()
            .describe('Whether to reject unauthorized certificates'),
        cert: z.string().optional()
            .describe('Client certificate content or file path'),
        key: z.string().optional()
            .describe('Client private key content or file path'),
        ca: z.string().optional()
            .describe('CA certificate content or file path')
    })
])

/**
 * Schema for connect-database tool input
 */
export const ConnectDatabaseSchema = z.object({
    engine: DatabaseEngineSchema
        .describe('Database engine type: mssql or postgres'),
    server: z.string().min(1)
        .describe('Server hostname or IP address'),
    port: z.number().int().positive().optional()
        .describe('Port number (default: 1433 for MSSQL, 5432 for PostgreSQL)'),
    database: z.string().optional()
        .describe('Initial database to connect to'),

    // Standard authentication
    user: z.string().optional()
        .describe('Username for authentication'),
    password: z.string().optional()
        .describe('Password for authentication'),

    // MSSQL specific options
    windowsAuth: z.boolean().optional()
        .describe('Use Windows Authentication (MSSQL only)'),
    encrypt: z.boolean().optional()
        .describe('Enable encryption (default: true)'),
    trustServerCertificate: z.boolean().optional()
        .describe('Trust server certificate without validation'),

    // PostgreSQL SSL options
    ssl: SslConfigSchema.optional()
        .describe('SSL configuration (PostgreSQL only)')
})

/**
 * Schema for switch-database tool input
 */
export const SwitchDatabaseSchema = z.object({
    database: z.string().min(1)
        .describe('Database name to switch to')
})

/**
 * Schema for describe-table tool input
 */
export const DescribeTableSchema = z.object({
    tableName: z.string().min(1)
        .describe('Table name to describe'),
    schema: z.string().optional()
        .describe('Schema name (default: dbo for MSSQL, public for PostgreSQL)')
})

/**
 * Schema for execute-query tool input
 */
export const ExecuteQuerySchema = z.object({
    query: z.string().min(1)
        .describe('SQL query to execute'),
    limit: z.number().int().positive().max(1000).optional()
        .describe('Maximum number of rows to return (default: 100, max: 1000)')
})

/**
 * Type exports derived from schemas
 */
export type ConnectDatabaseInput = z.infer<typeof ConnectDatabaseSchema>
export type SwitchDatabaseInput = z.infer<typeof SwitchDatabaseSchema>
export type DescribeTableInput = z.infer<typeof DescribeTableSchema>
export type ExecuteQueryInput = z.infer<typeof ExecuteQuerySchema>
