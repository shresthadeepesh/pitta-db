# 01 — Functional Spec

Legend: **[P1]** = required for v1.0 · **[P2]** = post-v1 · **[PG]** = Postgres-specific, gated behind a capability flag · **[MM]** = multi-model, Phases 11–13 (`10-ENGINE-MODEL.md`, `11-ENGINE-MONGODB.md`, `12-ENGINE-REDIS.md`).

---

## A. Connections

### A1. Creating a connection **[P1]**
Sources, all supported:
- Visual form (webview) — host, port, database, user, password, display name, group/folder, color tag, environment tag.
- **Paste a URI** — `postgres://user:pass@host:5432/db?sslmode=require` auto-fills the form. Password extracted straight into SecretStorage, never shown back in plaintext.
- **libpq environment** — `PGHOST`, `PGPORT`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGSSLMODE`, `PGSERVICE`. **[PG]**
- **`~/.pg_service.conf`** service names, listed in a picker. **[PG]**
- **`~/.pgpass`** consulted for password when none stored. **[PG]**
- **Docker/Compose detection [P2]** — scan workspace `docker-compose.y*ml` for `postgres` services, offer one-click profiles.

### A2. Auth & transport **[P1]**
- Password, plus `trust`/no-password.
- SSL modes: `disable | allow | prefer | require | verify-ca | verify-full`, with CA / client cert / client key paths and key passphrase. `verify-full` is the default suggestion for non-localhost hosts.
- **SSH tunnel built in** — host, port, user, password | private key + passphrase | ssh-agent; optional jump host. No `ssh -L` in a separate terminal.
- Connection timeout, statement timeout, `application_name` (defaults to `pitta/<version>`), `search_path`, session `TimeZone`, `client_encoding`.
- **[P2]** Cloud IAM: AWS RDS auth token, Azure Entra ID, GCP Cloud SQL connector.

### A3. Profiles & sharing **[P1]**
- **User profiles** — global, in `globalState` + SecretStorage.
- **Workspace profiles** — `.vscode/pitta.connections.json`, committable, **secrets referenced not stored**: `"password": { "env": "PGPASSWORD" }` or `{ "secret": true }` (prompt + keychain on first use) or `{ "pgpass": true }`.
- Groups/folders, drag to reorder, per-connection color, duplicate, export/import (secrets stripped).

### A4. Environment tagging & guardrails **[P1]**
Each profile carries `environment: "dev" | "staging" | "prod"`.
- Tree node, status bar, and every result panel border take that environment's color. Prod = red. Unmissable.
- `prod` implies: destructive-statement confirmation modal, `DELETE`/`UPDATE` without `WHERE` blocked outright, and optional forced read-only.
- `readOnly: true` on any profile → session opens with `SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`, plus client-side statement rejection so the error is instant and legible.

### A5. Lifecycle **[P1]**
Connect / disconnect / reconnect. Pool size configurable (default min 0, max 5). Idle connections closed after N minutes (default 10) — no more holding a prod slot open all afternoon. Auto-reconnect with exponential backoff on transient failure; explicit error toast with the raw `SQLSTATE` on permanent failure.

---

## B. UI mode — Explorer & visual editing

### B1. Object tree **[P1]**
```
Connection (env-colored)
└─ Databases                      [PG] multi-db per server
   └─ Schemas                     (system schemas collapsed by default)
      ├─ Tables      → columns, indexes, constraints, triggers, policies, partitions
      ├─ Views
      ├─ Materialized Views       [PG]  (+ Refresh action)
      ├─ Foreign Tables           [PG]
      ├─ Functions / Procedures   (+ source, args, return type)
      ├─ Types                    [PG]  enums, composites, domains, ranges
      ├─ Sequences                [PG]
      └─ Extensions               [PG]
   └─ Roles / Privileges          [PG] [P2]
```
- Lazy-load per node, virtualized. A schema with 10 000 tables must not hang the tree.
- Filter box with fuzzy match across the whole tree.
- Row-count badge — **estimated** from `pg_class.reltuples` by default (free), exact `COUNT(*)` on demand only. **[PG]**
- Table size / index size / bloat estimate in the hover tooltip. **[PG]**
- Context actions per node: Open Data · Open Structure · Copy DDL · Copy qualified name · Generate `SELECT`/`INSERT`/`UPDATE` · Truncate (guarded) · Drop (guarded) · Refresh.

### B2. Table Data view **[P1]**
The centerpiece of UI mode.
- Virtualized grid, server-side paging via keyset pagination on the PK (falls back to `LIMIT/OFFSET` when no PK).
- Per-column filter row: operator picker (`= ≠ > < LIKE ILIKE IN IS NULL BETWEEN`), values typed per column type; combined into a real `WHERE`. The generated SQL is always visible and copyable.
- Multi-column sort (click, shift-click), pushed to `ORDER BY`.
- Column show/hide/reorder/pin/resize, persisted per table.
- **Inline editing**: double-click a cell → type-aware editor (text, number w/ exact decimal, boolean tri-state incl. NULL, date/time picker w/ timezone, enum dropdown from `pg_enum`, json editor with validation, array chip editor, bytea upload/download, FK cell → picker showing referenced-row labels).
- Insert row / duplicate row / delete row.
- **Staged changes model**: edits are pending (dirty cells highlighted) until *Apply*. Apply opens a diff showing the exact DML, then runs it in **one transaction**. Any error → full rollback, nothing half-applied.
- Row identity requires a PK or unique index; without one, editing is disabled with a clear reason and a "use `ctid`" opt-in. **[PG]**
- Cell detail pane for long text / json / images.

### B3. Structure view **[P1]**
Read-only tabs for a table: Columns · Indexes · Constraints · Triggers · Policies **[PG]** · Partitions **[PG]** · Statistics · DDL.
- **[P2]** Visual table designer: add/rename/drop columns, change types, manage indexes/constraints — generating reviewable `ALTER TABLE` DDL, never applied silently.

### B4. ERD **[P2 — Phase 7]**
Per-schema canvas, FK edges, auto-layout (dagre), drag to arrange, layout persisted, filter to selected tables + neighbors, export PNG/SVG. Click a table → jump to Structure.

---

## C. Query mode

### C1. Editor integration **[P1]**
- Any `.sql` file gets a status-bar connection picker. Binding persists per file.
- File-level directive override: `-- @pitta connection: staging-analytics`.
- **CodeLens above each statement:** `▶ Run · Explain · Explain Analyze`.
- Keybindings: run statement under cursor, run selection, run all, cancel.
- Split-statement execution honors `;`, dollar-quoted bodies (`$$ … $$`, `$tag$ … $tag$`), `E''` strings, nested comments, and psql-style `\` meta-commands (a useful subset: `\d`, `\dt`, `\l`, `\timing`). **[PG]**

### C2. Executing **[P1]**
- Multiple statements → one result tab each, tabbed panel, per-tab timing + `commandTag` (`SELECT 42`, `UPDATE 3`).
- Live elapsed timer; **Cancel** issues a genuine Postgres CancelRequest.
- Transaction mode toggle: autocommit (default) | manual (`BEGIN` held open, explicit Commit/Rollback buttons, open-transaction indicator in the status bar — with an idle-in-transaction warning after N seconds). **[PG]**
- Stored routines: edit a definition as a document and save it back, call one with its declared arguments, and watch its `RAISE`/`PRINT`/warning output arrive while it runs. Failures inside a body are reported with the engine's own stack.
- Parameterized queries: the engine's own placeholders (`$1`, `?`, `@name`) and Pitta's `:name` prompt for typed values in a form before the run, sent as bind params (never string-interpolated).
- **Messages tab**: `NOTICE`, `WARNING`, `RAISE`, `\timing` output — streamed live during execution, not after. **[PG]**

### C3. Result grid **[P1]**
Same component as B2, read-only unless the result maps to exactly one updatable table.
- Copy as: TSV, CSV, JSON, Markdown table, SQL `INSERT`.
- Export: CSV, JSON, JSONL, XLSX, SQL inserts, Parquet **[P2]** — streamed to disk, never fully materialized.
- Result-set search, column stats popover (min/max/distinct/null count over the fetched window), chart-this-result **[P2]**.
- Pin/compare two result tabs side by side **[P2]**.

### C4. SQL intelligence **[P1 unless noted]**
- Completion: schemas, tables, columns (alias-aware, `FROM`-clause-driven), functions with signatures, keywords, enum values in comparisons. Backed by the metadata cache → instant.
- Hover: column type/default/nullability/comment; table row-estimate and size.
- Go-to-definition on a table/function name → opens its DDL.
- Diagnostics: syntax errors from a real parser (`libpg-query` WASM, the actual Postgres grammar) plus semantic checks — unknown table/column, ambiguous column. **[PG]**
- Formatter (`prettier-plugin-sql` or `sql-formatter`), format-on-save opt-in.
- Snippets + user-defined templates.

### C5. History & saved queries **[P1]**
- Every execution recorded: SQL, connection, timestamp, duration, row count, success/error. Stored locally, searchable, re-runnable, with a "don't record on prod" opt-out.
- Saved queries as plain `.sql` files in a workspace folder — no proprietary store, works with git.

### C6. SQL Notebooks **[P2 — Phase 5]**
`.psql-nb` via the Notebook API: markdown + SQL cells, per-cell connection, outputs as grids, cell chaining via a `-- @pitta ref: prevCell` reference, export to `.sql` or `.ipynb`.

---

## D. Postgres power features **[PG — Phase 6]**

| Feature | Detail |
|---|---|
| **EXPLAIN visualizer** | `EXPLAIN (ANALYZE, BUFFERS, VERBOSE, FORMAT JSON)` → interactive node tree. Per-node cost/rows/time, width proportional to time, red-flag badges for estimate-vs-actual row skew > 10×, seq scans on big tables, external sorts, lossy bitmap heap scans, nested-loop blowups. Plan diff between two runs. |
| **Session monitor** | `pg_stat_activity` live: state, wait event, query, duration, blocking chain. Cancel backend / terminate backend from the UI (guarded). |
| **Lock inspector** | `pg_locks` join → who blocks whom, as a tree. |
| **LISTEN/NOTIFY** | Subscribe to channels, live payload log. |
| **Index & health advisor** | Unused indexes (`pg_stat_user_indexes`), duplicate indexes, missing FK indexes, table/index bloat estimate, seq-scan-heavy tables, autovacuum lag. Read-only reporting with suggested DDL — never auto-applies. |
| **Extensions** | List installed/available, version, `CREATE EXTENSION` helper. |
| **pgvector awareness** | `vector` columns render as a compact summary + dimension, similarity-search snippet generation, index (`ivfflat`/`hnsw`) visibility. |
| **PostGIS awareness** | Geometry cells render a mini map preview; `ST_AsGeoJSON` on demand. |
| **Roles & privileges** | Role tree, membership, per-object grants matrix. |
| **Publications / subscriptions / replication slots** | Read-only listing with lag. |

## E. Schema tooling **[Phase 7]**
- DDL generation for every object type, `pg_dump`-quality (round-trips).
- **Schema diff** between two connections/schemas → generated migration SQL, reviewed before it runs anywhere.
- Export schema to a migration file compatible with plain SQL / Flyway naming.
- **[P2]** Read-only awareness of Prisma / Drizzle / Alembic migration state if detected in the workspace.

## F. Cross-cutting **[P1]**
- Full theme integration — uses VS Code theme tokens; light/dark/high-contrast all correct. No hardcoded colors.
- Keyboard-navigable everywhere; screen-reader labels on grid cells; grid is a proper ARIA `grid`.
- All long ops cancellable and reported through `withProgress`.
- Output channel with leveled logging; secrets redacted; "Copy diagnostics" for bug reports.
- Telemetry: **off by default**, opt-in, honors `telemetry.telemetryLevel`, documented event list.

---

## G. Non-relational engines **[MM — Phases 11–13]**

Everything in A–F holds for MongoDB and Redis unless it is gated on a capability
that says otherwise. This section is only what is *new*, and each item has a
decision behind it in `09-DECISIONS.md`.

### G1. One client, several kinds of database
- A connection declares an engine and a **language** (`sql`, `mongodb`,
  `redis`). The status bar shows connection · database · language; a query file
  carries the engine's extension (`.sql`, `.mongodb.js`, `.redis`); saved
  queries, history and notebooks are language-generic (ADR-034).
- Every affordance stays capability-gated. Redis has no explain tab, no ERD, no
  schema diff, and no DDL document — those commands are `when`-hidden, not
  present-and-broken.
- Capabilities may be narrowed by the *session*: transactions on a MongoDB
  standalone, `CLIENT LIST` under a restricted Redis ACL user (ADR-035).

### G2. Documents **[MM]**
- A result may be a set of documents rather than rows. Columns come from a
  sample of the page, marked as inferred, `_id` first; the raw document is
  always in the detail pane and always the last view offered (ADR-038, ADR-033).
- **A missing field is not a null field.** The grid has a `MISSING` token
  distinct from `NULL`, filters offer `exists` / `does not exist`, and clearing a
  field and removing a field are two different edit actions (ADR-039).
- A collection's field list is **inferred by sampling** and every surface that
  shows it says so, with observed types and presence as percentages (ADR-045).
  A `$jsonSchema` validator, where one exists, is shown separately and is not an
  inference.

### G3. Keyspaces **[MM]**
- A Redis database is a flat keyspace; the folder tree is built from key
  prefixes over a bounded sample, and folder counts are labelled as estimates.
  Listing is always `SCAN`-based and paged; `KEYS` is never issued (ADR-044).
- A key opens the data view, with columns that depend on its type — hash
  field/value, zset member/score, stream id/fields, list index/value.
- **TTL is first-class**: shown on the key, editable, and guarded like any other
  write.

### G4. Editing without a rollback **[MM]**
- Staged edits, dirty cells and the preview-before-apply flow are unchanged; the
  preview shows the engine's own command.
- Where the engine cannot apply a batch atomically the dialog says so in those
  words, and the result reports exactly which edits were applied (ADR-041).

### G5. Safety, per engine **[MM]**
- Classification comes from the engine's own metadata where it publishes any —
  Redis `COMMAND INFO` flags, MongoDB's operation verb plus an empty-filter test
  — and an **unclassifiable command on a `prod` profile is treated as
  destructive** (ADR-040).
- `deleteMany({})` and `updateMany({})` are the analogue of DML with no `WHERE`
  and are blocked by the same setting. An aggregation containing `$out` or
  `$merge` is a write, and is classified by what the pipeline does rather than
  by the method name.
- `FLUSHALL`, `FLUSHDB`, `CONFIG SET`, `SHUTDOWN`, `MIGRATE` and the rest of the
  flag table's `dangerous` set need the typed confirmation on prod. `KEYS` and
  `MONITOR` are refused rather than confirmed.
- MongoDB query text is **parsed, never evaluated** — no `eval`, no `vm`, no
  `new Function`, so a snippet pasted from a ticket cannot reach the extension
  host (ADR-042).
- Read-only enforcement is client-side where the engine has no server-side
  read-only session, and the badge says which it is rather than implying a
  guarantee the server is not making.

### G6. What these engines do not get
- No ERD and no schema diff for MongoDB — an inferred relationship is a guess,
  and a diagram of guesses is worse than none. Index and validator diffing is a
  separate, honest feature. **[P2]**
- No plan visualizer for Redis; there is no planner.
- No cross-engine query, ever (ADR-048).
- No client-side field-level encryption or Kerberos for MongoDB — both need
  native modules, which ADR-012 rules out (ADR-046).

