import sql from 'mssql'
import { BaseAdapter } from './base'
import type {
    ConnectionConfig,
    ColumnInfo,
    TableInfo,
    QueryResult,
    DatabaseEngine
} from '../types/database'
import { ConnectionError, QueryError } from '../utils/errors'

/**
 * MSSQL database adapter implementation
 */
export class MssqlAdapter extends BaseAdapter {
    readonly engine: DatabaseEngine = 'mssql'
    private pool: sql.ConnectionPool | null = null

    getDefaultPort(): number {
        return 1433
    }

    getDefaultSchema(): string {
        return 'dbo'
    }

    async connect(config: ConnectionConfig): Promise<void> {
        try {
            const sqlConfig: sql.config = {
                server: config.server,
                port: config.port ?? this.getDefaultPort(),
                database: config.database,
                options: {
                    encrypt: config.encrypt ?? true,
                    trustServerCertificate: config.trustServerCertificate ?? false
                },
                connectionTimeout: 30000,
                requestTimeout: 30000
            }

            // Handle authentication
            if (config.windowsAuth) {
                // Windows Authentication
                sqlConfig.authentication = {
                    type: 'ntlm',
                    options: {
                        domain: '',
                        userName: config.user ?? '',
                        password: config.password ?? ''
                    }
                }
            } else {
                // SQL Server Authentication
                sqlConfig.user = config.user
                sqlConfig.password = config.password
            }

            this.pool = await sql.connect(sqlConfig)
            this._isConnected = true
            this._currentDatabase = config.database ?? 'master'
            this._config = config
        } catch (error) {
            throw new ConnectionError(
                `Failed to connect to MSSQL server: ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error : undefined
            )
        }
    }

    async disconnect(): Promise<void> {
        if (this.pool) {
            await this.pool.close()
            this.pool = null
        }
        this._isConnected = false
        this._currentDatabase = null
        this._config = null
    }

    async switchDatabase(database: string): Promise<void> {
        this.validateConnected()

        try {
            // MSSQL allows USE statement to switch database
            await this.pool!.request().query(`USE [${database}]`)
            this._currentDatabase = database
        } catch (error) {
            throw new QueryError(
                `Failed to switch to database '${database}': ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error : undefined
            )
        }
    }

    async listDatabases(): Promise<string[]> {
        this.validateConnected()

        try {
            const result = await this.pool!.request().query(`
                SELECT name
                FROM sys.databases
                WHERE name NOT IN ('master', 'tempdb', 'model', 'msdb')
                  AND state_desc = 'ONLINE'
                ORDER BY name
            `)
            return result.recordset.map((row: { name: string }) => row.name)
        } catch (error) {
            throw new QueryError(
                `Failed to list databases: ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error : undefined
            )
        }
    }

    async listTables(): Promise<TableInfo[]> {
        this.validateConnected()

        try {
            const result = await this.pool!.request().query(`
                SELECT
                    TABLE_SCHEMA as [schema],
                    TABLE_NAME as name,
                    CASE TABLE_TYPE
                        WHEN 'BASE TABLE' THEN 'TABLE'
                        ELSE 'VIEW'
                    END as type
                FROM INFORMATION_SCHEMA.TABLES
                ORDER BY TABLE_SCHEMA, TABLE_NAME
            `)
            return result.recordset.map((row: { schema: string; name: string; type: string }) => ({
                schema: row.schema,
                name: row.name,
                type: row.type as 'TABLE' | 'VIEW'
            }))
        } catch (error) {
            throw new QueryError(
                `Failed to list tables: ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error : undefined
            )
        }
    }

    async describeTable(tableName: string, schema?: string): Promise<ColumnInfo[]> {
        this.validateConnected()

        const schemaName = schema ?? this.getDefaultSchema()

        try {
            const result = await this.pool!.request()
                .input('schema', sql.NVarChar, schemaName)
                .input('table', sql.NVarChar, tableName)
                .query(`
                    SELECT
                        c.COLUMN_NAME as name,
                        c.DATA_TYPE as type,
                        CASE c.IS_NULLABLE WHEN 'YES' THEN 1 ELSE 0 END as nullable,
                        c.CHARACTER_MAXIMUM_LENGTH as maxLength,
                        c.NUMERIC_PRECISION as precision,
                        c.NUMERIC_SCALE as scale,
                        c.COLUMN_DEFAULT as defaultValue,
                        CASE WHEN pk.COLUMN_NAME IS NOT NULL THEN 1 ELSE 0 END as isPrimaryKey,
                        ep.value as comment
                    FROM INFORMATION_SCHEMA.COLUMNS c
                    LEFT JOIN (
                        SELECT ku.TABLE_SCHEMA, ku.TABLE_NAME, ku.COLUMN_NAME
                        FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                        JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE ku
                            ON tc.CONSTRAINT_NAME = ku.CONSTRAINT_NAME
                            AND tc.TABLE_SCHEMA = ku.TABLE_SCHEMA
                        WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
                    ) pk ON c.TABLE_SCHEMA = pk.TABLE_SCHEMA
                        AND c.TABLE_NAME = pk.TABLE_NAME
                        AND c.COLUMN_NAME = pk.COLUMN_NAME
                    LEFT JOIN sys.extended_properties ep
                        ON ep.major_id = OBJECT_ID(@schema + '.' + @table)
                        AND ep.minor_id = c.ORDINAL_POSITION
                        AND ep.name = 'MS_Description'
                    WHERE c.TABLE_SCHEMA = @schema AND c.TABLE_NAME = @table
                    ORDER BY c.ORDINAL_POSITION
                `)

            interface ColumnRow {
                name: string
                type: string
                nullable: number
                maxLength: number | null
                precision: number | null
                scale: number | null
                isPrimaryKey: number
                defaultValue: string | null
                comment: string | null
            }
            return result.recordset.map((row: ColumnRow) => ({
                name: row.name,
                type: row.type,
                nullable: Boolean(row.nullable),
                maxLength: row.maxLength ?? undefined,
                precision: row.precision ?? undefined,
                scale: row.scale ?? undefined,
                isPrimaryKey: Boolean(row.isPrimaryKey),
                defaultValue: row.defaultValue ?? undefined,
                comment: row.comment ?? undefined
            }))
        } catch (error) {
            throw new QueryError(
                `Failed to describe table '${schemaName}.${tableName}': ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error : undefined
            )
        }
    }

    async executeQuery(query: string, limit = 100): Promise<QueryResult> {
        this.validateConnected()

        try {
            // Add TOP clause if it's a SELECT without existing TOP/OFFSET
            let modifiedQuery = query
            const trimmedQuery = query.trim().toUpperCase()

            if (
                trimmedQuery.startsWith('SELECT') &&
                !trimmedQuery.includes(' TOP ') &&
                !trimmedQuery.includes(' OFFSET ')
            ) {
                modifiedQuery = query.replace(
                    /^(\s*SELECT\s+)/i,
                    `$1TOP ${limit} `
                )
            }

            const result = await this.pool!.request().query(modifiedQuery)

            // Handle recordset (SELECT queries)
            if (result.recordset && result.recordset.length > 0) {
                const columns = Object.keys(result.recordset[0])
                return {
                    columns,
                    rows: result.recordset,
                    rowCount: result.recordset.length,
                    affectedRows: result.rowsAffected?.[0]
                }
            }

            // Handle non-SELECT queries
            return {
                columns: [],
                rows: [],
                rowCount: 0,
                affectedRows: result.rowsAffected?.[0]
            }
        } catch (error) {
            throw new QueryError(
                `Query execution failed: ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error : undefined
            )
        }
    }
}
