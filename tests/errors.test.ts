import { describe, test, expect } from 'bun:test'
import {
    DatabaseError,
    ConnectionError,
    QueryError,
    ValidationError,
    PermissionError,
    NotConnectedError,
    formatErrorResponse,
    formatSuccessResponse
} from '../src/utils/errors'

describe('Errors', () => {
    describe('Error Classes', () => {
        test('DatabaseError should have correct properties', () => {
            const error = new DatabaseError('Test error', 'TEST_CODE')
            expect(error.message).toBe('Test error')
            expect(error.code).toBe('TEST_CODE')
            expect(error.name).toBe('DatabaseError')
            expect(error instanceof Error).toBe(true)
        })

        test('ConnectionError should have correct properties', () => {
            const originalError = new Error('Original')
            const error = new ConnectionError('Connection failed', originalError)
            expect(error.message).toBe('Connection failed')
            expect(error.code).toBe('CONNECTION_ERROR')
            expect(error.name).toBe('ConnectionError')
            expect(error.originalError).toBe(originalError)
        })

        test('QueryError should have correct properties', () => {
            const error = new QueryError('Query failed')
            expect(error.code).toBe('QUERY_ERROR')
            expect(error.name).toBe('QueryError')
        })

        test('ValidationError should have correct properties', () => {
            const error = new ValidationError('Invalid input')
            expect(error.code).toBe('VALIDATION_ERROR')
            expect(error.name).toBe('ValidationError')
        })

        test('PermissionError should have correct properties', () => {
            const error = new PermissionError('Not allowed')
            expect(error.code).toBe('PERMISSION_ERROR')
            expect(error.name).toBe('PermissionError')
        })

        test('NotConnectedError should have correct properties', () => {
            const error = new NotConnectedError()
            expect(error.code).toBe('NOT_CONNECTED')
            expect(error.name).toBe('NotConnectedError')
            expect(error.message).toContain('Not connected')
        })
    })

    describe('formatErrorResponse', () => {
        test('should format Error instance correctly', () => {
            const error = new Error('Test error')
            const response = formatErrorResponse(error)

            expect(response.isError).toBe(true)
            expect(response.content).toHaveLength(1)
            expect(response.content[0].type).toBe('text')

            const parsed = JSON.parse(response.content[0].text)
            expect(parsed.success).toBe(false)
            expect(parsed.error).toBe('Test error')
        })

        test('should format string error correctly', () => {
            const response = formatErrorResponse('String error')

            const parsed = JSON.parse(response.content[0].text)
            expect(parsed.success).toBe(false)
            expect(parsed.error).toBe('String error')
        })

        test('should format unknown error correctly', () => {
            const response = formatErrorResponse({ custom: 'error' })

            const parsed = JSON.parse(response.content[0].text)
            expect(parsed.success).toBe(false)
        })
    })

    describe('formatSuccessResponse', () => {
        test('should format success response correctly', () => {
            const response = formatSuccessResponse({
                message: 'Success',
                data: [1, 2, 3]
            })

            expect(response.content).toHaveLength(1)
            expect(response.content[0].type).toBe('text')

            const parsed = JSON.parse(response.content[0].text)
            expect(parsed.success).toBe(true)
            expect(parsed.message).toBe('Success')
            expect(parsed.data).toEqual([1, 2, 3])
        })

        test('should include success: true in response', () => {
            const response = formatSuccessResponse({})
            const parsed = JSON.parse(response.content[0].text)
            expect(parsed.success).toBe(true)
        })
    })
})
