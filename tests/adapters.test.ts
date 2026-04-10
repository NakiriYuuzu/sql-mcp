import { describe, test, expect } from 'bun:test'
import { createAdapter, MssqlAdapter, PostgresAdapter, SqliteAdapter } from '../src/adapters'
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

        test('should create SqliteAdapter for sqlite engine', () => {
            const adapter = createAdapter('sqlite')
            expect(adapter).toBeInstanceOf(SqliteAdapter)
            expect(adapter.engine).toBe('sqlite')
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

    describe('SqliteAdapter', () => {
        const isBun = typeof Bun !== 'undefined'

        test('should have correct default port', () => {
            const adapter = new SqliteAdapter()
            expect(adapter.getDefaultPort()).toBe(0)
        })

        test('should have correct default schema', () => {
            const adapter = new SqliteAdapter()
            expect(adapter.getDefaultSchema()).toBe('main')
        })

        test('should start disconnected', () => {
            const adapter = new SqliteAdapter()
            expect(adapter.isConnected).toBe(false)
            expect(adapter.currentDatabase).toBeNull()
        })

        test('should throw NotConnectedError when not connected', async () => {
            const adapter = new SqliteAdapter()
            await expect(adapter.listDatabases()).rejects.toThrow(NotConnectedError)
            await expect(adapter.listTables()).rejects.toThrow(NotConnectedError)
            await expect(adapter.describeTable('test')).rejects.toThrow(NotConnectedError)
            await expect(adapter.executeQuery('SELECT 1')).rejects.toThrow(NotConnectedError)
            await expect(adapter.switchDatabase('test')).rejects.toThrow(NotConnectedError)
        })

        test.skipIf(isBun)('should connect to an in-memory database', async () => {
            const adapter = new SqliteAdapter()
            await adapter.connect({ engine: 'sqlite', filename: ':memory:' })
            expect(adapter.isConnected).toBe(true)
            expect(adapter.currentDatabase).toBe(':memory:')
            await adapter.disconnect()
            expect(adapter.isConnected).toBe(false)
            expect(adapter.currentDatabase).toBeNull()
        })

        test.skipIf(isBun)('should reject connect without filename', async () => {
            const adapter = new SqliteAdapter()
            await expect(
                adapter.connect({ engine: 'sqlite' })
            ).rejects.toThrow(/filename/)
        })

        test.skipIf(isBun)('should throw on switchDatabase', async () => {
            const adapter = new SqliteAdapter()
            await adapter.connect({ engine: 'sqlite', filename: ':memory:' })
            await expect(adapter.switchDatabase('other')).rejects.toThrow(/does not support switching/)
            await adapter.disconnect()
        })

        test.skipIf(isBun)('should list exactly one "main" database', async () => {
            const adapter = new SqliteAdapter()
            await adapter.connect({ engine: 'sqlite', filename: ':memory:' })
            const dbs = await adapter.listDatabases()
            expect(dbs).toEqual(['main'])
            await adapter.disconnect()
        })

        test.skipIf(isBun)('should round-trip CREATE / INSERT / SELECT and list/describe', async () => {
            const adapter = new SqliteAdapter()
            await adapter.connect({ engine: 'sqlite', filename: ':memory:' })

            await adapter.executeQuery(
                'CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)'
            )

            const insertResult = await adapter.executeQuery(
                "INSERT INTO users (name) VALUES ('Alice'), ('Bob')"
            )
            expect(insertResult.affectedRows).toBe(2)

            const selectResult = await adapter.executeQuery('SELECT id, name FROM users ORDER BY id')
            expect(selectResult.rowCount).toBe(2)
            expect(selectResult.columns).toEqual(['id', 'name'])
            expect(selectResult.rows[0]).toEqual({ id: 1, name: 'Alice' })
            expect(selectResult.rows[1]).toEqual({ id: 2, name: 'Bob' })

            const tables = await adapter.listTables()
            expect(tables).toHaveLength(1)
            expect(tables[0]).toEqual({ schema: 'main', name: 'users', type: 'TABLE' })

            const columns = await adapter.describeTable('users')
            expect(columns).toHaveLength(2)
            expect(columns[0].name).toBe('id')
            expect(columns[0].isPrimaryKey).toBe(true)
            expect(columns[1].name).toBe('name')
            expect(columns[1].nullable).toBe(false)

            await adapter.disconnect()
        })

        test.skipIf(isBun)('should reject describeTable with an unsafe identifier', async () => {
            const adapter = new SqliteAdapter()
            await adapter.connect({ engine: 'sqlite', filename: ':memory:' })
            await expect(adapter.describeTable('users; DROP TABLE users')).rejects.toThrow(/Invalid/)
            await adapter.disconnect()
        })
    })
})
