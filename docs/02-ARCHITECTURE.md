# 02 — Architecture

## 1. Process topology

```
┌───────────────────────────────────────────────────────────────┐
│ VS Code Extension Host (Node 22)                              │
│                                                               │
│  activation ─ commands ─ TreeDataProvider ─ StatusBar         │
│        │                                                      │
│  ┌─────▼──────────────────────────────────────────────┐       │
│  │ core/                                              │       │
│  │  connections  pool  query  metadata  history       │       │
│  │  driver-registry  secrets  guards  events          │       │
│  └─────┬────────────────────────────┬─────────────────┘       │
│        │ DriverAdapter iface        │ typed RPC (postMessage) │
│  ┌─────▼─────────┐            ┌─────▼───────────────────────┐ │
│  │ drivers/pg    │            │ Webview panels (React 19)   │ │
│  │  node-postgres│            │  results-grid  table-editor │ │
│  │  pg-cursor    │            │  connection-form  erd       │ │
│  │  ssh2 tunnel  │            │  plan-viewer   schema-diff  │ │
│  └─────┬─────────┘            └─────────────────────────────┘ │
└────────┼──────────────────────────────────────────────────────┘
         │ TCP / TLS / SSH tunnel
    ┌────▼─────┐
    │ Postgres │
    └──────────┘
```

**Phase 8 addition:** an optional `QueryHost` forked child process per connection group. Driver + row serialization move there so a 5M-row fetch cannot OOM or stall the extension host. Same `DriverAdapter` interface, transported over a pipe. Core code is written against the interface from day one so this is a config flag, not a rewrite.

**Remote-SSH / WSL / devcontainer:** the extension is `workspace`-scoped (`"extensionKind": ["workspace"]`), so it runs on the remote. `localhost:5432` therefore means *the remote's* localhost. Documented loudly in the connection form.

## 2. Package layout (pnpm monorepo)

```
vscode-db-ext/
├─ packages/
│  ├─ core/            # engine-agnostic. NO vscode import, NO pg import.
│  │   ├─ driver/      # DriverAdapter, capabilities, registry
│  │   ├─ model/       # ConnectionProfile, ObjectRef, ColumnMeta, ResultSet …
│  │   ├─ sql/         # statement splitter, dialect-neutral AST helpers
│  │   ├─ query/       # execution orchestration, cancellation, tx modes
│  │   ├─ metadata/    # cache, invalidation, tree shape
│  │   └─ guards/      # destructive-statement detection, read-only enforcement
│  ├─ driver-pg/       # node-postgres, pg-cursor, pg introspection SQL, type parsers
│  ├─ driver-sqlite/   # Phase 9 — proves the registry
│  ├─ driver-mongodb/  # Phase 12 — documents, sampled schema, no SQL
│  ├─ driver-redis/    # Phase 13 — keyspace, no rows, no rollback
│  ├─ driver-mysql/    # Phase 14
│  ├─ driver-mssql/    # SQL Server — T-SQL, sp_executesql, transactional DDL
│  ├─ protocol/        # shared TS types for ext-host ⇄ webview RPC (single source of truth)
│  └─ extension/       # the only package importing `vscode`
│      ├─ activation.ts
│      ├─ explorer/    # TreeDataProvider, decorations, drag/drop
│      ├─ editor/      # SQL language features, CodeLens, connection binding
│      ├─ panels/      # webview host classes, lifecycle, state restore
│      ├─ notebook/    # NotebookSerializer + controller
│      └─ storage/     # SecretStorage, globalState, workspace profile files
├─ webview-ui/         # Vite + React 19. Builds to packages/extension/media/
│  ├─ results-grid/    ├─ table-editor/   ├─ connection-form/
│  ├─ erd/             ├─ plan-viewer/    └─ shared/ (theme tokens, RPC client)
├─ docs/
└─ test/
```

**Dependency rule (enforced by `dependency-cruiser` in CI):**
`core` imports nothing from `extension`, `driver-*`, or `vscode`. `driver-*` imports only `core`. `webview-ui` imports only `protocol`. Violating this fails the build.

From Phase 11 one more rule is enforced: no package outside `driver-*` may name
a query language. `core` and `extension` handle *text in the engine's language*
and never inspect it — the SQL splitter, formatter and classifier live in
`driver-pg`, the shell-dialect parser in `driver-mongodb`, and the command
tokenizer in `driver-redis` (ADR-034).

## 3. Key interfaces

### 3.1 DriverAdapter
Full contract in `03-DRIVER-API.md`. Summary:

```ts
interface DriverAdapter {
  readonly id: string                     // 'postgres'
  readonly capabilities: DriverCapabilities
  connect(profile: ResolvedProfile, signal: AbortSignal): Promise<Session>
  buildIntrospection(): IntrospectionPlan  // declarative queries → tree nodes
  quoteIdent(s: string): string
  formatLiteral(v: unknown, type: TypeInfo): string
  parseValue(raw: Buffer | string, oid: number): unknown
  explain?(sql: string, opts: ExplainOptions): Promise<PlanNode>
  generateDdl?(ref: ObjectRef): Promise<string>
}
```

`DriverCapabilities` is a flag bag (`supportsSchemas`, `supportsExplainAnalyze`, `supportsCursors`, `supportsNotifications`, `supportsTransactionalDdl`, `supportsArrays`, …). **UI reads capabilities, never `driver.id`.** No `if (driver === 'postgres')` anywhere in `core` or `extension` — that check is how SQLTools rotted.

### 3.2 Session
One live connection or pool. Owns:
- `query(sql, params, opts) → QueryHandle` — handle exposes `rows` async-iterator, `cancel()`, `notices` event, `commandTag`, `fields`.
- `transaction(fn)` — explicit BEGIN/COMMIT with savepoint support.
- `cancelRequest()` — Postgres out-of-band cancel over a second socket (`pg` supports this via `pg-cancel` / manual CancelRequest packet).
- health-check ping, idle timeout, auto-reconnect with backoff.

### 3.3 Extension ⇄ Webview RPC
Typed request/response + server-push over `postMessage`. Contract lives in `packages/protocol`:

```ts
type Req =
  | { t: 'grid/fetchPage'; queryId: string; offset: number; limit: number }
  | { t: 'grid/export'; queryId: string; format: 'csv'|'json'|'sql'|'xlsx' }
  | { t: 'table/applyEdits'; ref: ObjectRef; edits: RowEdit[]; dryRun: boolean }
  | { t: 'conn/test'; draft: ConnectionDraft }
  …
type Push =
  | { t: 'grid/rows'; queryId: string; chunk: Row[]; done: boolean }
  | { t: 'query/notice'; queryId: string; severity: string; message: string }
  | { t: 'conn/state'; id: string; state: 'connecting'|'open'|'error'; error?: string }
```
Every message is validated with `zod` on both sides. Webview never gets raw credentials — ever. Connection form posts a draft; the ext host resolves secrets and tests.

## 4. Data flow: "user runs a SELECT"

1. `pitta.runStatement` command → resolve bound connection for the active editor.
2. `core/sql` splits the buffer, picks the statement containing the cursor.
3. `core/guards` inspects it. Destructive + prod-tagged → modal confirm. Read-only connection + DML → reject.
4. `Session.query()` opens a **server-side cursor** when the driver reports `supportsCursors` and the statement is a single `SELECT`. Otherwise buffered.
5. First `N` rows (default 500) fetched → result panel opens, grid renders.
6. Grid scroll → `grid/fetchPage` → cursor `FETCH FORWARD` → chunk pushed. Rows cached in the ext host keyed by `queryId`, evicted on panel close or LRU cap (default 200 MB).
7. `NOTICE` / `RAISE` messages stream to the Messages tab live.
8. Cancel button → `Session.cancelRequest()` (real Postgres cancel, not just socket close).

## 5. Metadata cache

- Introspection results keyed `connId:database:schema:kind`, stored in `globalState` with a schema-version stamp + TTL (default 5 min, configurable, `0` = always fresh).
- Invalidated eagerly on: any DDL statement executed through Pitta, explicit refresh, connection reopen.
- Postgres bonus: subscribe to `LISTEN pitta_ddl` if the user installs the optional event-trigger snippet Pitta ships — gives cross-client cache invalidation. Optional, off by default.
- Cache feeds both the tree and SQL completion, so completion is instant and offline-tolerant.

## 6. Result grid engine (the hard part)

- **Virtualization:** TanStack Virtual, windowed rows *and* columns. DOM node count stays ~constant.
- **Column-oriented store:** rows arrive as arrays, not objects. Values kept in typed columnar buffers where the type allows (`Float64Array`, `Int32Array`), strings interned. Cuts memory ~3–5× vs object-per-row.
- **Numeric safety:** `numeric`/`decimal` parsed to string, rendered exact, edited as string. Never through `Number`.
- **Cell renderers by type:** json/jsonb → collapsible tree; arrays → chip list; bytea → hex/preview; geometry → mini map; `NULL` → distinct styled token (never empty string, never the literal text `null`).
- **Budget:** 1M rows × 20 cols streamed at < 600 MB ext-host RSS; scroll stays ≥ 50 fps.

## 7. Build & tooling

- TypeScript 5.x strict, `pnpm` workspaces, `esbuild` for the extension bundle, `vite` for webviews.
- `@vscode/vsce` packaging; publish to Marketplace **and** Open VSX (Cursor/Windsurf/VSCodium).
- Lint: `eslint` + `@typescript-eslint`, `dependency-cruiser` boundary rules.
- CI: GitHub Actions matrix (macOS/Linux/Windows) × (PG 13,15,17 service containers).
