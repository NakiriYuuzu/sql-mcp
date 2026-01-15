#!/usr/bin/env node
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { registerTools } from './tools'
import { connectionManager } from './state/connection-manager'
import { getConfig, getModeDescription } from './config'

/**
 * Main entry point for the SQL MCP Server
 */
async function main() {
    const config = getConfig()

    // Create MCP server
    const server = new McpServer({
        name: 'sql-mcp',
        version: '1.0.0'
    })

    // Register all tools
    registerTools(server)

    // Setup graceful shutdown
    const shutdown = async () => {
        console.error('[sql-mcp] Shutting down...')
        await connectionManager.disconnect()
        process.exit(0)
    }

    process.on('SIGINT', shutdown)
    process.on('SIGTERM', shutdown)

    // Handle uncaught errors
    process.on('uncaughtException', async (error) => {
        console.error('[sql-mcp] Uncaught exception:', error)
        await connectionManager.disconnect()
        process.exit(1)
    })

    process.on('unhandledRejection', async (reason) => {
        console.error('[sql-mcp] Unhandled rejection:', reason)
        await connectionManager.disconnect()
        process.exit(1)
    })

    // Log startup info to stderr (stdout is used for MCP communication)
    console.error(`[sql-mcp] Starting SQL MCP Server v1.0.0`)
    console.error(`[sql-mcp] Query mode: ${config.queryMode} (${getModeDescription(config.queryMode)})`)

    // Connect transport and start server
    const transport = new StdioServerTransport()
    await server.connect(transport)
}

main().catch((error) => {
    console.error('[sql-mcp] Fatal error:', error)
    process.exit(1)
})
