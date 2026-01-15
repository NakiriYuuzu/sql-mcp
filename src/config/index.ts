import type { QueryMode } from '../types/database'

/**
 * Application configuration loaded from environment variables
 */
export interface AppConfig {
    queryMode: QueryMode
}

/**
 * Parse query mode from environment variable
 */
function parseQueryMode(value: string | undefined): QueryMode {
    const mode = value?.toLowerCase()
    if (mode === 'write' || mode === 'full') {
        return mode
    }
    return 'safe' // default
}

/**
 * Load configuration from environment variables
 */
export function loadConfig(): AppConfig {
    return {
        queryMode: parseQueryMode(process.env.SQL_MCP_MODE)
    }
}

/**
 * Singleton config instance
 */
let configInstance: AppConfig | null = null

/**
 * Get the application configuration (lazy loaded singleton)
 */
export function getConfig(): AppConfig {
    if (!configInstance) {
        configInstance = loadConfig()
    }
    return configInstance
}

/**
 * Get human-readable description of allowed operations for current mode
 */
export function getModeDescription(mode: QueryMode): string {
    switch (mode) {
        case 'safe':
            return 'Read-only (SELECT, WITH, EXPLAIN)'
        case 'write':
            return 'Read/Write (SELECT, INSERT, UPDATE, DELETE)'
        case 'full':
            return 'Full access (all SQL operations including DDL)'
    }
}
