# SQLite Engine Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add SQLite as a third engine in `@yuuzu/sql-mcp` using `better-sqlite3` (cross-runtime), refactor schema validation to a discriminated union, allow `PRAGMA` in safe mode, upgrade dependencies (zod locked at v3), update docs, and release `1.2.0` through the existing tag-driven workflow.

**Architecture:** Add `SqliteAdapter` alongside the existing `MssqlAdapter` and `PostgresAdapter`, sharing the `DatabaseAdapter` interface. Replace the flat `ConnectDatabaseSchema` with a `z.discriminatedUnion` over `engine` so engine-specific required fields (`server` for mssql/postgres, `filename` for sqlite) are enforced at parse time. `ConnectionConfig.server` becomes optional; existing adapters gain a defensive check.

**Tech Stack:** TypeScript, Bun, `@modelcontextprotocol/sdk`, `zod` v3 (locked), `mssql`, `postgres.js`, `better-sqlite3` (new), `bun:test`.

**Baseline (before starting):** `bun test` reports 83 pass / 0 fail across 6 files. The plan adds tests; total must be higher and still 0 fail at every checkpoint.

**Branch:** `feat/sqlite-support` (already created, currently contains only the design spec commit).

**Deviation from spec:** The spec's commit plan had tests in a separate commit 5. This plan interleaves tests with their features (pure TDD) to keep every commit in a passing state, collapsing to 7 commits total. All other spec decisions are preserved.

---

## Task 1: Baseline verification

**Files:**
- None — read-only

- [ ] **Step 1: Confirm clean branch state**

  Run:
  ```bash
  git status
  git log --oneline -5
  ```

  Expected:
  - Working tree clean on `feat/sqlite-support`
  - HEAD is `docs(spec): 📚 add SQLite support design spec for 1.2.0`

- [ ] **Step 2: Run baseline tests**

  Run:
  ```bash
  bun test
  ```

  Expected: `83 pass / 0 fail / 144 expect() calls / Ran 83 tests across 6 files.`

- [ ] **Step 3: Run baseline typecheck**

  Run:
  ```bash
  bun run typecheck
  ```

  Expected: exits with code 0, no output.

- [ ] **Step 4: Run baseline build**

  Run:
  ```bash
  bun run build
  ```

  Expected: produces `dist/index.js` starting with `#!/usr/bin/env node`. Build succeeds.

---

## Task 2: Upgrade dependencies and add better-sqlite3

**Files:**
- Modify: `package.json`
- Modify: `bun.lock`

- [ ] **Step 1: Survey current outdated dependencies**

  Run:
  ```bash
  bun outdated
  ```

  Expected: a table listing current vs latest. Note any major-version jumps for later inspection.

- [ ] **Step 2: Upgrade production dependencies (zod excluded)**

  Run:
  ```bash
  bun add @modelcontextprotocol/sdk@latest mssql@latest postgres@latest
  ```

  Expected: lockfile updates; no errors. **Do NOT upgrade `zod`** — it must stay at `^3.x` for MCP SDK compatibility (see commits `06452b9` and `d27e5b6`).

- [ ] **Step 3: Upgrade dev dependencies**

  Run:
  ```bash
  bun add --dev typescript@latest @types/mssql@latest
  ```

  Expected: lockfile updates; no errors. `@types/bun` stays pinned to `latest` (its existing version identifier).

- [ ] **Step 4: Add better-sqlite3 and its type declarations**

  Run:
  ```bash
  bun add better-sqlite3
  bun add --dev @types/better-sqlite3
  ```

  Expected: both installed. `better-sqlite3` will download a prebuilt binary for the host platform — if the download fails, stop the plan and report the error (native build tools may be required).

- [ ] **Step 5: Re-run baseline checks**

  Run:
  ```bash
  bun test
  bun run typecheck
  bun run build
  ```

  Expected:
  - `bun test`: still `83 pass / 0 fail`
  - `bun run typecheck`: exits clean
  - `bun run build`: produces `dist/index.js`

  If any check fails after a major-version upgrade, roll back that specific dependency to the previous major and re-run. Report which dependency was incompatible before continuing.

- [ ] **Step 6: Commit**

  Run:
  ```bash
  git add package.json bun.lock
  git commit -m "$(cat <<'EOF'
  deps: 📦 upgrade dependencies and add better-sqlite3

  - Upgrade @modelcontextprotocol/sdk, mssql, postgres, typescript, @types/mssql to latest
  - Add better-sqlite3 and @types/better-sqlite3 for the upcoming SQLite adapter
  - zod stays locked at ^3.x for MCP SDK compatibility

  Co-Authored-By: Yuuzu <yuuzu@yuuzu.net>
  EOF
  )"
  ```

---

## Task 3: Add failing schema tests for SQLite discriminated union

**Files:**
- Modify: `tests/schemas.test.ts`

- [ ] **Step 1: Add failing test cases to `tests/schemas.test.ts`**

  Locate the existing `describe('ConnectDatabaseSchema', () => { ... })` block (starts at line 10). After the existing `test('should reject empty server', ...)` test (ends near line 92), and **inside** the same `describe` block, add these tests immediately before its closing `})`:

  ```ts
          test('should accept SQLite config with filename', () => {
              const result = ConnectDatabaseSchema.safeParse({
                  engine: 'sqlite',
                  filename: '/tmp/test.db'
              })
              expect(result.success).toBe(true)
          })

          test('should accept SQLite config with :memory:', () => {
              const result = ConnectDatabaseSchema.safeParse({
                  engine: 'sqlite',
                  filename: ':memory:'
              })
              expect(result.success).toBe(true)
          })

          test('should accept SQLite config with readonly and fileMustExist', () => {
              const result = ConnectDatabaseSchema.safeParse({
                  engine: 'sqlite',
                  filename: '/tmp/test.db',
                  readonly: true,
                  fileMustExist: true
              })
              expect(result.success).toBe(true)
          })

          test('should reject SQLite config without filename', () => {
              const result = ConnectDatabaseSchema.safeParse({
                  engine: 'sqlite'
              })
              expect(result.success).toBe(false)
          })

          test('should reject SQLite config with empty filename', () => {
              const result = ConnectDatabaseSchema.safeParse({
                  engine: 'sqlite',
                  filename: ''
              })
              expect(result.success).toBe(false)
          })
  ```

- [ ] **Step 2: Run the new tests and verify they fail**

  Run:
  ```bash
  bun test tests/schemas.test.ts
  ```

  Expected: the five new tests fail. The first three (`should accept SQLite ...`) fail because the schema rejects `engine: 'sqlite'`. The last two (`should reject SQLite ...`) also fail — they pass `engine: 'sqlite'`, but the current schema fails for the wrong reason (invalid engine), not for the expected reason. Either way, the test suite reports failures. Record the exact failure count to compare against Task 6.

  **Do not commit yet** — the implementation will come in Tasks 4–6, then we commit them together.

---

## Task 4: Update `DatabaseEngine` type and `ConnectionConfig` interface

**Files:**
- Modify: `src/types/database.ts`

- [ ] **Step 1: Update `DatabaseEngine` to include `'sqlite'`**

  Edit `src/types/database.ts` line 4. Replace:
  ```ts
  export type DatabaseEngine = 'mssql' | 'postgres'
  ```
  with:
  ```ts
  export type DatabaseEngine = 'mssql' | 'postgres' | 'sqlite'
  ```

- [ ] **Step 2: Update `ConnectionConfig` interface**

  In the same file, replace the entire `ConnectionConfig` interface (lines 23–41):
  ```ts
  export interface ConnectionConfig {
      engine: DatabaseEngine
      server: string
      port?: number
      database?: string

      // Standard authentication
      user?: string
      password?: string

      // MSSQL specific options
      windowsAuth?: boolean
      encrypt?: boolean
      trustServerCertificate?: boolean

      // PostgreSQL SSL options
      ssl?: boolean | SslConfig
  }
  ```
  with:
  ```ts
  export interface ConnectionConfig {
      engine: DatabaseEngine
      /**
       * Server hostname. Required for mssql and postgres engines; unused for sqlite.
       * Adapters validate presence in their own `connect()`.
       */
      server?: string
      port?: number
      database?: string

      // Standard authentication
      user?: string
      password?: string

      // MSSQL specific options
      windowsAuth?: boolean
      encrypt?: boolean
      trustServerCertificate?: boolean

      // PostgreSQL SSL options
      ssl?: boolean | SslConfig

      // SQLite specific options
      /** File path or `:memory:` for an in-memory database. */
      filename?: string
      /** Open the database in read-only mode. */
      readonly?: boolean
      /** Throw if the database file does not already exist (prevents accidental creation). */
      fileMustExist?: boolean
  }
  ```

- [ ] **Step 3: Run typecheck**

  Run:
  ```bash
  bun run typecheck
  ```

  Expected: **errors** from `src/adapters/mssql.ts` and `src/adapters/postgres.ts` because they pass `config.server` (now possibly `undefined`) to drivers that require a string. Record the exact errors; they are expected and will be fixed in Task 5.

---

## Task 5: Add defensive `server` check in MssqlAdapter and PostgresAdapter

**Files:**
- Modify: `src/adapters/mssql.ts`
- Modify: `src/adapters/postgres.ts`

- [ ] **Step 1: Add defensive check to `MssqlAdapter.connect()`**

  Edit `src/adapters/mssql.ts`. Inside the `connect()` method, locate the `try {` block (line 28). Insert a check as the **first statement inside the try block** so it runs before any config manipulation:

  Before:
  ```ts
      async connect(config: ConnectionConfig): Promise<void> {
          try {
              const sqlConfig: sql.config = {
                  server: config.server,
                  port: config.port ?? this.getDefaultPort(),
  ```

  After:
  ```ts
      async connect(config: ConnectionConfig): Promise<void> {
          try {
              if (!config.server) {
                  throw new ConnectionError('server is required for the mssql engine')
              }
              const sqlConfig: sql.config = {
                  server: config.server,
                  port: config.port ?? this.getDefaultPort(),
  ```

- [ ] **Step 2: Add defensive check to `PostgresAdapter.connect()`**

  Edit `src/adapters/postgres.ts`. Inside `connect()`, locate the `try {` block (around line 30). Insert the check as the first statement inside the try block:

  Before:
  ```ts
      async connect(config: ConnectionConfig): Promise<void> {
          try {
              const sslConfig = this.buildSslConfig(config.ssl)

              this.sql = postgres({
                  host: config.server,
  ```

  After:
  ```ts
      async connect(config: ConnectionConfig): Promise<void> {
          try {
              if (!config.server) {
                  throw new ConnectionError('server is required for the postgres engine')
              }
              const sslConfig = this.buildSslConfig(config.ssl)

              this.sql = postgres({
                  host: config.server,
  ```

- [ ] **Step 3: Run typecheck**

  Run:
  ```bash
  bun run typecheck
  ```

  Expected: exits clean. The adapter bodies now treat `config.server` as narrowed-to-string after the check, satisfying the drivers' type requirements.

- [ ] **Step 4: Run full test suite**

  Run:
  ```bash
  bun test
  ```

  Expected: the 5 new SQLite schema tests from Task 3 still fail (schemas not yet updated); all other tests pass. Specifically the existing `should reject missing server` test for MSSQL continues to pass because the discriminated union is not yet in place and `server: z.string().min(1)` still applies.

---

## Task 6: Refactor `ConnectDatabaseSchema` to a discriminated union

**Files:**
- Modify: `src/schemas/index.ts`

- [ ] **Step 1: Replace `ConnectDatabaseSchema`**

  Edit `src/schemas/index.ts`. Replace the entire current `ConnectDatabaseSchema` definition (lines 27–55):
  ```ts
  /**
   * Schema for connect-database tool input
   */
  export const ConnectDatabaseSchema = z.object({
      engine: DatabaseEngineSchema
          .describe('Database engine type: mssql or postgres'),
      server: z.string().min(1)
          .describe('Server hostname or IP address'),
      port: z.number().int().positive().optional()
          .describe('Port number (default: 1433 for MSSQL, 5432 for PostgreSQL)'),
      database: z.string().optional()
          .describe('Initial database to connect to'),

      // Standard authentication
      user: z.string().optional()
          .describe('Username for authentication'),
      password: z.string().optional()
          .describe('Password for authentication'),

      // MSSQL specific options
      windowsAuth: z.boolean().optional()
          .describe('Use Windows Authentication (MSSQL only)'),
      encrypt: z.boolean().optional()
          .describe('Enable encryption (default: true)'),
      trustServerCertificate: z.boolean().optional()
          .describe('Trust server certificate without validation'),

      // PostgreSQL SSL options
      ssl: SslConfigSchema.optional()
          .describe('SSL configuration (PostgreSQL only)')
  })
  ```
  with:
  ```ts
  /**
   * Schema for MSSQL connection input
   */
  export const MssqlConnectSchema = z.object({
      engine: z.literal('mssql'),
      server: z.string().min(1)
          .describe('Server hostname or IP address'),
      port: z.number().int().positive().optional()
          .describe('Port number (default: 1433)'),
      database: z.string().optional()
          .describe('Initial database to connect to'),
      user: z.string().optional()
          .describe('Username for SQL Server authentication'),
      password: z.string().optional()
          .describe('Password for SQL Server authentication'),
      windowsAuth: z.boolean().optional()
          .describe('Use Windows Authentication'),
      encrypt: z.boolean().optional()
          .describe('Enable encryption (default: true)'),
      trustServerCertificate: z.boolean().optional()
          .describe('Trust server certificate without validation')
  })

  /**
   * Schema for PostgreSQL connection input
   */
  export const PostgresConnectSchema = z.object({
      engine: z.literal('postgres'),
      server: z.string().min(1)
          .describe('Server hostname or IP address'),
      port: z.number().int().positive().optional()
          .describe('Port number (default: 5432)'),
      database: z.string().optional()
          .describe('Initial database to connect to'),
      user: z.string().optional()
          .describe('Username for authentication'),
      password: z.string().optional()
          .describe('Password for authentication'),
      ssl: SslConfigSchema.optional()
          .describe('SSL configuration')
  })

  /**
   * Schema for SQLite connection input
   */
  export const SqliteConnectSchema = z.object({
      engine: z.literal('sqlite'),
      filename: z.string().min(1)
          .describe('File path for the SQLite database. Use ":memory:" for an in-memory database.'),
      readonly: z.boolean().optional()
          .describe('Open the database in read-only mode'),
      fileMustExist: z.boolean().optional()
          .describe('Throw if the database file does not already exist')
  })

  /**
   * Schema for connect-database tool input.
   * Discriminated union on `engine` enforces engine-specific required fields at parse time.
   */
  export const ConnectDatabaseSchema = z.discriminatedUnion('engine', [
      MssqlConnectSchema,
      PostgresConnectSchema,
      SqliteConnectSchema
  ])
  ```

  `DatabaseEngineSchema` (line 6) and `SslConfigSchema` (lines 11–23) stay unchanged and are still exported.

- [ ] **Step 2: Run schema tests**

  Run:
  ```bash
  bun test tests/schemas.test.ts
  ```

  Expected: all tests pass — including the 5 new SQLite tests from Task 3 and the existing mssql/postgres tests. The discriminated union preserves backward-compatibility because every existing test's input has a valid `engine` field that selects the matching variant.

- [ ] **Step 3: Run full typecheck**

  Run:
  ```bash
  bun run typecheck
  ```

  Expected: exits clean. The `ConnectDatabaseInput` type (line 88) is now a discriminated union and Tools code still only uses the discriminator + fields that exist on each variant.

---

## Task 7: Update `connect-database` tool `inputSchema`

**Files:**
- Modify: `src/tools/index.ts`

- [ ] **Step 1: Update the flat `inputSchema` on the `connect-database` tool**

  Edit `src/tools/index.ts`. Locate the `connect-database` registration (starts at line 19). Replace the entire `inputSchema: { ... }` object (lines 24–43) with this expanded version:

  Before:
  ```ts
              inputSchema: {
                  engine: z.enum(['mssql', 'postgres']).describe('Database engine type'),
                  server: z.string().describe('Server hostname or IP address'),
                  port: z.number().optional().describe('Port number'),
                  database: z.string().optional().describe('Initial database to connect to'),
                  user: z.string().optional().describe('Username for authentication'),
                  password: z.string().optional().describe('Password for authentication'),
                  windowsAuth: z.boolean().optional().describe('Use Windows Authentication (MSSQL only)'),
                  encrypt: z.boolean().optional().describe('Enable encryption (default: true)'),
                  trustServerCertificate: z.boolean().optional().describe('Trust server certificate'),
                  ssl: z.union([
                      z.boolean(),
                      z.object({
                          rejectUnauthorized: z.boolean().optional(),
                          cert: z.string().optional(),
                          key: z.string().optional(),
                          ca: z.string().optional()
                      })
                  ]).optional().describe('SSL configuration (PostgreSQL only)')
              }
  ```

  After:
  ```ts
              inputSchema: {
                  engine: z.enum(['mssql', 'postgres', 'sqlite']).describe('Database engine type'),
                  server: z.string().optional().describe('Server hostname or IP address (mssql, postgres)'),
                  port: z.number().optional().describe('Port number'),
                  database: z.string().optional().describe('Initial database to connect to (mssql, postgres)'),
                  user: z.string().optional().describe('Username for authentication (mssql, postgres)'),
                  password: z.string().optional().describe('Password for authentication (mssql, postgres)'),
                  windowsAuth: z.boolean().optional().describe('Use Windows Authentication (mssql only)'),
                  encrypt: z.boolean().optional().describe('Enable encryption (mssql only, default: true)'),
                  trustServerCertificate: z.boolean().optional().describe('Trust server certificate (mssql only)'),
                  ssl: z.union([
                      z.boolean(),
                      z.object({
                          rejectUnauthorized: z.boolean().optional(),
                          cert: z.string().optional(),
                          key: z.string().optional(),
                          ca: z.string().optional()
                      })
                  ]).optional().describe('SSL configuration (postgres only)'),
                  filename: z.string().optional().describe('File path for SQLite, or ":memory:" for in-memory (sqlite only)'),
                  readonly: z.boolean().optional().describe('Open SQLite database in read-only mode (sqlite only)'),
                  fileMustExist: z.boolean().optional().describe('Throw if SQLite file does not exist (sqlite only)')
              }
  ```

  Key changes:
  - `engine` enum gains `'sqlite'`
  - `server` becomes `.optional()` (still validated per-engine by the discriminated union)
  - Three new SQLite fields: `filename`, `readonly`, `fileMustExist`
  - Descriptions clarify which engine each field applies to

- [ ] **Step 2: Update the tool description**

  On line 23 (`description: 'Connect to a database server ...'`), replace:
  ```ts
              description: 'Connect to a database server (MSSQL or PostgreSQL). Disconnects any existing connection first.',
  ```
  with:
  ```ts
              description: 'Connect to a database server (MSSQL, PostgreSQL, or SQLite). Disconnects any existing connection first.',
  ```

- [ ] **Step 3: Run full tests and typecheck**

  Run:
  ```bash
  bun test
  bun run typecheck
  ```

  Expected:
  - `bun test`: 88 pass / 0 fail (baseline 83 + 5 new schema tests from Task 3)
  - `bun run typecheck`: exits clean

- [ ] **Step 4: Commit Tasks 3–7 together as the schema refactor**

  Run:
  ```bash
  git add src/types/database.ts src/schemas/index.ts src/tools/index.ts \
          src/adapters/mssql.ts src/adapters/postgres.ts tests/schemas.test.ts
  git commit -m "$(cat <<'EOF'
  refactor(schemas): ♻️ use discriminatedUnion for engine-specific validation

  - Add 'sqlite' to DatabaseEngine type
  - Make ConnectionConfig.server optional; add SQLite fields (filename, readonly, fileMustExist)
  - Split ConnectDatabaseSchema into MssqlConnectSchema, PostgresConnectSchema, SqliteConnectSchema and combine them with z.discriminatedUnion so engine-specific required fields are enforced at parse time
  - Add defensive server checks in MssqlAdapter.connect() and PostgresAdapter.connect() to satisfy the narrowed-optional config
  - Expand connect-database tool flat inputSchema with SQLite fields and clarify per-engine applicability in descriptions
  - Add schema tests for valid and invalid SQLite inputs

  Co-Authored-By: Yuuzu <yuuzu@yuuzu.net>
  EOF
  )"
  ```

---

## Task 8: Add failing PRAGMA safe-mode test

**Files:**
- Modify: `tests/validation.test.ts`

- [ ] **Step 1: Add a failing PRAGMA test block**

  Edit `tests/validation.test.ts`. Inside the existing `describe('validateQuery - safe mode', () => { ... })` block (starts at line 6), **before** its closing `})` (line 58), append these tests:

  ```ts
          test('should allow PRAGMA table_info (SQLite metadata read)', () => {
              expect(() => validateQuery('PRAGMA table_info(users)', mode)).not.toThrow()
              expect(() => validateQuery('  PRAGMA table_info(users)  ', mode)).not.toThrow()
              expect(() => validateQuery('pragma foreign_key_list(users)', mode)).not.toThrow()
          })

          test('should allow PRAGMA setting read (e.g., journal_mode)', () => {
              expect(() => validateQuery('PRAGMA journal_mode', mode)).not.toThrow()
              expect(() => validateQuery('PRAGMA foreign_keys', mode)).not.toThrow()
          })
  ```

- [ ] **Step 2: Verify the tests fail**

  Run:
  ```bash
  bun test tests/validation.test.ts
  ```

  Expected: the two new tests fail with `PermissionError` ("Only SELECT queries are allowed in safe mode") — the current `SAFE_PATTERNS` list has no PRAGMA entry.

---

## Task 9: Allow PRAGMA in safe mode

**Files:**
- Modify: `src/utils/validation.ts`

- [ ] **Step 1: Add PRAGMA to `SAFE_PATTERNS`**

  Edit `src/utils/validation.ts`. Replace the current `SAFE_PATTERNS` array (lines 7–14):

  Before:
  ```ts
  const SAFE_PATTERNS = [
      /^\s*SELECT\s+/i,
      /^\s*WITH\s+[\w\s,]+\s+AS\s*\(/i,
      /^\s*EXPLAIN\s+/i,
      /^\s*SHOW\s+/i,
      /^\s*DESCRIBE\s+/i,
      /^\s*DESC\s+/i
  ]
  ```

  After:
  ```ts
  const SAFE_PATTERNS = [
      /^\s*SELECT\s+/i,
      /^\s*WITH\s+[\w\s,]+\s+AS\s*\(/i,
      /^\s*EXPLAIN\s+/i,
      /^\s*SHOW\s+/i,
      /^\s*DESCRIBE\s+/i,
      /^\s*DESC\s+/i,
      /^\s*PRAGMA\s+/i
  ]
  ```

- [ ] **Step 2: Verify tests pass**

  Run:
  ```bash
  bun test tests/validation.test.ts
  ```

  Expected: all validation tests pass, including the two new PRAGMA tests.

- [ ] **Step 3: Run full suite**

  Run:
  ```bash
  bun test
  bun run typecheck
  ```

  Expected:
  - `bun test`: 90 pass / 0 fail (88 + 2 new PRAGMA tests)
  - `bun run typecheck`: exits clean

- [ ] **Step 4: Commit**

  Run:
  ```bash
  git add src/utils/validation.ts tests/validation.test.ts
  git commit -m "$(cat <<'EOF'
  feat(validation): 🚀 allow PRAGMA queries in safe mode

  PRAGMA is SQLite's standard mechanism for reading schema metadata (e.g. PRAGMA table_info, PRAGMA foreign_key_list). It is read-only in the vast majority of cases, so allowing it in safe mode is consistent with the 'avoid accidental data loss' intent of that mode without requiring a whitelist.

  Co-Authored-By: Yuuzu <yuuzu@yuuzu.net>
  EOF
  )"
  ```

---

## Task 10: Add failing SqliteAdapter basic-property tests

**Files:**
- Modify: `tests/adapters.test.ts`

- [ ] **Step 1: Import and add SqliteAdapter tests**

  Edit `tests/adapters.test.ts`. Change the import on line 2:

  Before:
  ```ts
  import { createAdapter, MssqlAdapter, PostgresAdapter } from '../src/adapters'
  ```

  After:
  ```ts
  import { createAdapter, MssqlAdapter, PostgresAdapter, SqliteAdapter } from '../src/adapters'
  ```

  Update the `createAdapter` describe block to add an assertion for `'sqlite'`. Locate lines 13–17:

  Before:
  ```ts
          test('should create PostgresAdapter for postgres engine', () => {
              const adapter = createAdapter('postgres')
              expect(adapter).toBeInstanceOf(PostgresAdapter)
              expect(adapter.engine).toBe('postgres')
          })
  ```

  After:
  ```ts
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
  ```

  Then, add a new `describe('SqliteAdapter', ...)` block immediately before the final closing `})` of the top-level `describe('Adapters', ...)`. Append this block (after the existing `PostgresAdapter` block):

  ```ts
      describe('SqliteAdapter', () => {
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

          test('should connect to an in-memory database', async () => {
              const adapter = new SqliteAdapter()
              await adapter.connect({ engine: 'sqlite', filename: ':memory:' })
              expect(adapter.isConnected).toBe(true)
              expect(adapter.currentDatabase).toBe(':memory:')
              await adapter.disconnect()
              expect(adapter.isConnected).toBe(false)
              expect(adapter.currentDatabase).toBeNull()
          })

          test('should reject connect without filename', async () => {
              const adapter = new SqliteAdapter()
              await expect(
                  adapter.connect({ engine: 'sqlite' })
              ).rejects.toThrow(/filename/)
          })

          test('should throw on switchDatabase', async () => {
              const adapter = new SqliteAdapter()
              await adapter.connect({ engine: 'sqlite', filename: ':memory:' })
              await expect(adapter.switchDatabase('other')).rejects.toThrow(/does not support switching/)
              await adapter.disconnect()
          })

          test('should list exactly one "main" database', async () => {
              const adapter = new SqliteAdapter()
              await adapter.connect({ engine: 'sqlite', filename: ':memory:' })
              const dbs = await adapter.listDatabases()
              expect(dbs).toEqual(['main'])
              await adapter.disconnect()
          })

          test('should round-trip CREATE / INSERT / SELECT and list/describe', async () => {
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

          test('should reject describeTable with an unsafe identifier', async () => {
              const adapter = new SqliteAdapter()
              await adapter.connect({ engine: 'sqlite', filename: ':memory:' })
              await expect(adapter.describeTable('users; DROP TABLE users')).rejects.toThrow(/Invalid/)
              await adapter.disconnect()
          })

          test('should honor readonly mode', async () => {
              const adapter = new SqliteAdapter()
              await adapter.connect({ engine: 'sqlite', filename: ':memory:', readonly: true })
              await expect(
                  adapter.executeQuery('CREATE TABLE x (id INTEGER)')
              ).rejects.toThrow()
              await adapter.disconnect()
          })
      })
  ```

- [ ] **Step 2: Verify tests fail for the expected reason**

  Run:
  ```bash
  bun test tests/adapters.test.ts
  ```

  Expected: compile error — `SqliteAdapter` is not exported from `../src/adapters`. If the test file compiles at all, every `SqliteAdapter` test fails because the class does not yet exist. Do not commit yet.

---

## Task 11: Create the `SqliteAdapter` class

**Files:**
- Create: `src/adapters/sqlite.ts`

- [ ] **Step 1: Create the adapter file**

  Create `src/adapters/sqlite.ts` with the complete implementation:

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

  /**
   * SQLite database adapter implementation using better-sqlite3.
   * https://github.com/WiseLibs/better-sqlite3
   *
   * Unlike the client-server adapters, SQLite operates on a single file
   * (or `:memory:` for an in-memory database). There is no network concept,
   * so `server`/`port`/`user`/`password` are unused and `list-databases`
   * always returns `['main']` — SQLite's default attached schema name.
   */
  export class SqliteAdapter extends BaseAdapter {
      readonly engine: DatabaseEngine = 'sqlite'
      private db: Database.Database | null = null

      getDefaultPort(): number {
          return 0 // SQLite has no network port; 0 is the "not applicable" sentinel
      }

      getDefaultSchema(): string {
          return 'main' // SQLite's default attached-database name
      }

      async connect(config: ConnectionConfig): Promise<void> {
          if (!config.filename) {
              throw new ConnectionError(
                  'SQLite engine requires a filename (use ":memory:" for an in-memory database)'
              )
          }

          try {
              this.db = new Database(config.filename, {
                  readonly: config.readonly ?? false,
                  fileMustExist: config.fileMustExist ?? false
              })

              // Enable WAL mode for better concurrent-read performance on real files.
              // WAL is not applicable to in-memory databases and not allowed in readonly mode.
              if (config.filename !== ':memory:' && !config.readonly) {
                  this.db.pragma('journal_mode = WAL')
              }

              this._isConnected = true
              this._currentDatabase = config.filename
              this._config = config
          } catch (error) {
              this.db = null
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
          return ['main']
      }

      async listTables(): Promise<TableInfo[]> {
          this.validateConnected()

          try {
              const rows = this.db!
                  .prepare(
                      `SELECT name, type
                       FROM sqlite_master
                       WHERE type IN ('table', 'view')
                         AND name NOT LIKE 'sqlite_%'
                       ORDER BY type, name`
                  )
                  .all() as Array<{ name: string; type: string }>

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

          // PRAGMA table_info does not accept bound parameters, so we must validate
          // the identifier before interpolating it into the statement.
          if (!/^[\w][\w.]*$/i.test(tableName)) {
              throw new ValidationError(`Invalid table name: ${tableName}`)
          }

          try {
              interface PragmaRow {
                  cid: number
                  name: string
                  type: string
                  notnull: number
                  dflt_value: string | null
                  pk: number
              }
              const rows = this.db!
                  .prepare(`PRAGMA table_info(${tableName})`)
                  .all() as PragmaRow[]

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
                  upperTrimmed.startsWith('PRAGMA') ||
                  upperTrimmed.startsWith('EXPLAIN')

              // Append LIMIT to bare SELECTs. PRAGMA / WITH / EXPLAIN are left alone:
              // PRAGMA syntax does not accept LIMIT, WITH CTEs may already include LIMIT
              // inside the query body, and EXPLAIN is metadata.
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
              }

              const result = statement.run()
              return {
                  columns: [],
                  rows: [],
                  rowCount: 0,
                  affectedRows: result.changes
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

- [ ] **Step 2: Verify the file typechecks in isolation**

  Run:
  ```bash
  bun run typecheck
  ```

  Expected: **errors** from `tests/adapters.test.ts` because `SqliteAdapter` is still not exported through `../src/adapters` index. Those are fixed in Task 12. The `src/adapters/sqlite.ts` file itself typechecks cleanly.

---

## Task 12: Wire SQLite into the adapter factory

**Files:**
- Modify: `src/adapters/index.ts`

- [ ] **Step 1: Add SQLite to factory and exports**

  Replace the entire file `src/adapters/index.ts`:

  Before:
  ```ts
  import type { DatabaseAdapter, DatabaseEngine } from '../types/database'
  import { MssqlAdapter } from './mssql'
  import { PostgresAdapter } from './postgres'

  /**
   * Factory function to create database adapter based on engine type
   */
  export function createAdapter(engine: DatabaseEngine): DatabaseAdapter {
      switch (engine) {
          case 'mssql':
              return new MssqlAdapter()
          case 'postgres':
              return new PostgresAdapter()
          default:
              throw new Error(`Unsupported database engine: ${engine}`)
      }
  }

  export { MssqlAdapter } from './mssql'
  export { PostgresAdapter } from './postgres'
  export { BaseAdapter } from './base'
  ```

  After:
  ```ts
  import type { DatabaseAdapter, DatabaseEngine } from '../types/database'
  import { MssqlAdapter } from './mssql'
  import { PostgresAdapter } from './postgres'
  import { SqliteAdapter } from './sqlite'

  /**
   * Factory function to create database adapter based on engine type
   */
  export function createAdapter(engine: DatabaseEngine): DatabaseAdapter {
      switch (engine) {
          case 'mssql':
              return new MssqlAdapter()
          case 'postgres':
              return new PostgresAdapter()
          case 'sqlite':
              return new SqliteAdapter()
          default:
              throw new Error(`Unsupported database engine: ${engine}`)
      }
  }

  export { MssqlAdapter } from './mssql'
  export { PostgresAdapter } from './postgres'
  export { SqliteAdapter } from './sqlite'
  export { BaseAdapter } from './base'
  ```

- [ ] **Step 2: Run the full test suite**

  Run:
  ```bash
  bun test
  bun run typecheck
  ```

  Expected:
  - `bun test`: all SqliteAdapter tests from Task 10 pass. Total: 90 + 12 new adapter tests = 102 pass / 0 fail (exact number may differ by a couple if the `should create SqliteAdapter for sqlite engine` test is counted in the createAdapter block). Confirm 0 failures.
  - `bun run typecheck`: exits clean.

  If any SqliteAdapter test fails:
  - If `listTables` returns a wrong shape, inspect the `type` case (`sqlite_master` returns lowercase `'table'`/`'view'`).
  - If `round-trip CREATE / INSERT / SELECT` fails on INSERT, verify `better-sqlite3` is loading its native binding by running `bun -e "console.log(require('better-sqlite3'))"` — if it errors, the install in Task 2 did not produce a working binary for the platform.
  - If `readonly` test does not throw, check that `better-sqlite3` is honoring the option (it should throw `SqliteError: attempt to write a readonly database` on write attempts).

---

## Task 13: Add a SqliteAdapter test through the `connectionManager`

**Files:**
- Modify: `tests/connection-manager.test.ts`

- [ ] **Step 1: Add SQLite integration test**

  Edit `tests/connection-manager.test.ts`. Inside the top-level `describe('ConnectionManager', ...)`, **after** the existing `describe('operations without connection', ...)` block and **before** the final closing `})`, append:

  ```ts
      describe('sqlite integration', () => {
          test('should connect to an in-memory SQLite database and round-trip a query', async () => {
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
  ```

- [ ] **Step 2: Run tests**

  Run:
  ```bash
  bun test
  bun run typecheck
  bun run build
  ```

  Expected:
  - `bun test`: 0 failures. Total test count is now 103 pass (102 + 1 new connection-manager test).
  - `bun run typecheck`: exits clean
  - `bun run build`: produces `dist/index.js` (verify it still starts with `#!/usr/bin/env node`)

  Also verify the bundle loads under Node (not just Bun), since "compile to mjs for non-Bun users" is the core cross-runtime guarantee. The server reads stdin for MCP — the cleanest way to check it starts cleanly without hanging is `timeout`:

  ```bash
  timeout 2 node dist/index.js < /dev/null 2>&1 | head -5 || true
  ```

  Expected output includes at least one line starting with `[sql-mcp] Starting SQL MCP Server`. If instead you see a native module error like `Cannot find module '...better_sqlite3.node'` or `NODE_MODULE_VERSION mismatch`, then `better-sqlite3`'s prebuilt binary is incompatible with the Node version on this host — stop the plan and report it; the user may need to `bun pm rebuild` or the plan may need to fall back to a different SQLite binding.

- [ ] **Step 3: Commit the SQLite feature**

  Run:
  ```bash
  git add src/adapters/sqlite.ts src/adapters/index.ts \
          tests/adapters.test.ts tests/connection-manager.test.ts
  git commit -m "$(cat <<'EOF'
  feat(sqlite): 🚀 add SQLite adapter using better-sqlite3

  - Implement SqliteAdapter against the same DatabaseAdapter contract as MssqlAdapter and PostgresAdapter
  - Support file paths and :memory: databases
  - Enable WAL journal mode automatically for real files (skipped for :memory: and readonly)
  - Expose SQLite-specific options: filename, readonly, fileMustExist
  - listDatabases returns ['main']; switchDatabase throws a clear error (SQLite semantics do not match)
  - describeTable validates identifiers before interpolating into PRAGMA table_info (which cannot use bound params)
  - Register 'sqlite' in the createAdapter factory and export SqliteAdapter
  - Add adapter-level tests (including round-trip CREATE/INSERT/SELECT, listTables, describeTable, readonly enforcement) and a ConnectionManager integration test against :memory:

  Co-Authored-By: Yuuzu <yuuzu@yuuzu.net>
  EOF
  )"
  ```

---

## Task 14: Update the README

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Update the Features bullet list**

  Edit `README.md`. Replace the `## Features` section (lines 18–23):

  Before:
  ```markdown
  ## Features

  - **Multi-database support**: MSSQL and PostgreSQL
  - **8 tools** for database operations
  - **Three query modes**: safe, write, full
  - **Advanced authentication**: Windows Auth (MSSQL), SSL certificates (PostgreSQL)
  ```

  After:
  ```markdown
  ## Features

  - **Multi-database support**: MSSQL, PostgreSQL, and SQLite (via `better-sqlite3`)
  - **8 tools** for database operations
  - **Three query modes**: safe, write, full
  - **Advanced authentication**: Windows Auth (MSSQL), SSL certificates (PostgreSQL)
  - **Cross-runtime**: ships an ESM bundle that runs under both Bun and Node.js ≥ 18
  ```

- [ ] **Step 2: Update the Query Modes section with a PRAGMA note**

  Replace the `## Query Modes` section table (lines 38–47). Find the table that has the three rows for `safe`, `write`, `full`. Immediately after the `full` row and **before** the `Example: Enable write mode` fenced code block, add:

  ```markdown
  > **Note:** `PRAGMA` statements (SQLite metadata queries such as `PRAGMA table_info(users)`) are allowed in all modes, including `safe`, because they are read-only in practice.
  ```

  (Do not modify the existing table rows or the fenced code block.)

- [ ] **Step 3: Add SQLite connection examples**

  Locate the `### Connect with SSL (PostgreSQL)` example (ends near line 134) and its closing fence. Immediately after that closing fence, insert three new example blocks before the `## Development` heading (line 136):

  ```markdown
  ### Connect to SQLite (file)

  ```json
  {
      "tool": "connect-database",
      "arguments": {
          "engine": "sqlite",
          "filename": "/absolute/path/to/database.db"
      }
  }
  ```

  ### Connect to SQLite (in-memory)

  Useful for tests, demos, or ephemeral scratch workspaces.

  ```json
  {
      "tool": "connect-database",
      "arguments": {
          "engine": "sqlite",
          "filename": ":memory:"
      }
  }
  ```

  ### Connect to SQLite (read-only)

  ```json
  {
      "tool": "connect-database",
      "arguments": {
          "engine": "sqlite",
          "filename": "/absolute/path/to/database.db",
          "readonly": true,
          "fileMustExist": true
      }
  }
  ```
  ```

  (Note: the above Markdown block uses nested fences — when editing, the three example fences are siblings, each starting with ` ```json ` and closing with ` ``` `.)

- [ ] **Step 4: Verify the README renders and still lints**

  Run:
  ```bash
  head -100 README.md
  ```

  Expected: the Features list now mentions SQLite; the Query Modes table still has three rows; the SQLite examples appear after the PostgreSQL SSL example.

- [ ] **Step 5: Commit**

  Run:
  ```bash
  git add README.md
  git commit -m "$(cat <<'EOF'
  docs: 📚 document SQLite engine and PRAGMA safe-mode allowance

  - Add SQLite to the Features list and mention cross-runtime ESM bundle
  - Add three connection examples: file, :memory:, read-only
  - Note that PRAGMA statements are allowed in all modes including safe

  Co-Authored-By: Yuuzu <yuuzu@yuuzu.net>
  EOF
  )"
  ```

---

## Task 15: Add CHANGELOG.md

**Files:**
- Create: `CHANGELOG.md`

- [ ] **Step 1: Collect prior version dates from git**

  Run:
  ```bash
  git log --tags --simplify-by-decoration --pretty="%ai %d"
  ```

  Expected: a list of tagged commits with their dates. Use these to back-fill `1.1.1`, `1.1.0`, and any earlier versions you find.

- [ ] **Step 2: Create `CHANGELOG.md` at the repo root**

  Create `CHANGELOG.md` with the following content. For prior version dates, use the values you just collected from `git log --tags`; if a date cannot be determined, mark it as `YYYY-MM-DD` and note in the commit message that dates were approximated.

  ```markdown
  # Changelog

  All notable changes to this project will be documented in this file.

  The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
  and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

  ## [1.2.0] - 2026-04-09

  ### 🚀 Features
  - Add SQLite engine support via `better-sqlite3` (works under both Bun and Node.js)
  - Allow `PRAGMA` queries in `safe` mode so SQLite metadata introspection works without escalating to `write`/`full`

  ### ♻️ Refactoring
  - Replace the flat `ConnectDatabaseSchema` with a `z.discriminatedUnion` over `engine`; engine-specific required fields (`server` for mssql/postgres, `filename` for sqlite) are now enforced at parse time
  - `ConnectionConfig.server` is now optional; `MssqlAdapter` and `PostgresAdapter` validate it at the start of `connect()`
  - Sync the hardcoded version string in `src/index.ts` with `package.json` (was drifting since 1.0.0)

  ### 📦 Dependencies
  - Upgrade `@modelcontextprotocol/sdk`, `mssql`, `postgres`, `typescript`, and `@types/mssql` to latest
  - Add `better-sqlite3` and `@types/better-sqlite3`
  - `zod` remains locked at `^3.x` for MCP SDK compatibility

  ## [1.1.1] - <FILL-IN-DATE>

  ### 🐛 Bug Fixes
  - Revert `zod` to v3 for MCP SDK compatibility

  ## [1.1.0] - <FILL-IN-DATE>

  ### ♻️ Refactoring
  - Migrate PostgreSQL client from `pg` to `postgres.js`

  ### 👷 CI
  - Fix GitHub CI badge URL
  - Add `repository` field for npm provenance
  ```

  Replace `<FILL-IN-DATE>` placeholders with the dates recovered in Step 1.

- [ ] **Step 3: Commit**

  Run:
  ```bash
  git add CHANGELOG.md
  git commit -m "$(cat <<'EOF'
  docs: 📚 add CHANGELOG.md following Keep a Changelog format

  - Introduce CHANGELOG.md so future releases have a documented history
  - Back-fill 1.1.1 and 1.1.0 from git log, annotate the new 1.2.0 release

  Co-Authored-By: Yuuzu <yuuzu@yuuzu.net>
  EOF
  )"
  ```

---

## Task 16: Bump version to 1.2.0

**Files:**
- Modify: `package.json`
- Modify: `src/index.ts`

- [ ] **Step 1: Update `package.json` version**

  Edit `package.json` line 3. Replace:
  ```json
      "version": "1.1.1",
  ```
  with:
  ```json
      "version": "1.2.0",
  ```

- [ ] **Step 2: Update hardcoded version strings in `src/index.ts`**

  Edit `src/index.ts`. There are two places with `1.0.0`:

  Line 18 — the `McpServer` constructor:
  ```ts
      const server = new McpServer({
          name: 'sql-mcp',
          version: '1.0.0'
      })
  ```
  becomes:
  ```ts
      const server = new McpServer({
          name: 'sql-mcp',
          version: '1.2.0'
      })
  ```

  Line 47 — the startup log:
  ```ts
      console.error(`[sql-mcp] Starting SQL MCP Server v1.0.0`)
  ```
  becomes:
  ```ts
      console.error(`[sql-mcp] Starting SQL MCP Server v1.2.0`)
  ```

- [ ] **Step 3: Run the full verification gauntlet**

  Run:
  ```bash
  bun test
  bun run typecheck
  bun run build
  ```

  Expected:
  - `bun test`: 0 failures, total test count ≥ 103
  - `bun run typecheck`: exits clean
  - `bun run build`: produces `dist/index.js`

  Also verify the version bump landed in the built bundle:
  ```bash
  grep -c "1.2.0" dist/index.js
  ```
  Expected: at least `2` (one for constructor, one for startup log).

- [ ] **Step 4: Commit**

  Run:
  ```bash
  git add package.json src/index.ts
  git commit -m "$(cat <<'EOF'
  chore: 🧹 bump version to 1.2.0

  - package.json: 1.1.1 → 1.2.0 (new engine = minor bump per semver)
  - src/index.ts: sync hardcoded version string (was drifting at 1.0.0)

  Co-Authored-By: Yuuzu <yuuzu@yuuzu.net>
  EOF
  )"
  ```

---

## Task 17: Final verification and handoff instructions

**Files:**
- None — verification only

- [ ] **Step 1: Verify the full commit history on the branch**

  Run:
  ```bash
  git log --oneline main..HEAD
  ```

  Expected: exactly 8 commits on `feat/sqlite-support` since branching from `main`, in this order (newest first):
  1. `chore: 🧹 bump version to 1.2.0`
  2. `docs: 📚 add CHANGELOG.md ...`
  3. `docs: 📚 document SQLite engine ...`
  4. `feat(sqlite): 🚀 add SQLite adapter using better-sqlite3`
  5. `feat(validation): 🚀 allow PRAGMA queries in safe mode`
  6. `refactor(schemas): ♻️ use discriminatedUnion ...`
  7. `deps: 📦 upgrade dependencies and add better-sqlite3`
  8. `docs(spec): 📚 add SQLite support design spec for 1.2.0`

- [ ] **Step 2: Run all checks one last time**

  Run:
  ```bash
  bun test
  bun run typecheck
  bun run build
  ```

  Expected: all green.

- [ ] **Step 3: Push the branch and print PR / tag instructions**

  Do NOT push or create the PR automatically. Print these instructions for the user to run themselves:

  ```bash
  # 1. Push the feature branch to origin
  git push -u origin feat/sqlite-support

  # 2. Create the PR
  gh pr create --base main --title "feat(sqlite): 🚀 add SQLite engine support" --body "$(cat <<'PRBODY'
  ## Summary
  - Add SQLite engine support via `better-sqlite3` (cross-runtime)
  - Refactor connection validation to a discriminated union enforcing engine-specific required fields
  - Allow `PRAGMA` queries in `safe` mode (SQLite metadata)

  ## Changes
  - New `SqliteAdapter` with `:memory:` support, WAL auto-enable, readonly/fileMustExist options
  - `ConnectionConfig.server` → optional; defensive checks added in MssqlAdapter/PostgresAdapter
  - Upgrade all dependencies (zod locked at v3 for MCP SDK compatibility)
  - New `CHANGELOG.md`; README adds SQLite examples and PRAGMA note
  - Version bumped to 1.2.0

  ## Test Plan
  - [x] `bun test` — all pass (adds SQLite adapter, schema, PRAGMA, and connection-manager integration tests)
  - [x] `bun run typecheck` — clean
  - [x] `bun run build` — produces working `dist/index.js`
  - [x] Manual: connect to `:memory:`, CREATE → INSERT → SELECT round-trip
  - [ ] Manual (post-merge): connect to a real .db file from Claude Desktop via bunx

  ## Related
  - Design spec: \`docs/superpowers/specs/2026-04-09-sqlite-support-design.md\`
  - Implementation plan: \`docs/superpowers/plans/2026-04-09-sqlite-support.md\`
  PRBODY
  )"

  # 3. After the PR is merged to main, tag and push to trigger the release workflow
  git checkout main
  git pull origin main
  git tag v1.2.0
  git push origin v1.2.0

  # The release.yml workflow will then:
  # - Build dist/index.js
  # - Publish to npm with provenance (requires NPM_TOKEN secret)
  # - Create a GitHub Release with dist/index.js attached
  ```

---

## Success Criteria (run through this checklist at the end)

- [ ] `bun test` passes with at least 103 tests (baseline 83 + 20 new); 0 failures
- [ ] `bun run typecheck` exits clean
- [ ] `bun run build` produces `dist/index.js` that begins with `#!/usr/bin/env node`
- [ ] `SqliteAdapter` round-trips CREATE / INSERT / SELECT against `:memory:`
- [ ] `PRAGMA table_info(users)` executes in `safe` mode without error
- [ ] `SQL_MCP_MODE=safe` still blocks `INSERT` / `UPDATE` / `DELETE` on SQLite (existing validation tests cover this)
- [ ] `readonly: true` SQLite connection rejects writes
- [ ] `ConnectDatabaseSchema.parse({ engine: 'sqlite' })` fails with a missing-filename error
- [ ] `ConnectDatabaseSchema.parse({ engine: 'mssql' })` still fails with a missing-server error (no regression)
- [ ] `README.md` shows SQLite connection examples and a PRAGMA note
- [ ] `CHANGELOG.md` exists with a `[1.2.0]` entry
- [ ] `package.json` version is `1.2.0`
- [ ] `src/index.ts` version strings are `'1.2.0'` and `v1.2.0`
- [ ] 8 commits on `feat/sqlite-support` (design spec + 7 implementation commits)
- [ ] Branch is not pushed; user has copy-paste commands for PR and tag
