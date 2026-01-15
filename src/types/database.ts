/**
 * Database engine types supported by this MCP server
 */
export type DatabaseEngine = 'mssql' | 'postgres'

/**
 * Query mode determines what SQL operations are allowed
 */
export type QueryMode = 'safe' | 'write' | 'full'

/**
 * SSL configuration for PostgreSQL connections
 */
export interface SslConfig {
    rejectUnauthorized?: boolean
    cert?: string
    key?: string
    ca?: string
}

/**
 * Connection configuration for database adapters
 */
export interface ConnectionConfig {
    engine: DatabaseEngine
    server: string
    port?: number
    database?: string

    // Standard authentication
    user?: string
    password?: string

    // MSSQL specific options
    windowsAuth?: boolean
    encrypt?: boolean
    trustServerCertificate?: boolean

    // PostgreSQL SSL options
    ssl?: boolean | SslConfig
}

/**
 * Information about a database column
 */
export interface ColumnInfo {
    name: string
    type: string
    nullable: boolean
    maxLength?: number
    precision?: number
    scale?: number
    isPrimaryKey: boolean
    defaultValue?: string
    comment?: string
}

/**
 * Information about a database table or view
 */
export interface TableInfo {
    schema: string
    name: string
    type: 'TABLE' | 'VIEW'
}

/**
 * Result of a SQL query execution
 */
export interface QueryResult {
    columns: string[]
    rows: Record<string, unknown>[]
    rowCount: number
    affectedRows?: number
}

/**
 * Database adapter interface - all adapters must implement this
 */
export interface DatabaseAdapter {
    readonly engine: DatabaseEngine
    readonly isConnected: boolean
    readonly currentDatabase: string | null

    connect(config: ConnectionConfig): Promise<void>
    disconnect(): Promise<void>
    switchDatabase(database: string): Promise<void>
    listDatabases(): Promise<string[]>
    listTables(): Promise<TableInfo[]>
    describeTable(tableName: string, schema?: string): Promise<ColumnInfo[]>
    executeQuery(sql: string, limit?: number): Promise<QueryResult>
}
