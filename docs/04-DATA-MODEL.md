# 04 — Data Model, Settings & Storage

## 1. ConnectionProfile

```ts
interface ConnectionProfile {
  id: string                       // uuid, stable
  name: string                     // display
  driver: string                   // 'postgres' | 'sqlite' | 'mongodb' | 'redis' | 'mysql'
  group?: string                   // folder path, '/' separated
  color?: string                   // theme color id or hex
  environment: 'dev' | 'staging' | 'prod'
  readOnly?: boolean

  connection: {
    host: string
    port: number
    database: string
    user: string
    password?: SecretRef           // NEVER a literal — see §3
    connectTimeoutMs?: number
    applicationName?: string       // default `pitta/<version>`
    searchPath?: string[]
    timeZone?: string
    options?: Record<string,string> // arbitrary libpq options
  }

  ssl?: {
    mode: 'disable'|'allow'|'prefer'|'require'|'verify-ca'|'verify-full'
    ca?: string; cert?: string; key?: string; keyPassphrase?: SecretRef
    rejectUnauthorized?: boolean
  }

  ssh?: {
    host: string; port: number; user: string
    auth: { kind: 'password'; password: SecretRef }
         | { kind: 'key'; privateKeyPath: string; passphrase?: SecretRef }
         | { kind: 'agent' }
    jumpHost?: Omit<SshConfig,'jumpHost'>
  }

  pool?: { min: number; max: number; idleTimeoutMs: number }
  defaults?: { statementTimeoutMs?: number; fetchSize?: number; autocommit?: boolean }
  source: 'user' | 'workspace' | 'env' | 'pgservice'   // read-only marker
}

type SecretRef =
  | { kind: 'keychain' }                  // stored in vscode.SecretStorage under `pitta:<id>:<field>`
  | { kind: 'env'; name: string }         // resolved from process.env at connect time
  | { kind: 'pgpass' }                    // resolved from ~/.pgpass
  | { kind: 'command'; command: string }  // shell out, e.g. `aws rds generate-db-auth-token` — [P2], opt-in
  | { kind: 'prompt' }                    // ask every time, never persisted
```

### 1.1 The `connection` block is driver-shaped **[MM]**

The block above is Postgres' shape. MongoDB has a *list* of hosts, a replica set
name and an auth source; Redis has a mode, a sentinel list or cluster seed
nodes, and a numeric database index. From Phase 11 the block is
`Record<string, unknown>`, validated against the driver's own
`connectionSchema` — which is already what renders the form, so the schema
becomes the single definition of a profile's shape rather than a second one.

The well-known keys (`host`, `port`, `database`, `user`, `password`) keep their
names wherever they apply, so an existing profile file is still valid and the
URI parsers keep filling the same fields. `ssl` and `ssh` are unchanged: TLS
options and the `ssh2` tunnel are engine-independent and every driver reuses
them.

`ResolvedProfile` = `ConnectionProfile` with `SecretRef`s replaced by actual values. It exists **only** in the extension host, only inside a connect call, and is never logged, serialized, or sent to a webview.

## 2. Storage locations

| What | Where | Committable |
|---|---|---|
| User profiles (non-secret) | `globalState` key `pitta.profiles` | n/a |
| Workspace profiles (non-secret) | `.vscode/pitta.connections.json` (JSON Schema published + `$schema` autocompletion) | **yes** |
| Every secret | `vscode.SecretStorage` → OS keychain | never |
| Query history | `globalStorageUri/history.jsonl`, rotated at 50 MB | no |
| Metadata cache | `globalStorageUri/metadata/<connId>.json`, TTL-stamped | no |
| Grid layout / column prefs | `workspaceState` | no |
| Saved queries | plain `.sql` under a user-chosen workspace folder | **yes** |

## 3. Settings (`contributes.configuration`)

```jsonc
{
  "pitta.connections":                 [],        // workspace-level array, non-secret fields only
  "pitta.defaultFetchSize":            500,
  "pitta.maxRowsInMemory":             200000,    // then spill / require export
  "pitta.gridCacheBudgetMB":           200,
  "pitta.metadataCacheTtlSeconds":     300,       // 0 = always fresh
  "pitta.query.autocommit":            true,
  "pitta.query.statementTimeoutMs":    0,
  "pitta.query.confirmDestructive":    "prod",    // "always" | "prod" | "never"
  "pitta.query.blockUnqualifiedDml":   true,      // UPDATE/DELETE with no WHERE
  "pitta.editor.formatOnSave":         false,
  "pitta.editor.diagnostics":          "semantic",// "off" | "syntax" | "semantic"
  "pitta.explorer.showSystemObjects":  false,
  "pitta.explorer.rowCountMode":       "estimate",// "estimate" | "exact" | "off"
  "pitta.history.enabled":             true,
  "pitta.history.excludeEnvironments":["prod"],
  "pitta.telemetry.enabled":           false,
  "pitta.logLevel":                    "info",

  // Multi-model — Phases 11–13
  "pitta.explorer.treePageSize":        500,      // Load-more page size for large containers
  "pitta.documents.sampleSize":         200,      // documents sampled for the grid's column union
  "pitta.mongodb.maxTimeMS":            0,        // 0 = no server-side operation timeout
  "pitta.mongodb.readPreference":       "primary",
  "pitta.mongodb.allowServerSideJs":    false,    // $where, $function, mapReduce
  "pitta.redis.keySeparator":           ":",
  "pitta.redis.scanCount":              500,      // COUNT hint per SCAN round trip
  "pitta.redis.sampleKeys":             5000,     // sample behind the prefix-folder tree
  "pitta.redis.allowKeysCommand":       false,    // KEYS is O(N) and blocks the server
  "pitta.redis.allowMonitor":           false     // MONITOR degrades the server; never on prod
}
```

## 4. Result set model

```ts
interface ResultSet {
  queryId: string
  fields: FieldMeta[]              // name, typeOid, typeName, tableOid?, columnAttr?, nullable?
  rows: ColumnStore                // columnar, see Architecture §6
  rowCount?: number                // undefined until the cursor drains
  commandTag: string
  durationMs: number
  truncated: boolean
  updatable?: { ref: ObjectRef; keyColumns: string[] }   // set only when rows map 1:1 to one table with a PK
  notices: Notice[]
}
```

From Phase 11 a `ResultSet` also carries `shape: ResultShape`
(`rows` | `documents` | `keyValue` | `message` | `none`), and `FieldMeta` gains
`path?: string[]` and `inferred?: boolean` for fields derived by sampling rather
than declared by the server. A cell on the wire becomes
`string | null | { missing: true }` — absent is not null, and the grid renders
them as different tokens (ADR-038, ADR-039).

`updatable` is computed from `tableOid` + `columnAttr` on the field metadata (Postgres returns these on every `RowDescription`) joined against `pg_index`. That's how a *query result* becomes editable safely — no heuristic SQL parsing.

## 5. Grid query model (UI mode)

```ts
interface GridQuery {
  filters: { column: string; op: FilterOp; value?: unknown; values?: unknown[] }[]
  sorts:   { column: string; dir: 'asc'|'desc'; nulls?: 'first'|'last' }[]
  page:    { mode: 'keyset'; after?: unknown[] }
         | { mode: 'offset'; offset: number }
         | { mode: 'cursor'; cursor?: string }        // [MM] SCAN / driver cursor
  limit:   number
  columns?: string[]
}
```
`FilterOp` gains `exists`, `notExists` and `regex` for schemaless engines. Where
an engine has no offsets, no server-side sort, or no server-side filter, the
matching capability flag is false and the grid hides the affordance rather than
sorting one page and implying the whole container is sorted.
Compiled by `driver.buildSelect()` into parameterized SQL. Keyset paging is chosen automatically when a PK/unique index exists and the sort is compatible; otherwise `LIMIT/OFFSET` with a warning shown for deep pages.

## 6. Row edit model

```ts
type RowEdit =
  | { op: 'update'; key: Record<string,unknown>; set: Record<string,unknown> }
  | { op: 'insert'; values: Record<string,unknown> }
  | { op: 'delete'; key: Record<string,unknown> }
```
From Phase 11 the generated statements are in the *engine's* language
(`Statement.text`), and `supportsAtomicEdits` decides what is promised: with it
false, the apply dialog states that changes are applied in order and cannot be
rolled back, and the result reports which edits were applied (ADR-041). A
schemaless engine adds a fourth op — removing a field is distinct from setting
it null (ADR-039):

```ts
| { op: 'unset'; key: Record<string,unknown>; fields: string[] }
```

Applied inside one transaction, in order, each statement parameterized, each with `RETURNING` where possible so the grid refreshes from actual post-trigger values. Any statement affecting `!= 1` row on an update/delete → abort + rollback + report (guards against a stale-key silent mass update).
