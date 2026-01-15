import { describe, test, expect } from 'bun:test'
import { createAdapter, MssqlAdapter, PostgresAdapter } from '../src/adapters'
import { NotConnectedError } from '../src/utils/errors'

describe('Adapters', () => {
    describe('createAdapter', () => {
        test('should create MssqlAdapter for mssql engine', () => {
            const adapter = createAdapter('mssql')
            expect(adapter).toBeInstanceOf(MssqlAdapter)
            expect(adapter.engine).toBe('mssql')
        })

        test('should create PostgresAdapter for postgres engine', () => {
            const adapter = createAdapter('postgres')
            expect(adapter).toBeInstanceOf(PostgresAdapter)
            expect(adapter.engine).toBe('postgres')
        })

        test('should throw for unsupported engine', () => {
            expect(() => createAdapter('mysql' as any)).toThrow('Unsupported database engine')
        })
    })

    describe('MssqlAdapter', () => {
        test('should have correct default port', () => {
            const adapter = new MssqlAdapter()
            expect(adapter.getDefaultPort()).toBe(1433)
        })

        test('should have correct default schema', () => {
            const adapter = new MssqlAdapter()
            expect(adapter.getDefaultSchema()).toBe('dbo')
        })

        test('should start disconnected', () => {
            const adapter = new MssqlAdapter()
            expect(adapter.isConnected).toBe(false)
            expect(adapter.currentDatabase).toBeNull()
        })

        test('should throw NotConnectedError when not connected', async () => {
            const adapter = new MssqlAdapter()
            await expect(adapter.listDatabases()).rejects.toThrow(NotConnectedError)
            await expect(adapter.listTables()).rejects.toThrow(NotConnectedError)
            await expect(adapter.describeTable('test')).rejects.toThrow(NotConnectedError)
            await expect(adapter.executeQuery('SELECT 1')).rejects.toThrow(NotConnectedError)
            await expect(adapter.switchDatabase('test')).rejects.toThrow(NotConnectedError)
        })
    })

    describe('PostgresAdapter', () => {
        test('should have correct default port', () => {
            const adapter = new PostgresAdapter()
            expect(adapter.getDefaultPort()).toBe(5432)
        })

        test('should have correct default schema', () => {
            const adapter = new PostgresAdapter()
            expect(adapter.getDefaultSchema()).toBe('public')
        })

        test('should start disconnected', () => {
            const adapter = new PostgresAdapter()
            expect(adapter.isConnected).toBe(false)
            expect(adapter.currentDatabase).toBeNull()
        })

        test('should throw NotConnectedError when not connected', async () => {
            const adapter = new PostgresAdapter()
            await expect(adapter.listDatabases()).rejects.toThrow(NotConnectedError)
            await expect(adapter.listTables()).rejects.toThrow(NotConnectedError)
            await expect(adapter.describeTable('test')).rejects.toThrow(NotConnectedError)
            await expect(adapter.executeQuery('SELECT 1')).rejects.toThrow(NotConnectedError)
        })
    })
})
