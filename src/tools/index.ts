import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { z } from 'zod'
import { connectionManager } from '../state/connection-manager'
import { getConfig, getModeDescription } from '../config'
import { validateQuery } from '../utils/validation'
import { formatSuccessResponse, formatErrorResponse } from '../utils/errors'
import {
    ConnectDatabaseSchema,
    SwitchDatabaseSchema,
    DescribeTableSchema,
    ExecuteQuerySchema
} from '../schemas'

/**
 * Register all tools with the MCP server using registerTool API
 */
export function registerTools(server: McpServer): void {
    // connect-database
    server.registerTool(
        'connect-database',
        {
            title: 'Connect Database',
            description: 'Connect to a database server (MSSQL, PostgreSQL, or SQLite). Disconnects any existing connection first.',
            inputSchema: {
                engine: z.enum(['mssql', 'postgres', 'sqlite']).describe('Database engine type'),
                server: z.string().optional().describe('Server hostname or IP address (mssql, postgres)'),
                port: z.number().optional().describe('Port number'),
                database: z.string().optional().describe('Initial database to connect to (mssql, postgres)'),
                user: z.string().optional().describe('Username for authentication (mssql, postgres)'),
                password: z.string().optional().describe('Password for authentication (mssql, postgres)'),
                windowsAuth: z.boolean().optional().describe('Use Windows Authentication (mssql only)'),
                encrypt: z.boolean().optional().describe('Enable encryption (mssql only, default: true)'),
                trustServerCertificate: z.boolean().optional().describe('Trust server certificate (mssql only)'),
                ssl: z.union([
                    z.boolean(),
                    z.object({
                        rejectUnauthorized: z.boolean().optional(),
                        cert: z.string().optional(),
                        key: z.string().optional(),
                        ca: z.string().optional()
                    })
                ]).optional().describe('SSL configuration (postgres only)'),
                filename: z.string().optional().describe('File path for SQLite, or ":memory:" for in-memory (sqlite only)'),
                readonly: z.boolean().optional().describe('Open SQLite database in read-only mode (sqlite only)'),
                fileMustExist: z.boolean().optional().describe('Throw if SQLite file does not exist (sqlite only)')
            }
        },
        async (args) => {
            try {
                const input = ConnectDatabaseSchema.parse(args)
                await connectionManager.connect(input)
                const state = connectionManager.getConnectionState()
                const target = input.engine === 'sqlite'
                    ? `file ${input.filename}`
                    : `server at ${input.server}`
                return formatSuccessResponse({
                    message: `Connected to ${input.engine} ${target}`,
                    database: state.database
                })
            } catch (error) {
                return formatErrorResponse(error)
            }
        }
    )

    // disconnect
    server.registerTool(
        'disconnect',
        {
            title: 'Disconnect',
            description: 'Disconnect from the current database connection. Safe to call when not connected.'
        },
        async () => {
            try {
                const wasConnected = connectionManager.isConnected
                await connectionManager.disconnect()
                return formatSuccessResponse({
                    message: wasConnected
                        ? 'Disconnected from database'
                        : 'No active connection to disconnect'
                })
            } catch (error) {
                return formatErrorResponse(error)
            }
        }
    )

    // connection-status
    server.registerTool(
        'connection-status',
        {
            title: 'Connection Status',
            description: 'Check the current database connection status and query mode.'
        },
        async () => {
            try {
                const state = connectionManager.getConnectionState()
                const config = getConfig()
                return formatSuccessResponse({
                    connected: state.isConnected,
                    engine: state.engine,
                    server: state.server,
                    database: state.database,
                    queryMode: config.queryMode,
                    queryModeDescription: getModeDescription(config.queryMode)
                })
            } catch (error) {
                return formatErrorResponse(error)
            }
        }
    )

    // list-databases
    server.registerTool(
        'list-databases',
        {
            title: 'List Databases',
            description: 'List all available databases on the connected server. Requires an active connection.'
        },
        async () => {
            try {
                const databases = await connectionManager.listDatabases()
                return formatSuccessResponse({
                    databases,
                    count: databases.length
                })
            } catch (error) {
                return formatErrorResponse(error)
            }
        }
    )

    // switch-database
    server.registerTool(
        'switch-database',
        {
            title: 'Switch Database',
            description: 'Switch to a different database on the connected server. Note: PostgreSQL requires reconnection.',
            inputSchema: {
                database: z.string().describe('Database name to switch to')
            }
        },
        async (args) => {
            try {
                const input = SwitchDatabaseSchema.parse(args)
                await connectionManager.switchDatabase(input.database)
                const state = connectionManager.getConnectionState()
                return formatSuccessResponse({
                    message: `Switched to database '${input.database}'`,
                    database: state.database
                })
            } catch (error) {
                return formatErrorResponse(error)
            }
        }
    )

    // list-tables
    server.registerTool(
        'list-tables',
        {
            title: 'List Tables',
            description: 'List all tables and views in the current database. Requires an active connection.'
        },
        async () => {
            try {
                const tables = await connectionManager.listTables()
                const tableCount = tables.filter(t => t.type === 'TABLE').length
                const viewCount = tables.filter(t => t.type === 'VIEW').length
                return formatSuccessResponse({
                    tables,
                    summary: {
                        total: tables.length,
                        tables: tableCount,
                        views: viewCount
                    }
                })
            } catch (error) {
                return formatErrorResponse(error)
            }
        }
    )

    // describe-table
    server.registerTool(
        'describe-table',
        {
            title: 'Describe Table',
            description: 'Get detailed schema information for a table including columns, types, and constraints.',
            inputSchema: {
                tableName: z.string().describe('Table name to describe'),
                schema: z.string().optional().describe('Schema name (default: dbo for MSSQL, public for PostgreSQL)')
            }
        },
        async (args) => {
            try {
                const input = DescribeTableSchema.parse(args)
                const columns = await connectionManager.describeTable(
                    input.tableName,
                    input.schema
                )
                const primaryKeys = columns
                    .filter(col => col.isPrimaryKey)
                    .map(col => col.name)
                return formatSuccessResponse({
                    tableName: input.tableName,
                    schema: input.schema ?? 'default',
                    columns,
                    primaryKeys,
                    columnCount: columns.length
                })
            } catch (error) {
                return formatErrorResponse(error)
            }
        }
    )

    // execute-query
    server.registerTool(
        'execute-query',
        {
            title: 'Execute Query',
            description: 'Execute a SQL query. Operations allowed depend on SQL_MCP_MODE (safe: SELECT only, write: +INSERT/UPDATE/DELETE, full: all).',
            inputSchema: {
                query: z.string().describe('SQL query to execute'),
                limit: z.number().optional().describe('Maximum rows to return (default: 100, max: 1000)')
            }
        },
        async (args) => {
            try {
                const input = ExecuteQuerySchema.parse(args)
                const config = getConfig()
                validateQuery(input.query, config.queryMode)
                const result = await connectionManager.executeQuery(
                    input.query,
                    input.limit ?? 100
                )
                return formatSuccessResponse({
                    columns: result.columns,
                    rows: result.rows,
                    rowCount: result.rowCount,
                    affectedRows: result.affectedRows,
                    queryMode: config.queryMode
                })
            } catch (error) {
                return formatErrorResponse(error)
            }
        }
    )
}
