import postgres, { type Sql } from 'postgres'
import { BaseAdapter } from './base'
import type {
    ConnectionConfig,
    ColumnInfo,
    TableInfo,
    QueryResult,
    DatabaseEngine,
    SslConfig
} from '../types/database'
import { ConnectionError, QueryError } from '../utils/errors'

/**
 * PostgreSQL database adapter implementation using postgres.js
 * https://github.com/porsager/postgres
 */
export class PostgresAdapter extends BaseAdapter {
    readonly engine: DatabaseEngine = 'postgres'
    private sql: Sql | null = null

    getDefaultPort(): number {
        return 5432
    }

    getDefaultSchema(): string {
        return 'public'
    }

    async connect(config: ConnectionConfig): Promise<void> {
        try {
            const sslConfig = this.buildSslConfig(config.ssl)

            this.sql = postgres({
                host: config.server,
                port: config.port ?? this.getDefaultPort(),
                username: config.user,
                password: config.password,
                database: config.database ?? 'postgres',
                connect_timeout: 30,
                idle_timeout: 30,
                max: 10,
                ssl: sslConfig
            })

            // Test connection
            await this.sql`SELECT 1`

            this._isConnected = true
            this._currentDatabase = config.database ?? 'postgres'
            this._config = config
        } catch (error) {
            throw new ConnectionError(
                `Failed to connect to PostgreSQL server: ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error : undefined
            )
        }
    }

    private buildSslConfig(ssl: ConnectionConfig['ssl']): postgres.Options<{}>['ssl'] {
        if (!ssl) {
            return false
        }

        if (typeof ssl === 'boolean') {
            return ssl ? 'require' : false
        }

        const sslConfig = ssl as SslConfig
        return {
            rejectUnauthorized: sslConfig.rejectUnauthorized ?? true,
            cert: sslConfig.cert,
            key: sslConfig.key,
            ca: sslConfig.ca
        }
    }

    async disconnect(): Promise<void> {
        if (this.sql) {
            await this.sql.end()
            this.sql = null
        }
        this._isConnected = false
        this._currentDatabase = null
        this._config = null
    }

    async switchDatabase(database: string): Promise<void> {
        this.validateConnected()

        // PostgreSQL requires reconnection to switch databases
        if (!this._config) {
            throw new ConnectionError('No connection configuration available')
        }

        await this.disconnect()
        await this.connect({ ...this._config, database })
    }

    async listDatabases(): Promise<string[]> {
        this.validateConnected()

        try {
            const result = await this.sql!`
                SELECT datname as name
                FROM pg_database
                WHERE datistemplate = false
                  AND datallowconn = true
                ORDER BY datname
            `
            return result.map(row => row.name as string)
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
            const result = await this.sql!`
                SELECT
                    table_schema as schema,
                    table_name as name,
                    CASE table_type
                        WHEN 'BASE TABLE' THEN 'TABLE'
                        ELSE 'VIEW'
                    END as type
                FROM information_schema.tables
                WHERE table_schema NOT IN ('pg_catalog', 'information_schema')
                ORDER BY table_schema, table_name
            `
            return result.map(row => ({
                schema: row.schema as string,
                name: row.name as string,
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
            const result = await this.sql!`
                SELECT
                    c.column_name as name,
                    c.data_type as type,
                    c.is_nullable = 'YES' as nullable,
                    c.character_maximum_length as max_length,
                    c.numeric_precision as precision,
                    c.numeric_scale as scale,
                    c.column_default as default_value,
                    COALESCE(
                        (SELECT true
                         FROM information_schema.table_constraints tc
                         JOIN information_schema.key_column_usage kcu
                             ON tc.constraint_name = kcu.constraint_name
                             AND tc.table_schema = kcu.table_schema
                         WHERE tc.constraint_type = 'PRIMARY KEY'
                           AND tc.table_schema = c.table_schema
                           AND tc.table_name = c.table_name
                           AND kcu.column_name = c.column_name),
                        false
                    ) as is_primary_key,
                    col_description(
                        (quote_ident(c.table_schema) || '.' || quote_ident(c.table_name))::regclass,
                        c.ordinal_position
                    ) as comment
                FROM information_schema.columns c
                WHERE c.table_schema = ${schemaName} AND c.table_name = ${tableName}
                ORDER BY c.ordinal_position
            `

            return result.map(row => ({
                name: row.name as string,
                type: row.type as string,
                nullable: Boolean(row.nullable),
                maxLength: (row.max_length as number | null) ?? undefined,
                precision: (row.precision as number | null) ?? undefined,
                scale: (row.scale as number | null) ?? undefined,
                isPrimaryKey: Boolean(row.is_primary_key),
                defaultValue: (row.default_value as string | null) ?? undefined,
                comment: (row.comment as string | null) ?? undefined
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
            // Add LIMIT clause if it's a SELECT without existing LIMIT
            let modifiedQuery = query
            const trimmedQuery = query.trim().toUpperCase()

            if (
                trimmedQuery.startsWith('SELECT') &&
                !trimmedQuery.includes(' LIMIT ')
            ) {
                modifiedQuery = `${query.trim().replace(/;?\s*$/, '')} LIMIT ${limit}`
            }

            // Use unsafe() for dynamic SQL queries
            const result = await this.sql!.unsafe(modifiedQuery)

            // Get column names from the result
            const columns = result.columns?.map(col => col.name) ?? []

            return {
                columns,
                rows: Array.from(result),
                rowCount: result.length,
                affectedRows: result.count
            }
        } catch (error) {
            throw new QueryError(
                `Query execution failed: ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error : undefined
            )
        }
    }
}
