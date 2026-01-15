import { Pool, type PoolConfig } from 'pg'
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
 * PostgreSQL database adapter implementation
 */
export class PostgresAdapter extends BaseAdapter {
    readonly engine: DatabaseEngine = 'postgres'
    private pool: Pool | null = null

    getDefaultPort(): number {
        return 5432
    }

    getDefaultSchema(): string {
        return 'public'
    }

    async connect(config: ConnectionConfig): Promise<void> {
        try {
            const poolConfig: PoolConfig = {
                host: config.server,
                port: config.port ?? this.getDefaultPort(),
                user: config.user,
                password: config.password,
                database: config.database ?? 'postgres',
                connectionTimeoutMillis: 30000,
                idleTimeoutMillis: 30000,
                max: 10
            }

            // Handle SSL configuration
            if (config.ssl) {
                if (typeof config.ssl === 'boolean') {
                    poolConfig.ssl = config.ssl
                        ? { rejectUnauthorized: false }
                        : false
                } else {
                    const sslConfig = config.ssl as SslConfig
                    poolConfig.ssl = {
                        rejectUnauthorized: sslConfig.rejectUnauthorized ?? true,
                        cert: sslConfig.cert,
                        key: sslConfig.key,
                        ca: sslConfig.ca
                    }
                }
            }

            this.pool = new Pool(poolConfig)

            // Test connection
            const client = await this.pool.connect()
            client.release()

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

    async disconnect(): Promise<void> {
        if (this.pool) {
            await this.pool.end()
            this.pool = null
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
            const result = await this.pool!.query(`
                SELECT datname as name
                FROM pg_database
                WHERE datistemplate = false
                  AND datallowconn = true
                ORDER BY datname
            `)
            return result.rows.map(row => row.name)
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
            const result = await this.pool!.query(`
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
            `)
            return result.rows.map(row => ({
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
            const result = await this.pool!.query(`
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
                WHERE c.table_schema = $1 AND c.table_name = $2
                ORDER BY c.ordinal_position
            `, [schemaName, tableName])

            return result.rows.map(row => ({
                name: row.name,
                type: row.type,
                nullable: Boolean(row.nullable),
                maxLength: row.max_length ?? undefined,
                precision: row.precision ?? undefined,
                scale: row.scale ?? undefined,
                isPrimaryKey: Boolean(row.is_primary_key),
                defaultValue: row.default_value ?? undefined,
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
            // Add LIMIT clause if it's a SELECT without existing LIMIT
            let modifiedQuery = query
            const trimmedQuery = query.trim().toUpperCase()

            if (
                trimmedQuery.startsWith('SELECT') &&
                !trimmedQuery.includes(' LIMIT ')
            ) {
                modifiedQuery = `${query.trim().replace(/;?\s*$/, '')} LIMIT ${limit}`
            }

            const result = await this.pool!.query(modifiedQuery)

            // Handle SELECT queries
            if (result.rows && result.rows.length > 0) {
                const columns = result.fields.map(field => field.name)
                return {
                    columns,
                    rows: result.rows,
                    rowCount: result.rows.length,
                    affectedRows: result.rowCount ?? undefined
                }
            }

            // Handle non-SELECT queries
            return {
                columns: result.fields?.map(field => field.name) ?? [],
                rows: result.rows ?? [],
                rowCount: result.rows?.length ?? 0,
                affectedRows: result.rowCount ?? undefined
            }
        } catch (error) {
            throw new QueryError(
                `Query execution failed: ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error : undefined
            )
        }
    }
}
