import type { DatabaseAdapter, ConnectionConfig, DatabaseEngine } from '../types/database'
import { createAdapter } from '../adapters'
import { NotConnectedError } from '../utils/errors'

/**
 * Connection state information
 */
export interface ConnectionState {
    isConnected: boolean
    engine: DatabaseEngine | null
    database: string | null
    server: string | null
}

/**
 * Singleton class to manage database connection state
 * Only one connection can be active at a time
 */
class ConnectionManager {
    private adapter: DatabaseAdapter | null = null
    private serverAddress: string | null = null

    /**
     * Get the current adapter (throws if not connected)
     */
    getAdapter(): DatabaseAdapter {
        if (!this.adapter || !this.adapter.isConnected) {
            throw new NotConnectedError()
        }
        return this.adapter
    }

    /**
     * Check if currently connected
     */
    get isConnected(): boolean {
        return this.adapter?.isConnected ?? false
    }

    /**
     * Get current connection state
     */
    getConnectionState(): ConnectionState {
        if (!this.adapter || !this.adapter.isConnected) {
            return {
                isConnected: false,
                engine: null,
                database: null,
                server: null
            }
        }

        return {
            isConnected: true,
            engine: this.adapter.engine,
            database: this.adapter.currentDatabase,
            server: this.serverAddress
        }
    }

    /**
     * Connect to a database
     * Disconnects any existing connection first
     */
    async connect(config: ConnectionConfig): Promise<void> {
        // Disconnect existing connection if any
        if (this.adapter?.isConnected) {
            await this.disconnect()
        }

        // Create new adapter and connect
        this.adapter = createAdapter(config.engine)
        await this.adapter.connect(config)
        this.serverAddress = config.server
    }

    /**
     * Disconnect from the database
     */
    async disconnect(): Promise<void> {
        if (this.adapter) {
            try {
                await this.adapter.disconnect()
            } finally {
                this.adapter = null
                this.serverAddress = null
            }
        }
    }

    /**
     * Switch to a different database
     */
    async switchDatabase(database: string): Promise<void> {
        const adapter = this.getAdapter()
        await adapter.switchDatabase(database)
    }

    /**
     * List all databases
     */
    async listDatabases(): Promise<string[]> {
        const adapter = this.getAdapter()
        return adapter.listDatabases()
    }

    /**
     * List all tables in current database
     */
    async listTables() {
        const adapter = this.getAdapter()
        return adapter.listTables()
    }

    /**
     * Describe a table's schema
     */
    async describeTable(tableName: string, schema?: string) {
        const adapter = this.getAdapter()
        return adapter.describeTable(tableName, schema)
    }

    /**
     * Execute a SQL query
     */
    async executeQuery(sql: string, limit?: number) {
        const adapter = this.getAdapter()
        return adapter.executeQuery(sql, limit)
    }
}

/**
 * Singleton instance of ConnectionManager
 */
export const connectionManager = new ConnectionManager()
