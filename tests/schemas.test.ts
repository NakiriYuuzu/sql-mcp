import { describe, test, expect } from 'bun:test'
import {
    ConnectDatabaseSchema,
    SwitchDatabaseSchema,
    DescribeTableSchema,
    ExecuteQuerySchema
} from '../src/schemas'

describe('Schemas', () => {
    describe('ConnectDatabaseSchema', () => {
        test('should accept valid MSSQL config', () => {
            const result = ConnectDatabaseSchema.safeParse({
                engine: 'mssql',
                server: 'localhost',
                port: 1433,
                user: 'sa',
                password: 'password123',
                database: 'master'
            })
            expect(result.success).toBe(true)
        })

        test('should accept valid PostgreSQL config', () => {
            const result = ConnectDatabaseSchema.safeParse({
                engine: 'postgres',
                server: 'localhost',
                port: 5432,
                user: 'postgres',
                password: 'password123',
                database: 'mydb'
            })
            expect(result.success).toBe(true)
        })

        test('should accept minimal config', () => {
            const result = ConnectDatabaseSchema.safeParse({
                engine: 'mssql',
                server: 'localhost'
            })
            expect(result.success).toBe(true)
        })

        test('should accept Windows Auth config', () => {
            const result = ConnectDatabaseSchema.safeParse({
                engine: 'mssql',
                server: 'localhost',
                windowsAuth: true
            })
            expect(result.success).toBe(true)
        })

        test('should accept PostgreSQL SSL config', () => {
            const result = ConnectDatabaseSchema.safeParse({
                engine: 'postgres',
                server: 'localhost',
                ssl: true
            })
            expect(result.success).toBe(true)

            const result2 = ConnectDatabaseSchema.safeParse({
                engine: 'postgres',
                server: 'localhost',
                ssl: {
                    rejectUnauthorized: false,
                    ca: '/path/to/ca.crt'
                }
            })
            expect(result2.success).toBe(true)
        })

        test('should reject invalid engine', () => {
            const result = ConnectDatabaseSchema.safeParse({
                engine: 'mysql',
                server: 'localhost'
            })
            expect(result.success).toBe(false)
        })

        test('should reject missing server', () => {
            const result = ConnectDatabaseSchema.safeParse({
                engine: 'mssql'
            })
            expect(result.success).toBe(false)
        })

        test('should reject empty server', () => {
            const result = ConnectDatabaseSchema.safeParse({
                engine: 'mssql',
                server: ''
            })
            expect(result.success).toBe(false)
        })
    })

    describe('SwitchDatabaseSchema', () => {
        test('should accept valid database name', () => {
            const result = SwitchDatabaseSchema.safeParse({
                database: 'mydb'
            })
            expect(result.success).toBe(true)
        })

        test('should reject empty database name', () => {
            const result = SwitchDatabaseSchema.safeParse({
                database: ''
            })
            expect(result.success).toBe(false)
        })

        test('should reject missing database', () => {
            const result = SwitchDatabaseSchema.safeParse({})
            expect(result.success).toBe(false)
        })
    })

    describe('DescribeTableSchema', () => {
        test('should accept table name only', () => {
            const result = DescribeTableSchema.safeParse({
                tableName: 'users'
            })
            expect(result.success).toBe(true)
        })

        test('should accept table name with schema', () => {
            const result = DescribeTableSchema.safeParse({
                tableName: 'users',
                schema: 'dbo'
            })
            expect(result.success).toBe(true)
        })

        test('should reject empty table name', () => {
            const result = DescribeTableSchema.safeParse({
                tableName: ''
            })
            expect(result.success).toBe(false)
        })
    })

    describe('ExecuteQuerySchema', () => {
        test('should accept query only', () => {
            const result = ExecuteQuerySchema.safeParse({
                query: 'SELECT * FROM users'
            })
            expect(result.success).toBe(true)
        })

        test('should accept query with limit', () => {
            const result = ExecuteQuerySchema.safeParse({
                query: 'SELECT * FROM users',
                limit: 50
            })
            expect(result.success).toBe(true)
        })

        test('should reject empty query', () => {
            const result = ExecuteQuerySchema.safeParse({
                query: ''
            })
            expect(result.success).toBe(false)
        })

        test('should reject limit over 1000', () => {
            const result = ExecuteQuerySchema.safeParse({
                query: 'SELECT * FROM users',
                limit: 1001
            })
            expect(result.success).toBe(false)
        })

        test('should reject negative limit', () => {
            const result = ExecuteQuerySchema.safeParse({
                query: 'SELECT * FROM users',
                limit: -1
            })
            expect(result.success).toBe(false)
        })

        test('should reject zero limit', () => {
            const result = ExecuteQuerySchema.safeParse({
                query: 'SELECT * FROM users',
                limit: 0
            })
            expect(result.success).toBe(false)
        })
    })
})
