import type { DatabaseAdapter, DatabaseEngine } from '../types/database'
import { MssqlAdapter } from './mssql'
import { PostgresAdapter } from './postgres'
import { SqliteAdapter } from './sqlite'

/**
 * Factory function to create database adapter based on engine type
 */
export function createAdapter(engine: DatabaseEngine): DatabaseAdapter {
    switch (engine) {
        case 'mssql':
            return new MssqlAdapter()
        case 'postgres':
            return new PostgresAdapter()
        case 'sqlite':
            return new SqliteAdapter()
        default:
            throw new Error(`Unsupported database engine: ${engine}`)
    }
}

export { MssqlAdapter } from './mssql'
export { PostgresAdapter } from './postgres'
export { SqliteAdapter } from './sqlite'
export { BaseAdapter } from './base'
