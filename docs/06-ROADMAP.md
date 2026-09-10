# 06 — Roadmap: Phases & Milestones

Estimates assume **one full-time developer**. Two devs → roughly parallelize Phases 3+4 and 6+7.

| Phase | Title | Est. | Cumulative |
|---|---|---|---|
| 0 | Foundations | 1 wk | 1 |
| 1 | Connections + Explorer | 3 wk | 4 |
| 2 | Query mode MVP | 3 wk | 7 |
| 3 | UI mode — data view & editing | 4 wk | 11 |
| 4 | SQL intelligence | 3 wk | 14 |
| 5 | Productivity (history, export, notebooks) | 3 wk | 17 |
| 6 | Postgres power features | 4 wk | 21 |
| 7 | ERD + schema tooling | 4 wk | 25 |
| 8 | Performance & scale hardening | 3 wk | 28 |
| 9 | Second driver (SQLite) | 2 wk | 30 |
| 10 | Packaging & release | 2 wk | 32 |
| 11 | Multi-model contract generalization | 3 wk | 35 |
| 12 | MongoDB driver | 4 wk | 39 |
| 13 | Redis driver | 3 wk | 42 |
| 14 | MySQL / MariaDB driver | 2 wk | 44 |
| 15 | SQL Server driver | 2 wk | 46 |

**Milestones**
- **M1 — Internal alpha** (end of Phase 2): connect, browse, run SQL, see results. Dogfoodable.
- **M2 — Public beta** (end of Phase 5): both modes complete, published as pre-release on Marketplace + Open VSX.
- **M3 — v1.0** (end of Phase 8 + 10): Postgres feature-complete, perf budgets met, docs done.
- **M4 — v1.1** (end of Phase 9): multi-driver proven against a second relational engine.
- **M5 — v1.2, multi-model** (end of Phase 13): MongoDB and Redis ship from the same core. The claim on the tin changes from "PostgreSQL client with a driver layer" to "one client, several kinds of database".
- **M6 — v1.3** (end of Phase 14): MySQL/MariaDB, and the driver-authoring guide proven by someone outside the project using it.
- **M7 — v1.4** (end of Phase 15): SQL Server, which completes the four relational engines most teams actually run.

Phases 6/7 can slip past v1.0 without blocking it — Phase 8 and 10 are the true v1.0 gates. Phase 9 is deliberately *after* v1.0: the registry's design is validated by real use before a second engine locks it in.

Phases 11–14 are all post-v1.0 and none of them gate it. Phase 11 ships no user-visible feature and is still not optional: it is the contract work MongoDB and Redis both need, done once and reviewed on its own terms rather than smuggled into a driver PR (ADR-034).

---

## Phase 0 — Foundations · 1 wk
**Goal:** an empty extension that installs, activates, runs a "Hello" command, and has CI green.

- pnpm workspace, TS 5 strict, packages per Architecture §2.
- esbuild bundle for the extension, Vite for `webview-ui`, watch tasks, `.vscode/launch.json` for F5 debugging.
- eslint + `dependency-cruiser` boundary rules (core must not import `vscode`/`pg`) wired into CI.
- Vitest for unit, `@vscode/test-electron` harness stub.
- GitHub Actions: lint · typecheck · unit · package VSIX artifact.
- `docker-compose.test.yml` with PG 13 / 15 / 17 for later integration tests.
- Output channel + leveled logger with the redaction pass (S1.4) — built now, so nothing ever logs a secret.

**Exit:** `pnpm package` produces an installable VSIX; CI green on a clean clone.

---

## Phase 1 — Connections + Explorer · 3 wk
**Goal:** add a Postgres connection, see its objects.

- `DriverAdapter`/`Session` interfaces + registry (`03-DRIVER-API.md`).
- `driver-pg`: node-postgres, pool, TLS, `ssh2` tunnel, cancel-request, server-version detection.
- Secrets: SecretStorage wiring, `SecretRef` resolution (keychain, env, `.pgpass`, `pg_service.conf`, prompt).
- Connection form webview, schema-driven from `connectionSchema`; URI paste parser; Test Connection.
- Profile stores: global + workspace file, JSON Schema published, secret-literal rejection (S1.2).
- Environment tagging, color, read-only flag, guard scaffolding.
- Explorer TreeDataProvider: lazy children, virtualized, filter box, refresh, context menus.
- `IntrospectionPlan` for PG: databases, schemas, tables, views, matviews, functions, types, sequences, extensions; version-gated catalog SQL for PG 13→17.
- Metadata cache with TTL + eager invalidation.

**Exit:** connect over TLS and over an SSH tunnel; expand a 5 000-table schema in < 1 s; no secret on disk (verified by a test that greps the whole storage dir).

---

## Phase 2 — Query mode MVP · 3 wk
**Goal:** write SQL, run it, read the results. **M1.**

- Editor↔connection binding: status bar picker, per-file persistence, `-- @pitta connection:` directive.
- Statement splitter handling dollar-quoting, `E''`, nested comments, `\` meta-commands.
- CodeLens `▶ Run · Explain`; keybindings for run-statement / run-selection / run-all / cancel.
- Execution engine: multi-statement → tabbed results, timing, `commandTag`, live elapsed, real cancel.
- Results webview v1: TanStack virtualized grid, columnar store, type-aware renderers, `NULL` token, exact `numeric`.
- Messages tab streaming `NOTICE`/`RAISE`.
- Copy as TSV/CSV/JSON/Markdown/INSERT.
- Guards live: destructive confirm, unqualified-DML block, read-only enforcement.
- Errors surfaced with `SQLSTATE`, position → squiggle mapped back into the editor.

**Exit (M1):** run a 200-column × 100k-row query; results usable; cancel actually stops the server-side query (verified against `pg_stat_activity`).

---

## Phase 3 — UI mode: data view & editing · 4 wk
**Goal:** never type SQL to look at or fix a row.

- Table Data panel: keyset paging, `LIMIT/OFFSET` fallback, generated-SQL always visible.
- Filter row with per-type operators; multi-column sort; column show/hide/pin/reorder/resize persisted.
- Cell editors per type: text, exact-decimal number, tri-state boolean, date/time w/ timezone, enum dropdown, JSON editor w/ validation, array chips, bytea up/download, FK picker.
- Staged-edit model, dirty highlighting, DML preview diff, single-transaction apply, rollback on any error, affected-row-count verification.
- Insert / duplicate / delete row.
- PK/unique detection; `ctid` opt-in fallback; clear disabled reason when neither exists.
- Structure panel: Columns · Indexes · Constraints · Triggers · Policies · Partitions · Statistics · DDL.
- `generateDdl` for tables/views/functions/types/sequences, round-trip tested against `pg_dump`.

**Exit:** edit 20 cells across 5 rows including a jsonb and an enum, apply as one transaction, verified in psql. Editing a view or PK-less table degrades gracefully with a readable reason.

---

## Phase 4 — SQL intelligence · 3 wk — **done**
- `@pgsql/parser` WASM integration (the maintained WASM build of libpg-query; ADR-026) → real Postgres grammar for syntax diagnostics + the statement analyzer used by guards (replaces Phase 2's heuristic splitter internals).
- Completion: alias-aware columns, `FROM`-driven scope, functions with signatures, enum values in comparisons, keyword ranking. Served from the metadata cache.
- Hover: types, defaults, nullability, comments, table size/row estimate.
- Go-to-definition → DDL virtual document; find-references across open `.sql` files.
- Semantic diagnostics: unknown table/column, ambiguous column, obvious type mismatch.
- Formatter + format-on-save; snippets; user templates.

**Exit:** met. Completion p95 **1.2 ms** on a 2 000-relation / 40 000-column fixture against a 50 ms budget; syntax diagnostics come from the server's own grammar rather than a corpus-matched heuristic, which is a stronger result than the acceptance test asked for.

---

## Phase 5 — Productivity · 3 wk. **M2 — public beta.** — **done, except publishing**
- Query history: JSONL store, search, filter by connection/status, re-run, prod exclusion.
- Saved queries as plain `.sql` in a workspace folder; tree view; parameter prompts (`:name` / `$1`) sent as binds.
- Export: CSV / JSON / JSONL / XLSX / SQL inserts — **streamed to disk**, progress + cancel, never fully materialized.
- Import: CSV → table with column mapping, type coercion preview, `COPY` fast path.
- SQL Notebooks (`.pittabook`): serializer, controller, per-*notebook* connection (ADR-029), HTML/JSON/markdown outputs, export to `.sql`.
- Onboarding walkthrough (`contributes.walkthroughs`), README, docs site skeleton.

**Exit (M2):** export budget met in Phase 8's benchmarks. The publish pipeline is built and the VSIX is verified in CI, but **nothing has been published**: that needs a publisher account and the two tokens, which is a decision to make rather than a task to finish.

---

## Phase 6 — Postgres power features · 4 wk — **done**
- EXPLAIN visualizer: `FORMAT JSON` → interactive tree, cost/time/rows, skew and seq-scan red flags, plan diff.
- Session monitor (`pg_stat_activity`): live table, blocking chain, cancel/terminate backend (guarded).
- Lock inspector (`pg_locks`).
- LISTEN/NOTIFY subscriber panel.
- Health advisor: unused/duplicate indexes, missing FK indexes, bloat estimate, seq-scan-heavy tables, autovacuum lag — read-only report + suggested DDL.
- Extensions panel; roles/privileges browser; publications/subscriptions/replication-slot listing.
- pgvector + PostGIS cell awareness.

**Exit:** plan visualizer renders a 60-node plan legibly and flags a known-bad estimate skew on a fixture query.

---

## Phase 7 — ERD + schema tooling · 4 wk
- ERD canvas: dagre auto-layout, FK edges, drag + persist layout, filter to neighbors, PNG/SVG export, click-through to Structure.
- Schema diff between two connections/schemas → generated migration SQL, reviewed before execution anywhere.
- Migration file export (plain SQL / Flyway naming).
- **[P2]** Visual table designer emitting reviewable `ALTER TABLE`.

**Exit:** diff two 300-table schemas in < 5 s; generated migration applies cleanly against the target and re-diffs to empty.

---

## Phase 8 — Performance & scale hardening · 3 wk (**v1.0 gate**) — **done**
- Optional forked `QueryHost` child process per connection group; driver + serialization move off the extension host.
- Columnar store tuning: typed arrays, string interning, LRU eviction against `pitta.gridCacheBudgetMB`.
- Cursor streaming end-to-end; backpressure so a fast server can't outrun the webview.
- Benchmark suite in CI with hard budgets: 1M×20 stream < 600 MB RSS · first page < 500 ms · scroll ≥ 50 fps · activation < 200 ms · tree expand on 10k objects < 1 s.
- Memory-leak soak: open/close 200 panels, run 1 000 queries, assert flat heap.
- Cold-start audit: lazy `activationEvents`, defer driver import until first connect.

**Exit:** every budget met in CI on the smallest runner tier; regressions fail the build.

---

## Phase 9 — Second driver (SQLite) · 2 wk
- `packages/driver-sqlite` implementing the full contract; passes the conformance kit.
- **Hard rule:** the PR touches only `packages/driver-sqlite`, the registry map, and docs. Any change forced in `core`/`extension` is a design defect — fix the abstraction, then re-land.
- Capability-flag gaps exercised for real (no schemas, no cursors, no LISTEN/NOTIFY) — proves the UI gating works.

**Exit:** SQLite connection browses, queries, and edits with zero core diffs. Then MySQL becomes a tractable community contribution.

---

## Phase 10 — Packaging & release · 2 wk
- Marketplace + Open VSX listings, icon, animated README demos, category/keyword tuning.
- Docs site (VitePress) — getting started, connection recipes (Docker, RDS, Cloud SQL, Supabase, Neon, SSH), troubleshooting, driver-authoring guide.
- **Remote-SSH/WSL/devcontainer doc**: connections originate on the *remote* host — the single most common user confusion.
- Telemetry opt-in flow + documented event list.
- Issue templates, `CONTRIBUTING.md`, license (MIT), security policy + disclosure address.
- Release automation: semantic-release, changelog, signed VSIX, pre-release channel.

**Exit:** clean-machine install → connected and querying in under 30 s, guided only by the README.

---

## Phase 11 — Multi-model contract generalization · 3 wk
**Goal:** the contract stops assuming SQL. No new engine ships; PostgreSQL and
SQLite behave exactly as before. Full detail in `10-ENGINE-MODEL.md`, rationale
in ADR-034.

- `EngineLanguage` on the adapter; `Statement.sql` → `Statement.text`; every
  "SQL" in a UI string reads the language's display name.
- `splitStatements` / `formatCommand` / `classifyCommand` become driver methods
  with the current SQL implementations moving to `driver-pg`, and the shared
  heuristic staying in core as the floor (ADR-027's combining rule intact).
- Imperative, paged introspection: `NodeDefinition.fetch`, tree `Load more`,
  `pitta.explorer.treePageSize`.
- Open `ObjectKind` + `NodeKindDescriptor`; explorer icons and context menus read
  descriptors instead of a switch.
- `ResultShape`; `documents` projection; `message` results render as messages.
- Missing-vs-null: wire cell gains `{ missing: true }`, grid token, `exists` /
  `notExists` / `regex` filter ops, `$unset`-style clear-vs-remove editing.
- Cursor page mode end to end: `GridQuery.page`, `QueryHandle.nextCursor`, grid
  page control degrades to Next/Previous when offsets are unavailable.
- Capability additions per `10 §8`, session-level capability overlay per ADR-035.
- `supportsAtomicEdits: false` apply path: honest dialog wording, per-edit
  applied/not-applied reporting.
- Conformance kit becomes engine-agnostic (`EngineFixture`); PG and SQLite
  re-pass it unchanged.
- Query mode, saved queries, history and notebooks become language-generic.

**Exit:** PG and SQLite pass the rewritten conformance kit with no behavior
change, the benchmark suite shows no regression, and a throwaway "echo driver"
with a non-SQL language, imperative introspection, document results and no
transactions browses and edits end to end without a core edit. That last one is
the actual test of whether this phase worked.

---

## Phase 12 — MongoDB driver · 4 wk
**Goal:** browse, query, edit and monitor MongoDB from the same UI. Detail in
`11-ENGINE-MONGODB.md`.

- `packages/driver-mongodb` on the pure-JS `mongodb` driver (ADR-046):
  connect (standalone / replica set / sharded / Atlas SRV), TLS, SCRAM / x509 /
  AWS IAM, SSH tunnel reuse, topology probe → session capabilities.
- Tree: databases, collections, views, indexes, inferred fields, server info.
- `.mongodb.js` language: acorn parse → allowlisted call shapes → BSON, never
  evaluated (ADR-042); splitting, completion from the sampled schema, hover,
  diagnostics.
- Cursor-backed streaming results; cancel via labelled operation + `killOp`
  (ADR-043).
- Document grid: sampled column union, BSON type mapping with Decimal128 and
  Int64 exact, missing token, detail pane.
- Editing: `updateOne`/`insertOne`/`deleteOne` preview, `$set` vs `$unset`,
  nested and positional paths, transactional apply where the topology allows.
- Structure sections: fields (inferred), indexes, validation, sharding, stats.
- `explain` → the existing plan visualizer, with Mongo-specific red-flag rules.
- `$currentOp` monitor + `killOp`; health report from `$indexStats`,
  `serverStatus`, `dbStats`.
- Import (CSV / JSON / NDJSON via `insertMany` batches), export (JSON, EJSON,
  NDJSON, CSV with a stated flattening rule).
- Guards: empty-filter `deleteMany`/`updateMany`, `drop*`, `$out`/`$merge`
  detection, server-side JS off by default.

**Exit:** against a seeded replica set — browse 500 collections, run a
`find` and an `aggregate`, edit a nested field and an array element and verify
in `mongosh`, cancel a slow aggregation and see the op gone from `$currentOp`,
and stream a 1M-document collection inside the existing memory budget.

---

## Phase 13 — Redis driver · 3 wk
**Goal:** a Redis client that is safe to point at production. Detail in
`12-ENGINE-REDIS.md`.

- `packages/driver-redis` on `ioredis`: standalone / sentinel / cluster, ACL
  auth, TLS, SSH tunnel reuse, `CLIENT SETNAME`, `COMMAND INFO` table read at
  connect.
- Keyspace tree: databases from `DBSIZE`/`INFO keyspace`, SCAN-based prefix
  folders from a bounded sample, cursor paging, never `KEYS` (ADR-044).
- Per-type value views: string, hash, list, set, zset, stream (+ consumer
  groups), JSON module. TTL as a first-class, editable field.
- `.redis` command language: redis-cli-compatible splitting and quoting,
  completion and hover from `COMMAND DOCS`, reply-shaped results.
- Editing through `buildEdits` with a previewed command list, `MULTI`/`EXEC`
  where slots allow, and honest no-rollback wording (ADR-041).
- Pub/Sub panel (generalized P6-T6) including keyspace notifications; `MONITOR`
  opt-in, time-boxed, refused on prod.
- `CLIENT LIST` monitor + `CLIENT KILL`; health from `INFO`, `SLOWLOG`,
  `MEMORY`, plus an opt-in sampled big-key and TTL-coverage report.
- Guards from the server's own command flags, unknown fails closed on prod.

**Exit (M5):** against a 1M-key instance — expand the tree without the server
noticing (verified with `SLOWLOG` and `INFO commandstats`: no `KEYS`, no command
above the latency budget), read and edit each key type, set and clear a TTL, and
have `FLUSHALL` on a prod-tagged profile demand the typed confirmation. Plus the
same run against a three-node cluster.

---

## Phase 14 — MySQL / MariaDB driver · 2 wk
**Goal:** the largest remaining audience, and the test of whether someone
outside the project can write a driver from the guide.

- `packages/driver-mysql` on `mysql2` (pure JS): connect, TLS, SSH tunnel,
  `KILL QUERY` cancel, `information_schema` introspection, type mapping with
  `DECIMAL` and `BIGINT` exact, backtick quoting, `?` placeholders.
- `EXPLAIN FORMAT=JSON` and `EXPLAIN ANALYZE` into the existing plan model.
- `SHOW PROCESSLIST` monitor, `performance_schema` health report,
  `LOAD DATA LOCAL INFILE` bulk path, `SHOW CREATE` DDL generation.
- Written **against the driver-authoring guide** (P10-T2), with every gap in the
  guide filed as a doc bug rather than worked around.

**Exit (M6):** conformance kit green against MySQL 8 and MariaDB 11 in CI, and
the guide updated with whatever writing this driver revealed.

---

## Phase 15 — SQL Server driver · 2 wk
**Goal:** the last of the four relational engines most teams run, and the first
one whose client protocol argues with the contract rather than fitting it.

- `packages/driver-mssql` on `mssql`/`tedious` (pure JS): connect, TLS in SQL
  Server's own two-switch vocabulary, SSH tunnel, NTLM for a domain login,
  attention-packet cancel, `sys` catalog introspection with three-part names,
  bracket quoting, `@1` placeholders.
- `SHOWPLAN_ALL` and `STATISTICS PROFILE` into the existing plan model, through
  a pinned batch, plus SQL Server's own red flags: a scan judged against the
  table's real size, a key lookup that ran too often, an estimate far from the
  actual, an implicit conversion, and the server's own operator warnings.
- `sys.dm_exec_*` session monitor, DMV health report (missing and unread
  indexes, page life expectancy, log space), `sys.sql_modules` DDL for anything
  with a body and a composed `CREATE TABLE` for anything without one.
- Exact numerics converted on the server, because TDS cannot carry them
  (ADR-058) - the one place an engine's protocol made ADR-004 a fight.

**Exit (M7):** conformance kit and integration suite green against SQL Server
2022 in docker, including that DDL inside a transaction really rolls back and
that a wide `decimal` read through the grid is exact.
