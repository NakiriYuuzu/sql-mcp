import { describe, test, expect, beforeEach } from 'bun:test'
import { connectionManager } from '../src/state/connection-manager'
import { NotConnectedError } from '../src/utils/errors'

describe('ConnectionManager', () => {
    beforeEach(async () => {
        // Ensure disconnected state before each test
        await connectionManager.disconnect()
    })

    describe('getConnectionState', () => {
        test('should return disconnected state initially', () => {
            const state = connectionManager.getConnectionState()
            expect(state.isConnected).toBe(false)
            expect(state.engine).toBeNull()
            expect(state.database).toBeNull()
            expect(state.server).toBeNull()
        })
    })

    describe('isConnected', () => {
        test('should return false when not connected', () => {
            expect(connectionManager.isConnected).toBe(false)
        })
    })

    describe('getAdapter', () => {
        test('should throw NotConnectedError when not connected', () => {
            expect(() => connectionManager.getAdapter()).toThrow(NotConnectedError)
        })
    })

    describe('disconnect', () => {
        test('should be safe to call when not connected', async () => {
            await expect(connectionManager.disconnect()).resolves.toBeUndefined()
        })

        test('should be idempotent', async () => {
            await connectionManager.disconnect()
            await connectionManager.disconnect()
            expect(connectionManager.isConnected).toBe(false)
        })
    })

    describe('operations without connection', () => {
        test('listDatabases should throw NotConnectedError', async () => {
            await expect(connectionManager.listDatabases()).rejects.toThrow(NotConnectedError)
        })

        test('listTables should throw NotConnectedError', async () => {
            await expect(connectionManager.listTables()).rejects.toThrow(NotConnectedError)
        })

        test('describeTable should throw NotConnectedError', async () => {
            await expect(connectionManager.describeTable('test')).rejects.toThrow(NotConnectedError)
        })

        test('executeQuery should throw NotConnectedError', async () => {
            await expect(connectionManager.executeQuery('SELECT 1')).rejects.toThrow(NotConnectedError)
        })

        test('switchDatabase should throw NotConnectedError', async () => {
            await expect(connectionManager.switchDatabase('test')).rejects.toThrow(NotConnectedError)
        })
    })

    describe('sqlite integration', () => {
        const isBun = typeof Bun !== 'undefined'

        test.skipIf(isBun)('should connect to an in-memory SQLite database and round-trip a query', async () => {
            await connectionManager.connect({ engine: 'sqlite', filename: ':memory:' })

            const state = connectionManager.getConnectionState()
            expect(state.isConnected).toBe(true)
            expect(state.engine).toBe('sqlite')
            expect(state.database).toBe(':memory:')

            const dbs = await connectionManager.listDatabases()
            expect(dbs).toEqual(['main'])

            await connectionManager.executeQuery('CREATE TABLE t (id INTEGER PRIMARY KEY, v TEXT)')
            await connectionManager.executeQuery("INSERT INTO t (v) VALUES ('hello')")
            const result = await connectionManager.executeQuery('SELECT * FROM t')
            expect(result.rowCount).toBe(1)
            expect(result.rows[0]).toEqual({ id: 1, v: 'hello' })

            await connectionManager.disconnect()
            expect(connectionManager.isConnected).toBe(false)
        })
    })
})
