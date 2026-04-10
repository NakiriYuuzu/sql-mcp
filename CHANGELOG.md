# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-04-10

### 🚀 Features
- Add SQLite engine support via `better-sqlite3` (requires Node.js runtime)
- Allow `PRAGMA` queries in `safe` mode for SQLite metadata introspection

### ♻️ Refactoring
- Use `z.discriminatedUnion` for engine-specific connection validation
- `ConnectionConfig.server` is now optional; adapters validate it in their own `connect()`

### 📦 Dependencies
- Upgrade `@modelcontextprotocol/sdk`, `mssql`, `postgres`, `typescript`, `@types/mssql` to latest
- Add `better-sqlite3` and `@types/better-sqlite3`
- `zod` locked at `^3.x` for MCP SDK compatibility

## [1.1.1] - 2026-01-15

### 🐛 Bug Fixes
- Revert `zod` to v3 for MCP SDK compatibility

## [1.1.0] - 2026-01-15

### ♻️ Refactoring
- Migrate PostgreSQL client from `pg` to `postgres.js`

### 👷 CI
- Fix GitHub CI badge URL
- Add `repository` field for npm provenance
