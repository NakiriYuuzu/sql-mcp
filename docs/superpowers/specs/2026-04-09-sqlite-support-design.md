# SQLite Engine Support for @yuuzu/sql-mcp

**Date**: 2026-04-09
**Author**: yuuzu (brainstormed with Claude)
**Target version**: 1.2.0
**Branch**: `feat/sqlite-support`

## Summary

Add SQLite as a third supported database engine in `@yuuzu/sql-mcp`, using `better-sqlite3` so it works in both Bun and Node.js runtimes. Upgrade all production and dev dependencies to their latest versions (zod stays at v3 due to MCP SDK compatibility). Update documentation, add a CHANGELOG, and release as `1.2.0` via the existing tag-driven `release.yml` workflow.

## Goals

1. Add `sqlite` as a `DatabaseEngine` value and ship a `SqliteAdapter` that implements the same `DatabaseAdapter` contract as the existing MSSQL / PostgreSQL adapters.
2. Preserve the current "compile to mjs for non-Bun users" guarantee — the new SQLite support must work in Node.js too.
3. Harden input validation so engine-specific fields (`server` vs `filename`) are enforced at parse time instead of blowing up deep inside an adapter.
4. Allow `PRAGMA` queries in `safe` mode (they are the standard way to read SQLite metadata).
5. Upgrade every dependency to its latest version, with one hard exception: **`zod` stays locked at `^3.25.76`** for MCP SDK compatibility.
6. Ship documentation (README + CHANGELOG) so the new engine is discoverable, and release `1.2.0` through the existing tag-triggered workflow.

## Non-Goals

- **Swapping PostgreSQL to `Bun.SQL`**: already considered and rejected. The project just migrated from `pg` to `postgres.js` (commit `a89c8d0`); another swap is pure churn and would break Node compatibility.
- **Adding MySQL support**: out of scope for this release.
- **Replacing the `mssql` package**: no native Bun replacement exists; `mssql` stays.
- **Advanced SQLite features**: no `ATTACH DATABASE`, no custom functions, no extension loading. YAGNI until a real request shows up.
- **`bun:sqlite`**: explicitly rejected — it only runs in Bun, breaking the Node.js compile-to-mjs requirement. `better-sqlite3` works in both runtimes.
- **Upgrading `zod` to v4**: blocked by MCP SDK compatibility (see commits `06452b9` and `d27e5b6`).

## Design Decisions

The following decisions were locked in during brainstorming. They are listed here so that future readers understand the trade-offs and do not have to re-litigate them.

| # | Decision | Alternative considered | Why |
|---|----------|-----------------------|-----|
| 1 | Use `better-sqlite3` for SQLite | `bun:sqlite`, `node:sqlite` | `better-sqlite3` runs in both Bun and Node; ships prebuilt binaries for common platforms; mature API |
| 2 | Keep MSSQL on `mssql` and PostgreSQL on `postgres.js` | Swap PostgreSQL to `Bun.SQL` | Postgres was just migrated; swapping again is churn; would break Node compatibility |
| 3 | `ConnectionConfig.filename` is a new field (not reusing `server`) | Reuse `server` as the path | Clearer semantics; easier to add SQLite-specific options next to `filename` |
| 4 | Support `:memory:` as a valid filename | Only real files | In-memory databases are the standard SQLite testing primitive and `better-sqlite3` supports them natively |
| 5 | `ConnectionConfig.server` becomes `optional` | Keep required; make SQLite fake a value | Type honesty: SQLite genuinely has no `server`. Adapters validate what they actually need in their own `connect()` |
| 6 | `list-databases` returns `['main']` for SQLite; `switch-database` throws | Throw on both; return `[currentFilename]`; allow file swap | MCP clients often call `list-databases` after connecting — a clean empty success is friendlier than an error. `switch-database` semantics don't map to SQLite at all, so an explicit error is correct |
| 7 | Allow `PRAGMA` queries in `safe` mode | Only allow read-only PRAGMAs via whitelist; require `write`/`full` mode | `PRAGMA` is the standard way to read SQLite metadata. A whitelist is brittle and high-maintenance. `safe` mode exists to prevent accidental data loss, not to be a hardened sandbox |
| 8 | Enable WAL (`PRAGMA journal_mode = WAL`) automatically on connect | Expose as an option; leave at default | WAL is the commonly recommended mode for concurrent readers with minimal downsides. Not exposing it keeps the config surface small |
| 9 | Expose `readonly` and `fileMustExist` SQLite options; hide `timeout` | Only `filename`; full options surface | `readonly` and `fileMustExist` have real safety value (sandbox mode / typo protection). `timeout` is tuning — YAGNI |
| 10 | Input validation uses a two-layer approach: flat `inputSchema` for MCP tool discovery + `z.discriminatedUnion` for the real parse | Put the discriminated union in `inputSchema` directly | MCP `registerTool` only accepts a flat Zod raw shape for `inputSchema`; the discriminated union lives inside the handler where Zod can enforce engine-specific rules |
| 11 | Upgrade all dependencies to latest (major bumps allowed, zod excluded) | Only patch/minor; only add `better-sqlite3` | User explicitly asked for "全面升級" — we will attempt major bumps; if any produce unacceptable breaking changes we fall back to the latest compatible version. zod stays locked for SDK compatibility |
| 12 | Version bump is `1.1.1` → `1.2.0` | Patch bump; 2.0.0 | Adding a new engine is a backward-compatible new feature → MINOR per semver |
| 13 | Branch name: `feat/sqlite-support` | `feat/add-sqlite`, `feature/sqlite` | Follows `~/.claude/rules/git/pr.md` naming conventions |
| 14 | The user runs `git tag v1.2.0 && git push origin v1.2.0` themselves | Claude automates it | Safety policy: Claude does not push tags or force-push without explicit per-operation confirmation |

## Architecture

### Component Map

```
src/adapters/
├── base.ts              (unchanged)
├── index.ts             (factory: add 'sqlite' case)
├── mssql.ts             (unchanged)
├── postgres.ts          (unchanged)
└── sqlite.ts            (NEW — better-sqlite3 implementation)

src/types/database.ts    (DatabaseEngine adds 'sqlite'; ConnectionConfig adds filename/readonly/fileMustExist; server becomes optional)
src/schemas/index.ts     (ConnectDatabaseSchema becomes a z.discriminatedUnion over engine)
src/tools/index.ts       (connect-database inputSchema adds filename/readonly/fileMustExist; all engine-specific fields become optional at the flat layer)
src/utils/validation.ts  (SAFE_PATTERNS adds /^\s*PRAGMA\s+/i)
src/index.ts             (update hardcoded version string to 1.2.0)

tests/
├── adapters.test.ts         (add SQLite :memory: end-to-end smoke test)
├── schemas.test.ts          (add sqlite input validation tests)
├── validation.test.ts       (add PRAGMA safe-mode test)
└── connection-manager.test.ts (add sqlite lifecycle test)

README.md                (new SQLite section; update tools table, Query Modes section, connection examples)
CHANGELOG.md             (NEW — Keep a Changelog format)
package.json             (upgrade all deps, add better-sqlite3 + @types/better-sqlite3, bump to 1.2.0)
```

### Data Flow (unchanged from existing adapters)

```
MCP client → src/tools/index.ts (registerTool handler)
  → ConnectDatabaseSchema.parse(args)   ← discriminatedUnion enforces engine-specific fields
  → connectionManager.connect(config)
  → createAdapter(engine)                ← factory returns SqliteAdapter for 'sqlite'
  → adapter.connect(config)              ← SqliteAdapter reads config.filename, opens Database
```

## Component Design

### `src/adapters/sqlite.ts` (new file)

```ts
import Database from 'better-sqlite3'
import { BaseAdapter } from './base'
import type {
    ConnectionConfig,
    ColumnInfo,
    TableInfo,
    QueryResult,
    DatabaseEngine
} from '../types/database'
import { ConnectionError, QueryError, ValidationError } from '../utils/errors'

export class SqliteAdapter extends BaseAdapter {
    readonly engine: DatabaseEngine = 'sqlite'
    private db: Database.Database | null = null

    getDefaultPort(): number {
        return 0  // SQLite has no network port; 0 is the "not applicable" sentinel
    }

    getDefaultSchema(): string {
        return 'main'  // SQLite's default attached database name
    }

    async connect(config: ConnectionConfig): Promise<void> {
        if (!config.filename) {
            throw new ValidationError('SQLite engine requires a filename (use ":memory:" for in-memory database)')
        }

        try {
            this.db = new Database(config.filename, {
                readonly: config.readonly ?? false,
                fileMustExist: config.fileMustExist ?? false
            })

            // Enable WAL for better concurrent read performance.
            // Skip for :memory: (WAL is a no-op there) and readonly (not allowed).
            if (config.filename !== ':memory:' && !config.readonly) {
                this.db.pragma('journal_mode = WAL')
            }

            this._isConnected = true
            this._currentDatabase = config.filename
            this._config = config
        } catch (error) {
            throw new ConnectionError(
                `Failed to open SQLite database '${config.filename}': ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error : undefined
            )
        }
    }

    async disconnect(): Promise<void> {
        if (this.db) {
            this.db.close()
            this.db = null
        }
        this._isConnected = false
        this._currentDatabase = null
        this._config = null
    }

    async switchDatabase(_database: string): Promise<void> {
        this.validateConnected()
        throw new QueryError(
            'SQLite does not support switching databases. Use connect-database to open a different file.'
        )
    }

    async listDatabases(): Promise<string[]> {
        this.validateConnected()
        return ['main']  // SQLite's default schema; attaching others is out of scope
    }

    async listTables(): Promise<TableInfo[]> {
        this.validateConnected()
        try {
            const rows = this.db!.prepare(`
                SELECT name, type
                FROM sqlite_master
                WHERE type IN ('table', 'view')
                  AND name NOT LIKE 'sqlite_%'
                ORDER BY type, name
            `).all() as Array<{ name: string; type: string }>

            return rows.map(row => ({
                schema: 'main',
                name: row.name,
                type: row.type === 'table' ? 'TABLE' : 'VIEW'
            }))
        } catch (error) {
            throw new QueryError(
                `Failed to list tables: ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error : undefined
            )
        }
    }

    async describeTable(tableName: string, _schema?: string): Promise<ColumnInfo[]> {
        this.validateConnected()
        try {
            // PRAGMA table_info does not accept bound parameters, so we validate the identifier first.
            if (!/^[\w][\w.]*$/i.test(tableName)) {
                throw new ValidationError(`Invalid table name: ${tableName}`)
            }

            const rows = this.db!.prepare(`PRAGMA table_info(${tableName})`).all() as Array<{
                cid: number
                name: string
                type: string
                notnull: number
                dflt_value: string | null
                pk: number
            }>

            return rows.map(row => ({
                name: row.name,
                type: row.type,
                nullable: row.notnull === 0,
                isPrimaryKey: row.pk > 0,
                defaultValue: row.dflt_value ?? undefined
            }))
        } catch (error) {
            if (error instanceof ValidationError) throw error
            throw new QueryError(
                `Failed to describe table '${tableName}': ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error : undefined
            )
        }
    }

    async executeQuery(query: string, limit = 100): Promise<QueryResult> {
        this.validateConnected()
        try {
            const trimmed = query.trim()
            const upperTrimmed = trimmed.toUpperCase()

            const isReadQuery =
                upperTrimmed.startsWith('SELECT') ||
                upperTrimmed.startsWith('WITH') ||
                upperTrimmed.startsWith('PRAGMA')

            // Append LIMIT to SELECTs without one (not applied to PRAGMA or WITH, which have
            // their own semantics and may already include LIMIT inside CTEs).
            let modifiedQuery = trimmed
            if (
                upperTrimmed.startsWith('SELECT') &&
                !upperTrimmed.includes(' LIMIT ')
            ) {
                modifiedQuery = `${trimmed.replace(/;?\s*$/, '')} LIMIT ${limit}`
            }

            const statement = this.db!.prepare(modifiedQuery)

            if (isReadQuery) {
                const rows = statement.all() as Record<string, unknown>[]
                const columns = rows.length > 0 ? Object.keys(rows[0]) : []
                return {
                    columns,
                    rows,
                    rowCount: rows.length
                }
            } else {
                const result = statement.run()
                return {
                    columns: [],
                    rows: [],
                    rowCount: 0,
                    affectedRows: result.changes
                }
            }
        } catch (error) {
            throw new QueryError(
                `Query execution failed: ${error instanceof Error ? error.message : String(error)}`,
                error instanceof Error ? error : undefined
            )
        }
    }
}
```

### `src/types/database.ts` (updated)

```ts
export type DatabaseEngine = 'mssql' | 'postgres' | 'sqlite'

export interface ConnectionConfig {
    engine: DatabaseEngine
    server?: string        // CHANGED: now optional (SQLite has no server)
    port?: number
    database?: string

    // Standard authentication (mssql / postgres)
    user?: string
    password?: string

    // MSSQL specific options
    windowsAuth?: boolean
    encrypt?: boolean
    trustServerCertificate?: boolean

    // PostgreSQL SSL options
    ssl?: boolean | SslConfig

    // SQLite specific options (NEW)
    filename?: string
    readonly?: boolean
    fileMustExist?: boolean
}
```

`MssqlAdapter.connect()` and `PostgresAdapter.connect()` must validate `config.server` themselves and throw `ConnectionError` if it is missing. `SqliteAdapter.connect()` validates `config.filename` the same way.

### `src/schemas/index.ts` (updated)

```ts
export const MssqlConnectSchema = z.object({
    engine: z.literal('mssql'),
    server: z.string().min(1),
    port: z.number().int().positive().optional(),
    database: z.string().optional(),
    user: z.string().optional(),
    password: z.string().optional(),
    windowsAuth: z.boolean().optional(),
    encrypt: z.boolean().optional(),
    trustServerCertificate: z.boolean().optional()
})

export const PostgresConnectSchema = z.object({
    engine: z.literal('postgres'),
    server: z.string().min(1),
    port: z.number().int().positive().optional(),
    database: z.string().optional(),
    user: z.string().optional(),
    password: z.string().optional(),
    ssl: SslConfigSchema.optional()
})

export const SqliteConnectSchema = z.object({
    engine: z.literal('sqlite'),
    filename: z.string().min(1),
    readonly: z.boolean().optional(),
    fileMustExist: z.boolean().optional()
})

export const ConnectDatabaseSchema = z.discriminatedUnion('engine', [
    MssqlConnectSchema,
    PostgresConnectSchema,
    SqliteConnectSchema
])

export type ConnectDatabaseInput = z.infer<typeof ConnectDatabaseSchema>
```

### `src/tools/index.ts` (updated `connect-database` tool)

Both the flat `inputSchema` shape and the handler are updated:

- `engine` enum becomes `['mssql', 'postgres', 'sqlite']`.
- `server` becomes `.optional()` at the flat layer (real validation happens in the discriminated union).
- New optional fields: `filename`, `readonly`, `fileMustExist` (each with a descriptive Zod `.describe()`).
- Tool description mentions all three engines.

The handler body does not change structurally — it still calls `ConnectDatabaseSchema.parse(args)` then `connectionManager.connect(input)`. The only difference is that `parse()` now exercises the discriminated union and gives engine-aware error messages.

### `src/utils/validation.ts` (updated)

```ts
const SAFE_PATTERNS = [
    /^\s*SELECT\s+/i,
    /^\s*WITH\s+[\w\s,]+\s+AS\s*\(/i,
    /^\s*EXPLAIN\s+/i,
    /^\s*SHOW\s+/i,
    /^\s*DESCRIBE\s+/i,
    /^\s*DESC\s+/i,
    /^\s*PRAGMA\s+/i      // NEW
]
```

No other changes to `validation.ts`. The injection-pattern checks already exclude semicolon-prefixed write statements and continue to apply outside `full` mode.

### `src/adapters/index.ts` (factory update)

```ts
export function createAdapter(engine: DatabaseEngine): DatabaseAdapter {
    switch (engine) {
        case 'mssql':    return new MssqlAdapter()
        case 'postgres': return new PostgresAdapter()
        case 'sqlite':   return new SqliteAdapter()   // NEW
        default:
            throw new Error(`Unsupported database engine: ${engine}`)
    }
}

export { SqliteAdapter } from './sqlite'   // NEW export
```

### `src/index.ts` (version string update)

The file currently hardcodes `'1.0.0'` in two places (`McpServer` constructor and the startup log), while `package.json` says `1.1.1`. As part of the version bump, update both to `'1.2.0'`:

```ts
const server = new McpServer({
    name: 'sql-mcp',
    version: '1.2.0'
})
// ...
console.error(`[sql-mcp] Starting SQL MCP Server v1.2.0`)
```

A dynamic read from `package.json` was considered and rejected because it conflicts with `tsconfig.json`'s `rootDir: "src"` (importing `../package.json` triggers TS6059) and the alternatives (runtime `fs.readFileSync` with `import.meta.url`, or bundler-level defines) add complexity for what is a cosmetic problem. The manual version string is simple, consistent with current project style, and caught by the `chore: bump version` commit if discipline slips. Future contributors should update both `package.json` and `src/index.ts` in lockstep.

### MssqlAdapter / PostgresAdapter safety check

Since `ConnectionConfig.server` becomes optional at the type level, both existing adapters need a defensive check at the top of their `connect()`:

```ts
if (!config.server) {
    throw new ConnectionError('Server hostname is required for mssql/postgres engine')
}
```

This is one added line per adapter. No other logic changes.

## Dependency Upgrades

### Production

| Package | From | Target | Notes |
|---------|------|--------|-------|
| `@modelcontextprotocol/sdk` | ^1.25.2 | latest | Verify zod v3 is still accepted |
| `mssql` | ^12.2.0 | latest | Major bump if available |
| `postgres` | ^3.4.8 | latest | Stay within 3.x unless major release is stable |
| `zod` | ^3.25.76 | **LOCKED at ^3.x** | Do NOT upgrade to v4 |
| `better-sqlite3` | — | latest ^11.x | NEW |

### Development

| Package | From | Target | Notes |
|---------|------|--------|-------|
| `@types/bun` | latest | latest | Keep as `latest` |
| `@types/mssql` | ^9.1.8 | latest | Major bump allowed |
| `typescript` | ^5.9.3 | latest | Latest stable 5.x |
| `@types/better-sqlite3` | — | latest ^7.x | NEW |

### Fallback policy

If a major bump produces a breaking change that would require more than a few lines of fix, pause implementation and check in with the user before continuing. Do not swallow breakages silently.

## Testing Plan

All tests run with `bun test` and require no external database (SQLite `:memory:` is sufficient for adapter tests; the other adapters already have unit tests that mock the driver layer).

### `tests/adapters.test.ts` (new cases)

1. `SqliteAdapter` with `:memory:` full lifecycle:
   - `connect({ engine: 'sqlite', filename: ':memory:' })`
   - `executeQuery('CREATE TABLE users (id INTEGER PRIMARY KEY, name TEXT NOT NULL)')`
   - `executeQuery("INSERT INTO users (name) VALUES ('Alice'), ('Bob')")` → `affectedRows === 2`
   - `executeQuery('SELECT * FROM users')` → `rowCount === 2`, `columns === ['id', 'name']`
   - `listTables()` → includes `users`
   - `describeTable('users')` → `id` is primary key, `name` is non-nullable
   - `disconnect()` → `isConnected === false`

### `tests/schemas.test.ts` (new cases)

1. `ConnectDatabaseSchema.parse({ engine: 'sqlite', filename: ':memory:' })` succeeds.
2. `ConnectDatabaseSchema.parse({ engine: 'sqlite' })` fails (missing `filename`).
3. `ConnectDatabaseSchema.parse({ engine: 'sqlite', filename: '' })` fails (`min(1)`).
4. `ConnectDatabaseSchema.parse({ engine: 'mssql', filename: 'x' })` fails (`server` required).
5. `ConnectDatabaseSchema.parse({ engine: 'postgres', server: 'localhost' })` still succeeds (unchanged behavior).

### `tests/validation.test.ts` (new cases)

1. `validateQuery('PRAGMA table_info(users)', 'safe')` does not throw.
2. `validateQuery('PRAGMA journal_mode = WAL', 'safe')` does not throw (per decision #7).
3. Existing `safe` / `write` / `full` mode tests still pass unchanged.

### `tests/connection-manager.test.ts` (new cases)

1. `connectionManager.connect({ engine: 'sqlite', filename: ':memory:' })` then `getConnectionState()` returns `isConnected: true, engine: 'sqlite'`.
2. Switching from a live MSSQL mock connection to SQLite disconnects the first adapter cleanly.

### Existing tests

All existing tests must continue to pass. The `discriminatedUnion` change to `ConnectDatabaseSchema` preserves backward compatibility for the `mssql` and `postgres` variants, so existing schema tests should require no edits.

## Documentation Updates

### README.md

1. **Features section**: change `Multi-database support: MSSQL and PostgreSQL` to `Multi-database support: MSSQL, PostgreSQL, and SQLite`.
2. **Tools table**: no structural change; tools apply to all engines.
3. **New SQLite connection example** added under existing connection examples:

    ```json
    {
        "tool": "connect-database",
        "arguments": {
            "engine": "sqlite",
            "filename": "/path/to/database.db"
        }
    }
    ```
    Plus a second example using `":memory:"` and a third showing `readonly: true`.
4. **Query Modes section**: add a note that `PRAGMA` queries are allowed in `safe` mode for metadata introspection.
5. **Installation note**: mention that `better-sqlite3` ships prebuilt binaries but may require build tools on exotic platforms.

### CHANGELOG.md (new file)

Follows Keep a Changelog format per `~/.claude/rules/git/changelog.md`. Initial entry for 1.2.0 plus back-filled entries for prior versions derived from `git log`:

```markdown
# Changelog

All notable changes to this project will be documented in this file.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.2.0] - 2026-04-09

### 🚀 Features
- Add SQLite engine support via `better-sqlite3` (works in both Bun and Node.js)
- Allow `PRAGMA` queries in `safe` mode for SQLite metadata introspection

### ♻️ Refactoring
- Use `z.discriminatedUnion` for engine-specific connection validation
- Sync hardcoded version string in `src/index.ts` with `package.json` (was drifting)

### 📦 Dependencies
- Upgrade all dependencies to latest compatible versions
- `zod` locked at v3 for MCP SDK compatibility
- Add `better-sqlite3` and `@types/better-sqlite3`

## [1.1.1] - earlier
- Bump version; revert zod to v3 for MCP SDK compatibility

## [1.1.0] - earlier
- Migrate PostgreSQL client from `pg` to `postgres.js`
- Fix CI badge URL and add repository field for npm provenance
```

(Exact older dates backfilled from `git log` during implementation.)

## Release Flow

### Commit plan (on `feat/sqlite-support`)

Each commit follows `~/.claude/rules/git/commit.md` (conventional commits + `Co-Authored-By: Yuuzu <yuuzu@yuuzu.net>`, no AI co-authors). Order is chosen so that each commit leaves the tree in a buildable, type-checking state.

1. `deps: 📦 upgrade all dependencies and add better-sqlite3`
   - Upgrades `@modelcontextprotocol/sdk`, `mssql`, `postgres`, `@types/mssql`, `typescript` to latest; zod stays at v3
   - Adds `better-sqlite3` + `@types/better-sqlite3`
   - Updates `bun.lock`
2. `refactor(schemas): ♻️ use discriminatedUnion for engine-specific validation`
   - `DatabaseEngine` adds `'sqlite'`
   - `ConnectionConfig.server` → optional; adds `filename`/`readonly`/`fileMustExist`
   - `ConnectDatabaseSchema` becomes a discriminated union
   - Adds defensive `if (!config.server)` checks in `MssqlAdapter.connect()` and `PostgresAdapter.connect()`
   - Updates `connect-database` flat `inputSchema` (server optional; new SQLite fields)
3. `feat(validation): 🚀 allow PRAGMA queries in safe mode`
   - Adds `/^\s*PRAGMA\s+/i` to `SAFE_PATTERNS`
4. `feat(sqlite): 🚀 add SQLite adapter using better-sqlite3`
   - New `src/adapters/sqlite.ts`
   - `createAdapter` factory adds `'sqlite'` case; exports `SqliteAdapter`
5. `test: ✅ add SQLite adapter, schema, and PRAGMA tests`
6. `docs: 📚 update README with SQLite examples and PRAGMA note`
7. `docs: 📚 add CHANGELOG.md`
8. `chore: 🧹 bump version to 1.2.0`
   - Updates `package.json` version
   - Updates hardcoded version string in `src/index.ts` (both constructor and startup log)

### Pull Request

- Title: `feat(sqlite): 🚀 add SQLite engine support`
- Base: `main`
- Body follows `~/.claude/rules/git/pr.md` template (Summary / Changes / Test Plan)
- CI (`ci.yml`) must pass: `test`, `build`, `typecheck`

### Tagging & Publishing (user runs these)

After merging the PR to `main`, the user runs:

```bash
git checkout main
git pull origin main
git tag v1.2.0
git push origin v1.2.0
```

`release.yml` detects the `v*` tag push, builds, and runs `npm publish --provenance --access public` + creates a GitHub Release. Requires `NPM_TOKEN` secret (already configured).

**Claude does not run these commands.** They are listed as copy-paste instructions for the user per the safety policy against automating tag pushes.

## Error Handling

| Scenario | Behavior |
|----------|----------|
| Connect with `engine: 'sqlite'` but no `filename` | Zod rejects at `ConnectDatabaseSchema.parse()` with a clear engine-specific message |
| `fileMustExist: true` and the file does not exist | `better-sqlite3` throws; wrapped in `ConnectionError` with the filename |
| `readonly: true` combined with `INSERT`/`UPDATE` via `execute-query` | SQLite throws at `.run()`; wrapped in `QueryError` |
| `switch-database` called on SQLite | `QueryError` with guidance to use `connect-database` instead |
| `describe-table` with an identifier containing non-word characters | `ValidationError` before the PRAGMA runs (since PRAGMA does not accept bind parameters) |
| Native module load failure (`better-sqlite3` prebuilt not available for platform) | Fails at import time before `main()` runs; user sees the native-module error directly. Documented in README |

## Open Questions

None. All design decisions were resolved during brainstorming (see the Decisions table above).

## Success Criteria

- [ ] `bun test` passes with all new tests
- [ ] `bun run typecheck` passes with no errors
- [ ] `bun run build` produces `dist/index.js` that starts under both `bun dist/index.js` and `node dist/index.js`
- [ ] Connecting to a SQLite `:memory:` database via the `connect-database` tool works end-to-end
- [ ] `PRAGMA table_info(...)` executes in `safe` mode
- [ ] `SQL_MCP_MODE=safe` still blocks `INSERT` / `UPDATE` / `DELETE` on SQLite
- [ ] README documents the new engine with connection examples
- [ ] CHANGELOG.md exists and has a 1.2.0 entry
- [ ] `package.json` version is `1.2.0`
- [ ] PR is green and merged to `main`
- [ ] User has the exact tag commands ready to run
