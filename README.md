# @yuuzu/sql-mcp

[![CI](https://github.com/yuuzu/sql-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/yuuzu/sql-mcp/actions/workflows/ci.yml)
[![npm version](https://badge.fury.io/js/@yuuzu%2Fsql-mcp.svg)](https://www.npmjs.com/package/@yuuzu/sql-mcp)

A Model Context Protocol (MCP) server for MSSQL and PostgreSQL database operations.

## Installation

```bash
# Using bunx (recommended)
bunx @yuuzu/sql-mcp

# Using npx
npx @yuuzu/sql-mcp
```

## Features

- **Multi-database support**: MSSQL and PostgreSQL
- **8 tools** for database operations
- **Three query modes**: safe, write, full
- **Advanced authentication**: Windows Auth (MSSQL), SSL certificates (PostgreSQL)

## Tools

| Tool | Description |
|------|-------------|
| `connect-database` | Connect to a database server |
| `disconnect` | Disconnect from the current connection |
| `connection-status` | Check connection status and query mode |
| `list-databases` | List all databases on the server |
| `switch-database` | Switch to a different database |
| `list-tables` | List all tables and views |
| `describe-table` | Get table schema details |
| `execute-query` | Execute SQL queries |

## Query Modes

Control query permissions via `SQL_MCP_MODE` environment variable:

| Mode | Allowed Operations | Description |
|------|-------------------|-------------|
| `safe` (default) | SELECT, WITH, EXPLAIN | Read-only, safest |
| `write` | + INSERT, UPDATE, DELETE | Allows data modification |
| `full` | + CREATE, DROP, ALTER, TRUNCATE | Full access, use with caution |

```bash
# Example: Enable write mode
SQL_MCP_MODE=write bunx @yuuzu/sql-mcp
```

## Usage Examples

### Claude Desktop Configuration

Add to your `claude_desktop_config.json`:

```json
{
    "mcpServers": {
        "sql-mcp": {
            "command": "bunx",
            "args": ["@yuuzu/sql-mcp"],
            "env": {
                "SQL_MCP_MODE": "safe"
            }
        }
    }
}
```

### Connect to MSSQL

```json
{
    "tool": "connect-database",
    "arguments": {
        "engine": "mssql",
        "server": "localhost",
        "port": 1433,
        "user": "sa",
        "password": "your_password",
        "database": "master"
    }
}
```

### Connect to PostgreSQL

```json
{
    "tool": "connect-database",
    "arguments": {
        "engine": "postgres",
        "server": "localhost",
        "port": 5432,
        "user": "postgres",
        "password": "your_password",
        "database": "postgres"
    }
}
```

### Connect with Windows Authentication (MSSQL)

```json
{
    "tool": "connect-database",
    "arguments": {
        "engine": "mssql",
        "server": "localhost",
        "windowsAuth": true
    }
}
```

### Connect with SSL (PostgreSQL)

```json
{
    "tool": "connect-database",
    "arguments": {
        "engine": "postgres",
        "server": "your-server.com",
        "user": "postgres",
        "password": "your_password",
        "ssl": {
            "rejectUnauthorized": true,
            "ca": "/path/to/ca-certificate.crt"
        }
    }
}
```

## Development

```bash
# Install dependencies
bun install

# Run in development mode
bun run dev

# Run tests
bun test

# Run tests with coverage
bun test --coverage

# Build
bun run build

# Type check
bun run typecheck
```

## Release

Releases are automated via GitHub Actions. To create a new release:

```bash
# Create and push a version tag
git tag v1.0.0
git push origin v1.0.0
```

This will:
1. Build the project
2. Publish to npm with provenance
3. Create a GitHub Release with auto-generated release notes

**Requirements**: Set `NPM_TOKEN` secret in your GitHub repository settings.

## License

MIT
