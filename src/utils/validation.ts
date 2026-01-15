import type { QueryMode } from '../types/database'
import { PermissionError, ValidationError } from './errors'

/**
 * Patterns for read-only operations (safe mode)
 */
const SAFE_PATTERNS = [
    /^\s*SELECT\s+/i,
    /^\s*WITH\s+[\w\s,]+\s+AS\s*\(/i,
    /^\s*EXPLAIN\s+/i,
    /^\s*SHOW\s+/i,
    /^\s*DESCRIBE\s+/i,
    /^\s*DESC\s+/i
]

/**
 * Patterns for write operations (write mode)
 */
const WRITE_PATTERNS = [
    /^\s*INSERT\s+/i,
    /^\s*UPDATE\s+/i,
    /^\s*DELETE\s+/i,
    /^\s*MERGE\s+/i
]

/**
 * Patterns for DDL operations (full mode only)
 */
const DDL_PATTERNS = [
    /^\s*CREATE\s+/i,
    /^\s*ALTER\s+/i,
    /^\s*DROP\s+/i,
    /^\s*TRUNCATE\s+/i,
    /^\s*GRANT\s+/i,
    /^\s*REVOKE\s+/i,
    /^\s*EXEC\s+/i,
    /^\s*EXECUTE\s+/i
]

/**
 * Dangerous patterns that indicate potential SQL injection
 */
const INJECTION_PATTERNS = [
    /;\s*DROP\s+/i,
    /;\s*DELETE\s+/i,
    /;\s*TRUNCATE\s+/i,
    /;\s*UPDATE\s+/i,
    /;\s*INSERT\s+/i,
    /;\s*ALTER\s+/i,
    /;\s*CREATE\s+/i,
    /;\s*EXEC\s*\(/i,
    /xp_cmdshell/i,
    /sp_executesql/i
]

/**
 * Check if SQL matches any pattern in the list
 */
function matchesAnyPattern(sql: string, patterns: RegExp[]): boolean {
    return patterns.some(pattern => pattern.test(sql))
}

/**
 * Validate SQL query against the current query mode
 */
export function validateQuery(sql: string, mode: QueryMode): void {
    const trimmed = sql.trim()

    if (!trimmed) {
        throw new ValidationError('Query cannot be empty')
    }

    // Check for SQL injection patterns (always blocked except in full mode for first statement)
    if (mode !== 'full' && matchesAnyPattern(sql, INJECTION_PATTERNS)) {
        throw new ValidationError(
            'Query contains potentially dangerous patterns. ' +
            'Multi-statement queries are not allowed in this mode.'
        )
    }

    // In full mode, allow everything
    if (mode === 'full') {
        return
    }

    // Check if it's a safe read operation
    const isSafeOperation = matchesAnyPattern(trimmed, SAFE_PATTERNS)

    // In safe mode, only allow read operations
    if (mode === 'safe') {
        if (!isSafeOperation) {
            throw new PermissionError(
                'Only SELECT queries are allowed in safe mode. ' +
                'Set SQL_MCP_MODE=write or SQL_MCP_MODE=full to allow data modifications.'
            )
        }
        return
    }

    // In write mode, allow safe + write operations
    if (mode === 'write') {
        const isWriteOperation = matchesAnyPattern(trimmed, WRITE_PATTERNS)
        if (!isSafeOperation && !isWriteOperation) {
            // Check if it's a DDL operation
            if (matchesAnyPattern(trimmed, DDL_PATTERNS)) {
                throw new PermissionError(
                    'DDL operations (CREATE, ALTER, DROP) are not allowed in write mode. ' +
                    'Set SQL_MCP_MODE=full to allow schema modifications.'
                )
            }
            throw new PermissionError(
                'This operation is not allowed in write mode. ' +
                'Only SELECT, INSERT, UPDATE, DELETE are permitted.'
            )
        }
    }
}

/**
 * Validate and sanitize identifier (table/schema names)
 */
export function sanitizeIdentifier(identifier: string): string {
    // Remove any wrapping brackets or quotes first
    const cleaned = identifier.replace(/^\[|\]$|^"|"$|^'|'$/g, '')

    // Allow only alphanumeric, underscore, and dot (for schema.table)
    if (!/^[\w][\w.]*$/i.test(cleaned)) {
        throw new ValidationError(`Invalid identifier: ${identifier}`)
    }

    return cleaned
}

/**
 * Escape identifier for safe use in SQL
 */
export function escapeIdentifier(identifier: string, engine: 'mssql' | 'postgres'): string {
    const sanitized = sanitizeIdentifier(identifier)

    if (engine === 'mssql') {
        // MSSQL uses square brackets
        return sanitized.includes('.')
            ? sanitized.split('.').map(part => `[${part}]`).join('.')
            : `[${sanitized}]`
    } else {
        // PostgreSQL uses double quotes
        return sanitized.includes('.')
            ? sanitized.split('.').map(part => `"${part}"`).join('.')
            : `"${sanitized}"`
    }
}
