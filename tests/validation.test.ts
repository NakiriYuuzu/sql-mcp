import { describe, test, expect } from 'bun:test'
import { validateQuery, sanitizeIdentifier, escapeIdentifier } from '../src/utils/validation'
import { PermissionError, ValidationError } from '../src/utils/errors'

describe('SQL Validation', () => {
    describe('validateQuery - safe mode', () => {
        const mode = 'safe'

        test('should allow SELECT queries', () => {
            expect(() => validateQuery('SELECT * FROM users', mode)).not.toThrow()
            expect(() => validateQuery('SELECT id, name FROM users WHERE id = 1', mode)).not.toThrow()
            expect(() => validateQuery('  SELECT * FROM users  ', mode)).not.toThrow()
        })

        test('should allow WITH (CTE) queries', () => {
            expect(() => validateQuery('WITH cte AS (SELECT 1) SELECT * FROM cte', mode)).not.toThrow()
        })

        test('should allow EXPLAIN queries', () => {
            expect(() => validateQuery('EXPLAIN SELECT * FROM users', mode)).not.toThrow()
        })

        test('should reject INSERT queries', () => {
            expect(() => validateQuery('INSERT INTO users (name) VALUES ("test")', mode))
                .toThrow(PermissionError)
        })

        test('should reject UPDATE queries', () => {
            expect(() => validateQuery('UPDATE users SET name = "test"', mode))
                .toThrow(PermissionError)
        })

        test('should reject DELETE queries', () => {
            expect(() => validateQuery('DELETE FROM users', mode))
                .toThrow(PermissionError)
        })

        test('should reject DDL queries', () => {
            expect(() => validateQuery('CREATE TABLE test (id INT)', mode))
                .toThrow(PermissionError)
            expect(() => validateQuery('DROP TABLE users', mode))
                .toThrow(PermissionError)
            expect(() => validateQuery('ALTER TABLE users ADD column1 INT', mode))
                .toThrow(PermissionError)
        })

        test('should reject empty queries', () => {
            expect(() => validateQuery('', mode)).toThrow(ValidationError)
            expect(() => validateQuery('   ', mode)).toThrow(ValidationError)
        })

        test('should reject SQL injection patterns', () => {
            expect(() => validateQuery('SELECT * FROM users; DROP TABLE users', mode))
                .toThrow(ValidationError)
            expect(() => validateQuery('SELECT * FROM users; DELETE FROM users', mode))
                .toThrow(ValidationError)
        })
    })

    describe('validateQuery - write mode', () => {
        const mode = 'write'

        test('should allow SELECT queries', () => {
            expect(() => validateQuery('SELECT * FROM users', mode)).not.toThrow()
        })

        test('should allow INSERT queries', () => {
            expect(() => validateQuery('INSERT INTO users (name) VALUES ("test")', mode)).not.toThrow()
        })

        test('should allow UPDATE queries', () => {
            expect(() => validateQuery('UPDATE users SET name = "test"', mode)).not.toThrow()
        })

        test('should allow DELETE queries', () => {
            expect(() => validateQuery('DELETE FROM users WHERE id = 1', mode)).not.toThrow()
        })

        test('should reject DDL queries', () => {
            expect(() => validateQuery('CREATE TABLE test (id INT)', mode))
                .toThrow(PermissionError)
            expect(() => validateQuery('DROP TABLE users', mode))
                .toThrow(PermissionError)
        })

        test('should reject SQL injection patterns', () => {
            expect(() => validateQuery('SELECT * FROM users; DROP TABLE users', mode))
                .toThrow(ValidationError)
        })
    })

    describe('validateQuery - full mode', () => {
        const mode = 'full'

        test('should allow all query types', () => {
            expect(() => validateQuery('SELECT * FROM users', mode)).not.toThrow()
            expect(() => validateQuery('INSERT INTO users (name) VALUES ("test")', mode)).not.toThrow()
            expect(() => validateQuery('UPDATE users SET name = "test"', mode)).not.toThrow()
            expect(() => validateQuery('DELETE FROM users', mode)).not.toThrow()
            expect(() => validateQuery('CREATE TABLE test (id INT)', mode)).not.toThrow()
            expect(() => validateQuery('DROP TABLE test', mode)).not.toThrow()
            expect(() => validateQuery('ALTER TABLE users ADD column1 INT', mode)).not.toThrow()
            expect(() => validateQuery('TRUNCATE TABLE users', mode)).not.toThrow()
        })

        test('should still reject empty queries', () => {
            expect(() => validateQuery('', mode)).toThrow(ValidationError)
        })
    })

    describe('sanitizeIdentifier', () => {
        test('should allow valid identifiers', () => {
            expect(sanitizeIdentifier('users')).toBe('users')
            expect(sanitizeIdentifier('user_table')).toBe('user_table')
            expect(sanitizeIdentifier('Users123')).toBe('Users123')
            expect(sanitizeIdentifier('dbo.users')).toBe('dbo.users')
        })

        test('should strip brackets and quotes', () => {
            expect(sanitizeIdentifier('[users]')).toBe('users')
            expect(sanitizeIdentifier('"users"')).toBe('users')
            expect(sanitizeIdentifier("'users'")).toBe('users')
        })

        test('should reject invalid identifiers', () => {
            expect(() => sanitizeIdentifier('users; DROP TABLE')).toThrow(ValidationError)
            expect(() => sanitizeIdentifier('users--comment')).toThrow(ValidationError)
            expect(() => sanitizeIdentifier('')).toThrow(ValidationError)
        })
    })

    describe('escapeIdentifier', () => {
        test('should escape MSSQL identifiers with brackets', () => {
            expect(escapeIdentifier('users', 'mssql')).toBe('[users]')
            expect(escapeIdentifier('dbo.users', 'mssql')).toBe('[dbo].[users]')
        })

        test('should escape PostgreSQL identifiers with quotes', () => {
            expect(escapeIdentifier('users', 'postgres')).toBe('"users"')
            expect(escapeIdentifier('public.users', 'postgres')).toBe('"public"."users"')
        })
    })
})
