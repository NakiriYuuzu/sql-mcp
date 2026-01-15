import type { DatabaseAdapter, DatabaseEngine } from '../types/database'
import { MssqlAdapter } from './mssql'
import { PostgresAdapter } from './postgres'

/**
 * Factory function to create database adapter based on engine type
 */
export function createAdapter(engine: DatabaseEngine): DatabaseAdapter {
    switch (engine) {
        case 'mssql':
            return new MssqlAdapter()
        case 'postgres':
            return new PostgresAdapter()
        default:
            throw new Error(`Unsupported database engine: ${engine}`)
    }
}

export { MssqlAdapter } from './mssql'
export { PostgresAdapter } from './postgres'
export { BaseAdapter } from './base'
