import type {
    ConnectionConfig,
    DatabaseAdapter,
    DatabaseEngine,
    ColumnInfo,
    TableInfo,
    QueryResult
} from '../types/database'
import { NotConnectedError } from '../utils/errors'

/**
 * Abstract base class for database adapters
 * Provides common functionality and enforces interface contract
 */
export abstract class BaseAdapter implements DatabaseAdapter {
    abstract readonly engine: DatabaseEngine

    protected _isConnected = false
    protected _currentDatabase: string | null = null
    protected _config: ConnectionConfig | null = null

    get isConnected(): boolean {
        return this._isConnected
    }

    get currentDatabase(): string | null {
        return this._currentDatabase
    }

    /**
     * Validate that adapter is connected before operations
     */
    protected validateConnected(): void {
        if (!this._isConnected) {
            throw new NotConnectedError()
        }
    }

    /**
     * Get default port for this database engine
     */
    abstract getDefaultPort(): number

    /**
     * Get default schema for this database engine
     */
    abstract getDefaultSchema(): string

    abstract connect(config: ConnectionConfig): Promise<void>
    abstract disconnect(): Promise<void>
    abstract switchDatabase(database: string): Promise<void>
    abstract listDatabases(): Promise<string[]>
    abstract listTables(): Promise<TableInfo[]>
    abstract describeTable(tableName: string, schema?: string): Promise<ColumnInfo[]>
    abstract executeQuery(sql: string, limit?: number): Promise<QueryResult>
}
