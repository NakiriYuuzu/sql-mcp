import { BaseAdapter } from './base'
import type {
    ConnectionConfig,
    ColumnInfo,
    TableInfo,
    QueryResult,
    DatabaseEngine
} from '../types/database'
import { ConnectionError, QueryError, ValidationError } from '../utils/errors'

type BetterSqlite3Module = typeof import('better-sqlite3')

// Lazy-loaded better-sqlite3 constructor. Loaded on first connect() call.
// Must be dynamic because better-sqlite3 is a native module that fails under Bun.
let DatabaseConstructor: BetterSqlite3Module | null = null

/**
 * SQLite database adapter implementation using better-sqlite3.
 * https://github.com/WiseLibs/better-sqlite3
 *
 * The native module is loaded dynamically on first connect() to avoid crashing
 * Bun processes that never use SQLite (e.g. MSSQL/PostgreSQL users).
 * SQLite support requires Node.js runtime.
 */
export class SqliteAdapter extends BaseAdapter {
    readonly engine: DatabaseEngine = 'sqlite'
    private db: import('better-sqlite3').Database | null = null

    getDefaultPort(): number {
        return 0
    }

    getDefaultSchema(): string {
        return 'main'
    }

    async connect(config: ConnectionConfig): Promise<void> {
        if (!config.filename) {
            throw new ConnectionError(
                'SQLite engine requires a filename (use ":memory:" for an in-memory database)'
            )
        }

        // Lazy-load the native module
        if (!DatabaseConstructor) {
            try {
                const mod = await import('better-sqlite3')
                DatabaseConstructor = (mod.default ?? mod) as BetterSqlite3Module
            } catch (error) {
                throw new ConnectionError(
                    'SQLite support requires Node.js runtime. ' +
                    'better-sqlite3 is not available in the current runtime (Bun is not supported). ' +
                    'Use npx or node to run this MCP server if you need SQLite.',
                    error instanceof Error ? error : undefined
                )
            }
        }

        try {
            this.db = new DatabaseConstructor!(config.filename, {
                readonly: config.readonly ?? false,
                fileMustExist: config.fileMustExist ?? false
            })

            if (config.filename !== ':memory:' && !config.readonly) {
                this.db.pragma('journal_mode = WAL')
            }

            this._isConnected = true
            this._currentDatabase = config.filename
            this._config = config
        } catch (error) {
            this.db = null
            throw new ConnectionError(
                `Failed to open SQLite database '${config.filename}': ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error : undefined
            )
        }
    }

    async disconnect(): Promise<void> {
        if (this.db) {
            this.db.close()
            this.db = null
        }
        this._isConnected = false
        this._currentDatabase = null
        this._config = null
    }

    async switchDatabase(_database: string): Promise<void> {
        this.validateConnected()
        throw new QueryError(
            'SQLite does not support switching databases. Use connect-database to open a different file.'
        )
    }

    async listDatabases(): Promise<string[]> {
        this.validateConnected()
        return ['main']
    }

    async listTables(): Promise<TableInfo[]> {
        this.validateConnected()

        try {
            const rows = this.db!
                .prepare(
                    `SELECT name, type
                     FROM sqlite_master
                     WHERE type IN ('table', 'view')
                       AND name NOT LIKE 'sqlite_%'
                     ORDER BY type, name`
                )
                .all() as Array<{ name: string; type: string }>

            return rows.map(row => ({
                schema: 'main',
                name: row.name,
                type: row.type === 'table' ? 'TABLE' : 'VIEW'
            }))
        } catch (error) {
            throw new QueryError(
                `Failed to list tables: ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error : undefined
            )
        }
    }

    async describeTable(tableName: string, _schema?: string): Promise<ColumnInfo[]> {
        this.validateConnected()

        if (!/^[\w][\w.]*$/i.test(tableName)) {
            throw new ValidationError(`Invalid table name: ${tableName}`)
        }

        try {
            interface PragmaRow {
                cid: number
                name: string
                type: string
                notnull: number
                dflt_value: string | null
                pk: number
            }
            const rows = this.db!
                .prepare(`PRAGMA table_info(${tableName})`)
                .all() as PragmaRow[]

            return rows.map(row => ({
                name: row.name,
                type: row.type,
                nullable: row.notnull === 0,
                isPrimaryKey: row.pk > 0,
                defaultValue: row.dflt_value ?? undefined
            }))
        } catch (error) {
            if (error instanceof ValidationError) throw error
            throw new QueryError(
                `Failed to describe table '${tableName}': ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error : undefined
            )
        }
    }

    async executeQuery(query: string, limit = 100): Promise<QueryResult> {
        this.validateConnected()

        try {
            const trimmed = query.trim()
            const upperTrimmed = trimmed.toUpperCase()

            const isReadQuery =
                upperTrimmed.startsWith('SELECT') ||
                upperTrimmed.startsWith('WITH') ||
                upperTrimmed.startsWith('PRAGMA') ||
                upperTrimmed.startsWith('EXPLAIN')

            let modifiedQuery = trimmed
            if (
                upperTrimmed.startsWith('SELECT') &&
                !upperTrimmed.includes(' LIMIT ')
            ) {
                modifiedQuery = `${trimmed.replace(/;?\s*$/, '')} LIMIT ${limit}`
            }

            const statement = this.db!.prepare(modifiedQuery)

            if (isReadQuery) {
                const rows = statement.all() as Record<string, unknown>[]
                const columns = rows.length > 0 ? Object.keys(rows[0]) : []
                return {
                    columns,
                    rows,
                    rowCount: rows.length
                }
            }

            const result = statement.run()
            return {
                columns: [],
                rows: [],
                rowCount: 0,
                affectedRows: result.changes
            }
        } catch (error) {
            throw new QueryError(
                `Query execution failed: ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error : undefined
            )
        }
    }
}
