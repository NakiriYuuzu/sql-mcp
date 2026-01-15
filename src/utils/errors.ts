/**
 * Base class for database-related errors
 */
export class DatabaseError extends Error {
    constructor(
        message: string,
        public readonly code?: string,
        public readonly originalError?: Error
    ) {
        super(message)
        this.name = 'DatabaseError'
    }
}

/**
 * Error thrown when connection fails
 */
export class ConnectionError extends DatabaseError {
    constructor(message: string, originalError?: Error) {
        super(message, 'CONNECTION_ERROR', originalError)
        this.name = 'ConnectionError'
    }
}

/**
 * Error thrown when query execution fails
 */
export class QueryError extends DatabaseError {
    constructor(message: string, originalError?: Error) {
        super(message, 'QUERY_ERROR', originalError)
        this.name = 'QueryError'
    }
}

/**
 * Error thrown when input validation fails
 */
export class ValidationError extends DatabaseError {
    constructor(message: string) {
        super(message, 'VALIDATION_ERROR')
        this.name = 'ValidationError'
    }
}

/**
 * Error thrown when operation is not allowed in current mode
 */
export class PermissionError extends DatabaseError {
    constructor(message: string) {
        super(message, 'PERMISSION_ERROR')
        this.name = 'PermissionError'
    }
}

/**
 * Error thrown when not connected to database
 */
export class NotConnectedError extends DatabaseError {
    constructor() {
        super('Not connected to database. Use connect-database first.', 'NOT_CONNECTED')
        this.name = 'NotConnectedError'
    }
}

/**
 * Format error for MCP tool response
 */
export function formatErrorResponse(error: unknown): {
    content: Array<{ type: 'text'; text: string }>
    isError: true
} {
    const message = error instanceof Error ? error.message : String(error)
    return {
        content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: false, error: message }, null, 2)
        }],
        isError: true
    }
}

/**
 * Format success response for MCP tool
 */
export function formatSuccessResponse(data: unknown): {
    content: Array<{ type: 'text'; text: string }>
} {
    return {
        content: [{
            type: 'text' as const,
            text: JSON.stringify({ success: true, ...data as object }, null, 2)
        }]
    }
}
