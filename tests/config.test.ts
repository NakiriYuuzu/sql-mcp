import { describe, test, expect, afterEach } from 'bun:test'
import { loadConfig, getModeDescription } from '../src/config'

describe('Config', () => {
    const originalEnv = process.env.SQL_MCP_MODE

    afterEach(() => {
        // Restore original environment
        if (originalEnv === undefined) {
            delete process.env.SQL_MCP_MODE
        } else {
            process.env.SQL_MCP_MODE = originalEnv
        }
    })

    describe('loadConfig', () => {
        test('should default to safe mode when no env var', () => {
            delete process.env.SQL_MCP_MODE
            const config = loadConfig()
            expect(config.queryMode).toBe('safe')
        })

        test('should parse safe mode', () => {
            process.env.SQL_MCP_MODE = 'safe'
            const config = loadConfig()
            expect(config.queryMode).toBe('safe')
        })

        test('should parse write mode', () => {
            process.env.SQL_MCP_MODE = 'write'
            const config = loadConfig()
            expect(config.queryMode).toBe('write')
        })

        test('should parse full mode', () => {
            process.env.SQL_MCP_MODE = 'full'
            const config = loadConfig()
            expect(config.queryMode).toBe('full')
        })

        test('should be case insensitive', () => {
            process.env.SQL_MCP_MODE = 'WRITE'
            const config = loadConfig()
            expect(config.queryMode).toBe('write')

            process.env.SQL_MCP_MODE = 'Full'
            const config2 = loadConfig()
            expect(config2.queryMode).toBe('full')
        })

        test('should default to safe for invalid values', () => {
            process.env.SQL_MCP_MODE = 'invalid'
            const config = loadConfig()
            expect(config.queryMode).toBe('safe')

            process.env.SQL_MCP_MODE = ''
            const config2 = loadConfig()
            expect(config2.queryMode).toBe('safe')
        })
    })

    describe('getModeDescription', () => {
        test('should return correct description for safe mode', () => {
            const desc = getModeDescription('safe')
            expect(desc).toContain('Read-only')
            expect(desc).toContain('SELECT')
        })

        test('should return correct description for write mode', () => {
            const desc = getModeDescription('write')
            expect(desc).toContain('Read/Write')
        })

        test('should return correct description for full mode', () => {
            const desc = getModeDescription('full')
            expect(desc).toContain('Full access')
        })
    })
})
