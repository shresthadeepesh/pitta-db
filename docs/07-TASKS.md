# 07 — Task Breakdown

Format: `P<phase>-T<n>` · size **S** ≤ 1 d · **M** 2–3 d · **L** 4–5 d. Deps in brackets.

## Phase 0 — Foundations
- [x] **P0-T1** (M) pnpm workspace + TS strict + package skeletons (`core`, `driver-pg`, `protocol`, `extension`, `webview-ui`)
- [x] **P0-T2** (M) esbuild extension bundle · Vite webview build · watch tasks · `.vscode/launch.json`
- [x] **P0-T3** (S) `package.json` contributes stub: activation events, one command, view container, icon placeholder
- [x] **P0-T4** (S) eslint + `dependency-cruiser` boundary rules (`core` ⊬ `vscode`/`pg`; `webview-ui` ⊬ `extension`)
- [x] **P0-T5** (S) Vitest config + first unit test; `@vscode/test-electron` harness stub
- [x] **P0-T6** (M) GitHub Actions: lint · typecheck · unit · VSIX artifact upload
- [x] **P0-T7** (S) `docker-compose.test.yml` — PG 13/15/17 + seeded fixture schema
- [x] **P0-T8** (S) Logger + output channel + secret redaction pass [S1.4]

## Phase 1 — Connections + Explorer
- [x] **P1-T1** (L) `DriverAdapter` / `Session` / `QueryHandle` / `DriverCapabilities` types + `defineDriver` registry [P0-T1]
- [x] **P1-T2** (L) `driver-pg` connect: node-postgres pool, TLS modes, server-version probe, `application_name`, `search_path`, `TimeZone`
- [x] **P1-T3** (M) Out-of-band CancelRequest implementation + test against `pg_stat_activity`
- [x] **P1-T4** (M) SSH tunnel via `ssh2`: password / key+passphrase / agent, jump host, `known_hosts` verification [S2.3]
- [x] **P1-T5** (M) SecretStorage service + `SecretRef` resolvers: keychain, env, `.pgpass`, `pg_service.conf`, prompt
- [x] **P1-T6** (M) `ConnectionProfile` model + global store + workspace file store + JSON Schema (rejects secret literals) [S1.2]
- [x] **P1-T7** (L) Connection form webview, rendered from `connectionSchema`; Test Connection; URI paste parser
- [x] **P1-T8** (S) Environment tag + color + read-only flag; status-bar and tree decoration
- [x] **P1-T9** (M) `protocol` package: zod-validated RPC envelope + typed client/host helpers [S5.2]
- [x] **P1-T10** (L) `IntrospectionPlan` for PG: databases, schemas, tables, views, matviews, foreign tables, functions, types, sequences, extensions — version-gated 13→17
- [x] **P1-T11** (L) TreeDataProvider: lazy children, filter box, refresh, context menu, drag-reorder groups
- [x] **P1-T12** (M) Metadata cache: TTL, eager DDL invalidation, disk persistence
- [x] **P1-T13** (M) Integration tests vs docker PG 13/15/17 in CI
- [x] **P1-T14** (S) Security test: grep entire storage dir for any credential after a full connect flow [S1.1]

## Phase 2 — Query mode MVP  → **M1**
> **Complete.** The grid, wire encoding, and panel shell are shared components -
> query results mount the same `Grid` as the data view. P2-T12 is covered by the
> integration suite rather than `@vscode/test-electron`; a real E2E harness is
> still outstanding.

- [x] **P2-T1** (M) Editor↔connection binding: status bar picker, per-file persistence, `-- @pitta connection:` directive
- [x] **P2-T2** (M) Statement splitter: dollar-quoting, `E''`, nested comments, `\` meta-command subset
- [x] **P2-T3** (S) CodeLens `▶ Run · Explain · Explain Analyze` + keybindings + cancel command
- [x] **P2-T4** (L) Execution engine: multi-statement queue, per-statement result, timing, `commandTag`, abort wiring
- [x] **P2-T5** (L) Results webview shell: tabbed panels, state restore across reload, theme tokens
- [x] **P2-T6** (L) **Grid v1**: TanStack Virtual rows+cols, columnar store, type renderers, `NULL` token, exact `numeric` [04 §4]
- [x] **P2-T7** (M) Type handler table for PG: arrays, json/jsonb, ranges, enums, domains, composites, uuid, bytea, interval, timestamptz, bigint, numeric
- [x] **P2-T8** (S) Messages tab — live `NOTICE`/`WARNING`/`RAISE` streaming
- [x] **P2-T9** (M) Statement analyzer v1 (heuristic) + guards: destructive confirm, unqualified-DML block, read-only enforcement [S4]
- [x] **P2-T10** (S) Error surfacing: `SQLSTATE`, message, hint, character position → editor squiggle
- [x] **P2-T11** (S) Copy-as TSV / CSV / JSON / Markdown / `INSERT`
- [x] **P2-T12** (M) E2E test: open file, bind connection, run, assert grid contents

## Phase 3 — UI mode: data view & editing
> Remaining in this phase: **P3-T9** (Structure panel tabs). DDL generation
> (P3-T10) ships as a read-only virtual `sql` document rather than a webview
> tab, so it gets syntax highlighting, find, and Save As for free.
> Paging is still offset-based; keyset is implemented and tested in
> `buildSelect` but not yet wired into the data view.

- [x] **P3-T1** (L) `buildSelect`: filters + sorts + keyset paging, `LIMIT/OFFSET` fallback, params only [S3.1]
- [x] **P3-T2** (L) Table Data panel: grid reuse, generated-SQL bar, page controls, refresh
- [x] **P3-T3** (M) Filter row UI: per-type operators and value editors
- [x] **P3-T4** (M) Column state: show/hide/pin/reorder/resize, persisted per table
- [x] **P3-T5** (L) Cell editors: text · exact-decimal · tri-state bool · date/time+tz · enum · JSON · array chips · bytea · FK picker
- [x] **P3-T6** (L) Staged-edit store, dirty highlighting, DML preview diff, single-transaction apply, rollback, affected-row verification [04 §6]
- [x] **P3-T7** (M) Insert / duplicate / delete row
- [x] **P3-T8** (M) Updatability detection from `tableOid`+`columnAttr` × `pg_index`; `ctid` opt-in; disabled-reason UI
- [x] **P3-T9** (L) Structure panel tabs: Columns · Indexes · Constraints · Triggers · Policies · Partitions · Statistics
- [x] **P3-T10** (L) `generateDdl` for table/view/matview/function/type/sequence; round-trip test vs `pg_dump`
- [x] **P3-T11** (M) Cell detail pane (long text / JSON tree / image / hex)
- [x] **P3-T12** (M) Integration tests: edit-apply-verify against real PG, incl. rollback path

## Phase 4 — SQL intelligence
- [x] **P4-T1** (L) `@pgsql/parser` WASM integration + parse cache (the maintained WASM build of libpg-query; ADR-026)
- [x] **P4-T2** (M) Replace heuristic analyzer with AST-based classification (destructive detection, statement kind, referenced objects)
- [x] **P4-T3** (L) Completion provider: alias-aware columns, FROM-scope, functions w/ signatures, enum values, keyword ranking
- [x] **P4-T4** (M) Hover provider: type, default, nullability, comment, size/row estimate
- [x] **P4-T5** (M) Go-to-definition → DDL virtual doc; find-references across open `.sql`
- [x] **P4-T6** (M) Semantic diagnostics: syntax errors, unknown relation, unknown qualified column (type mismatch not attempted - ADR-027)
- [x] **P4-T7** (S) Formatter + format-on-save + snippets + user templates
- [x] **P4-T8** (S) Completion latency benchmark: p95 1.1 ms on a 2 000-relation / 40 000-column fixture, budget 50 ms

## Phase 5 — Productivity  → **M2 beta**
> P5-T3 landed early: streaming CSV/JSON/JSONL export from the results panel,
> written through a generator into a write stream. Not started: history,
> saved queries, CSV import, notebooks.

- [x] **P5-T1** (M) Query history store (JSONL, rotation) + search UI + re-run + prod exclusion
- [x] **P5-T2** (M) Saved queries tree over a workspace folder; parameter prompts → bind params
- [x] **P5-T3** (L) Streaming exporters: CSV · JSON · JSONL · XLSX · SQL inserts, with progress + cancel
- [x] **P5-T4** (L) CSV import: column mapping, type-coercion preview, `COPY` fast path, error report
- [x] **P5-T5** (L) SQL Notebooks: serializer, controller, per-*notebook* connection (ADR-029), HTML/JSON/markdown outputs, export to `.sql`
- [x] **P5-T6** (M) Onboarding walkthrough + README + docs skeleton
- [x] **P5-T7** (S) Pre-release publish pipeline → Marketplace + Open VSX

## Phase 6 — Postgres power
> Plan visualizer, red-flag rules, plan diff, session monitor with blocking
> chains, and the health advisor are done. The lock inspector (P6-T5) is folded
> into the session monitor: `pg_blocking_pids` answers the question a separate
> `pg_locks` view would, without a second panel.
> Remaining: LISTEN/NOTIFY panel, extensions and roles browser,
> publications/subscriptions, pgvector and PostGIS cell renderers.

- [x] **P6-T1** (L) EXPLAIN JSON → `PlanNode` model + interactive tree visualizer
- [x] **P6-T2** (M) Plan red-flag rules (estimate skew, seq scan on large table, external sort, lossy bitmap, nested-loop blowup)
- [x] **P6-T3** (M) Plan diff between two runs
- [x] **P6-T4** (M) Session monitor: `pg_stat_activity` live, blocking chain, cancel/terminate (guarded)
- [x] **P6-T5** (S) Lock inspector over `pg_locks`
- [x] **P6-T6** (M) LISTEN/NOTIFY subscriber panel
- [x] **P6-T7** (L) Health advisor queries + report UI + suggested DDL
- [x] **P6-T8** (M) Extensions panel; roles/privileges browser
- [x] **P6-T9** (S) Publications / subscriptions / replication slots listing
- [x] **P6-T10** (M) pgvector + PostGIS cell renderers and snippets

## Phase 7 — ERD + schema tooling
> **Complete.** The generated migration opens as an ordinary SQL document and
> is applied through query mode, which already carries the guards (ADR-019), so
> there is no separate review panel or apply path.

- [x] **P7-T1** (L) ERD canvas: dagre layout, FK edges, pan/zoom, drag, persist
- [x] **P7-T2** (M) Neighbor filter, search, click-through to Structure
- [x] **P7-T3** (M) PNG / SVG export
- [x] **P7-T4** (L) Schema snapshot model + differ
- [x] **P7-T5** (L) Migration SQL generation + review UI + apply flow (guarded)
- [x] **P7-T6** (M) Migration file export (plain SQL / Flyway naming)

## Phase 8 — Performance (**v1.0 gate**)
- [~] **P8-T1** (L) ~~Forked `QueryHost` child process~~ — **not needed**, see ADR-023. Streaming 1M rows peaks at +10MB.
- [~] **P8-T2** (M) ~~Columnar store~~ — **not needed**, see ADR-023. Encoding runs at 48M cells/s and the panel holds one page.
- [x] **P8-T3** (M) End-to-end cursor streaming + webview backpressure
- [x] **P8-T4** (M) Benchmark suite in CI with hard budgets (Roadmap P8)
- [x] **P8-T5** (M) Memory-leak soak test (200 panels, 1 000 queries, flat heap assertion)
- [x] **P8-T6** (S) Cold-start audit: lazy activation, deferred driver import, activation < 200 ms

## Phase 9 — Second driver
> **Complete, with one finding.** The SQLite *driver* needed no core change.
> The capability audit did find three places where the host had leaked
> Postgres assumptions - row estimation, an exact-count cast, and the blank
> connection form's defaults - and fixing the first required one addition to
> the driver contract. See ADR-021.

- [x] **P9-T1** (M) Driver conformance kit in `core/test`
- [x] **P9-T2** (L) `driver-sqlite` full implementation
- [x] **P9-T3** (S) Capability-gating audit: every PG-only affordance hidden, not broken
- [x] **P9-T4** (S) CI assertion — the driver PR's diff touches no core file

## Phase 10 — Release
> **Everything that is code is done. What is left needs an account.** The
> listing, the docs site and the community files landed; the publish itself
> needs a publisher on both marketplaces and two tokens, which is a decision
> rather than a task. `docs/13-RELEASE.md` is the runbook.

- [x] **P10-T1** (M) Marketplace + Open VSX listing: categories and keywords tuned to what the Marketplace actually ranks, `pricing`, `qna` pointed at Discussions rather than the Q&A tab nobody watches, and `capabilities` declaring both untrusted-workspace and virtual-workspace support honestly — the guard settings are listed as `restrictedConfigurations`, so **VS Code itself** ignores a workspace value for them in a workspace you have not trusted and a cloned repository cannot turn the confirmations off. The demo clips are specified rather than recorded (`docs/13-RELEASE.md` section 4) and their `<img>` block sits commented in the extension README: they are committed for the listing and excluded from the VSIX, because `vsce` rewrites relative links to raw GitHub URLs and a set of GIFs would otherwise be most of the download
- [x] **P10-T2** (L) VitePress docs site under `docs/`, published to Pages by `.github/workflows/docs.yml`. Eight guide pages, ten connection recipes, the driver-authoring guide and the conformance-kit page, with the numbered design record kept as its own nav section rather than rewritten. The build fails on a dead internal link, so it is also the link check. The Remote-SSH/WSL/devcontainer caveat gets its own page and a translation table, because "`localhost` means the remote" is the single most common confusion (ADR-003)
- [ ] **P10-T3** (S) Telemetry opt-in flow + documented event list [S7] — **open, and it is a decision, not a task.** The setting exists, defaults to false, and has no implementation and no transport behind it. Either build one or drop the setting; a setting promising collection that never happens is the one option that is wrong
- [x] **P10-T4** (S) `CONTRIBUTING.md`, `SECURITY.md`, four issue templates plus a chooser routing vulnerabilities to private reporting, and a PR template whose checklist is the contract: capability gating, ADR-004 exactness, S1 secrets, S3 binding, and the `contract-change` label. MIT license was already in place
- [ ] **P10-T5** (M) semantic-release, signed VSIX — **partly done.** `release.yml` already verifies, packages, asserts the VSIX contents, gates publishing behind a reviewed environment, publishes to both marketplaces and cuts a GitHub release, and the changelog and the odd-minor pre-release channel are in place. What is missing is semantic-release itself (the version is bumped by hand, and the tag/manifest check catches the mistake that makes) and a signing certificate

## Phase 11 — Multi-model contract generalization
> **Complete.** The first five tasks landed with Redis (T4, T10, T9/T8, T11)
> before the phase itself was worked; the language, the result shapes, the
> conformance kit, the language-generic query surfaces and the echo driver
> landed together afterwards; the five partials were finished last. ADR-050
> records one planned change that turned out to be unnecessary, and ADR-060 one
> that was done differently from how it was written down.
>
> Contract work only. Every task here is a `contract-change`-labelled PR by the
> rule in ADR-021, and PostgreSQL and SQLite behave identically at the end of it.
> Design: `10-ENGINE-MODEL.md`. Rationale: ADR-034.

- [x] **P11-T1** (M) `EngineLanguage` on `DriverAdapter` (optional, resolved through `languageOf`, so a driver that says nothing still means SQL); `Statement.sql` → `Statement.text` across core, every driver and the panels; `formatCommand` hook; `splitForLanguage` replaces core's splitter at every call site; UI strings, pickers, progress and tooltips read the language's `displayName` [10 §2]
- [x] **P11-T2** (M) `splitStatements` and `formatCommand` are driver methods and every shipped driver supplies both. Done differently from how the task was written, and ADR-060 says why: moving the scanner into `driver-pg` would have meant four copies of it, and would have fixed none of what was actually wrong. The scanner and the printer stay in core and take a `SqlDialect` each driver passes, which found three real bugs the move would not have — a `;` inside a MySQL backtick identifier split a statement in two, a second `/*` in a MySQL or SQL Server buffer swallowed the rest of the file, and `GO` was handed to SQL Server as if it were T-SQL while `[odd;name]` was cut down the middle. Core keeps PostgreSQL's dialect only as the floor for a `.sql` file bound to no connection. PostgreSQL is unchanged, since its dialect is what the old default was; SQLite changes in two ways that are both corrections — it has no psql backslash commands and no dollar quoting, and used to be handed both
- [~] **P11-T3** (M) ~~`classifyCommand` on the adapter~~ — **not needed**, see ADR-050: drivers classify through the existing `parseStatement` hook, and ADR-027's combining rule is untouched
- [x] **P11-T4** (L) `NodeDefinition.fetch` + tree paging + `Load more` + `pitta.explorer.treePageSize` [ADR-037]
- [x] **P11-T5** (M) Open `ObjectKind` + `NodeKindDescriptor`: the type is `(typeof OBJECT_KINDS)[number] | (string & {})`, so it is a free string with the known kinds still autocompleting, and the explorer's two static tables are gone — the icon map and the folder-label map are now `describeNodeKind(driver, kind)`, layered per field so a driver overriding an icon does not silently turn the data view off, and the browsable-kind set is the descriptor's own `canOpenData` rather than a list of the engines that shipped first. A kind nobody described still draws, Title Cased with a neutral icon. The conformance kit asserts every kind a plan can emit is core's or the driver's, which is the typo check ADR-036 promised in place of the compiler's
- [x] **P11-T6** (M) `ResultShape` on `QueryHandle` and in `DriverCapabilities.resultShapes`, carried through the protocol into both panels; a status reply renders as a sentence and a single value as a value, and a `documents` result says its columns were sampled [ADR-038]
- [x] **P11-T7** (L) Document projection: sampled column union, `inferred` fields, stable ordering, one level of dotted flattening
- [x] **P11-T8** (L) Missing-vs-null, both directions. Reading was already done: the `MISSING` value in core, the `{missing:true}` wire cell, a grid token styled apart from NULL, filter-by-value offering exists/does-not-exist, and copy/export stating that they cannot carry the difference. Writing is now built — Remove field in the cell detail pane, where the field is named, rather than in a cell editor where clearing already lives. It stages the missing token, crosses the wire as one, reaches the driver as core's `MISSING` in `RowEdit.set`, and becomes `$unset` on MongoDB. Removing a field that is already absent is not an edit, and the host refuses the whole thing on an engine that declared `distinguishesMissing: false` rather than writing NULL and calling it the same thing
- [x] **P11-T9** (M) Cursor page mode, end to end: `QueryHandle.nextCursor()`, a host fetch path that reads it off the handle rather than through `queryAll` — the offset path is untouched — and a page control that degrades to Next/Previous when the engine has no offsets. In that mode the grid drops the jump to the first page, numbers rows within the page rather than against a total it does not have, and hides the exact count, which the host refuses outright rather than answering with a full scan; Previous works by remembering the cursors already handed out. Two things the offset path does that this one must not: asking for one row more than the page holds, which a cursor cannot give back, and reporting "more" from a row count rather than from the cursor. Redis keeps its offsets and its visible `SKIP` (ADR-049); the echo driver exercises the cursor path, and the conformance kit now asserts it for any engine without offsets
- [x] **P11-T10** (M) Capability additions + session overlay, resolved for the UI. `ConnectionManager.capabilitiesFor(profileId, database?)` overlays an already-open session and never connects — a question about what a connection can do must not be the thing that dials a production database — and every gate reads it: the server-activity command, the notification panel, and the data view's row-id fallback, document shape, atomicity promise and page mode. No call site reads `driver.capabilities` to decide what to show any more. Before a session exists the answer is the engine's flags, which is the honest answer to "what could this connection do"
- [x] **P11-T11** (M) Non-atomic apply path: dialog wording, per-edit applied/not-applied report, degraded S4.5 verification [ADR-041]
- [x] **P11-T12** (L) Conformance kit → `EngineFixture`: the kit issues no statement of its own, builds everything through the adapter, and walks either introspection form. PG and SQLite re-pass through `sqlEngineFixture`. Four new assertions: stable column union, missing-is-not-null, unknown-refused-on-prod, and which edits a failed non-atomic batch applied [10 §13]
- [x] **P11-T13** (M) Query mode, saved queries, history and notebooks are language-generic: directives and cell markers read any of the three comment styles, documents are matched against every registered engine's language rather than against `.sql`, history records the language it was written in and reopens in it, saved queries list every engine's extension, and the manifest's when-clauses and activation events cover them
- [x] **P11-T14** (S) Echo driver in `test/echo-driver`, run through the conformance kit in `test/unit/echoDriver.test.ts`: a newline-split non-SQL language, imperative paged introspection, all five result shapes, missing-not-null, cursor-only paging, a session that narrows capabilities, an unclassifiable command, and one edit that is two statements. Not shipped, not registered — this is the phase's exit test
- [x] **P11-T15** (S) Benchmark re-run, 28/28 green and measured against a build of the same tree without this work: first page of 1M 48 ms (was 48), stream 1M x 20 3.15 s at +0.7 MB (was 3.13 s), cell encoding 24M cells/s (was 24M), activation 91 ms (was 92, budget 200). No regression. Cold activation has drifted from ADR-023's number as three drivers were added since, which the baseline run shows is not Phase 11's doing

## Phase 12 — MongoDB driver
> **Complete.** The driver, the editor language, completion, hover,
> diagnostics, tree paging, the server level, `readSymbols`, the sharding
> section, the red-flag rules, document import and Extended JSON export. The
> integration, conformance and security suites are green against MongoDB 7
> standalone and a replica set; the security matrix needs no server and runs on
> every commit.
>
> Detail: `11-ENGINE-MONGODB.md`. Depends on all of Phase 11.

- [x] **P12-T1** (L) `packages/driver-mongodb` skeleton, capabilities, `connectionSchema`, URI parser, topology probe → session capabilities
- [x] **P12-T2** (L) Connect: standalone / replica set / sharded / SRV, TLS, SCRAM · x509 · AWS IAM, pool, timeouts. SSH through `@pitta/ssh`, with `directConnection` set so a tunnelled member is not left behind by topology discovery; SRV and seed lists are refused rather than half-tunnelled
- [x] **P12-T3** (M) `IntrospectionPlan`: databases, collections, views, indexes, estimated counts, a `serverNode` level listing shards or replica-set members, and paging on the database and collection levels
- [x] **P12-T4** (L) Shell-dialect parser: acorn → allowlisted call shapes → BSON, constructor literals, diagnostics. **No eval** [ADR-042]
- [x] **P12-T5** (M) Session + `QueryHandle` over cursors: batching, streaming, `fetch`, `maxTimeMS`. `nextCursor` arrived with P11-T9 and this driver does not implement it, which is the right answer rather than a gap: a MongoDB cursor is a server-side handle for streaming one result, not a token a later request resumes from, and the grid pages this engine with the skip and limit `buildSelect` actually writes. `supportsCursorPaging` was claiming otherwise and is now false — the flag has to describe the code
- [x] **P12-T6** (M) Cancel: operation comments + `$currentOp` lookup + `killOp` [ADR-043]
- [x] **P12-T7** (M) BSON type table: Decimal128 → decimal string, Int64 → bigint, ObjectId, Date, Binary, Regex, Min/MaxKey [ADR-004]
- [x] **P12-T8** (L) `buildSelect` / `buildEdits`: filters and sorts → find, `$set`/`$unset`, nested paths, transactional apply where the topology allows, and positional array paths — an index writes to that element, `$[]` to every one, and the two operators that mean "whichever matched" are refused because an edit addressed by `_id` matched none
- [x] **P12-T9** (M) Schema sampling behind the tree's columns and the Fields section, types with percentages, presence, labelled sample, and `readSymbols` for completion — bounded to a small sample per collection because it sits on a keystroke path [ADR-045]
- [x] **P12-T10** (M) `readStructure`: fields, indexes, validation, statistics, and sharding — shard key, balancing, and how the chunks are spread, which is the only place a collection sharded onto one shard is visible
- [x] **P12-T11** (M) `explain` → `QueryPlan` with examined-versus-returned carried onto each node, plus the Mongo red-flag rules: collection scan, examined-versus-returned, blocking sort, spill to disk, multikey index, unindexed `$lookup`. Engine facts ride on `PlanNode.engine` and reach the panel through `DriverAdapter.planFlags` [ADR-024]
- [x] **P12-T12** (M) `readActivity` / `stopBackend` from `$currentOp` + `killOp`; `readHealth` from `$indexStats`, `serverStatus`, index shapes
- [x] **P12-T13** (M) Completion / hover / diagnostics for the shell dialect from the sampled schema, through a new `EngineLanguageService` on the adapter: collections after `db.`, operations after a collection, sampled fields inside a filter, query operators and pipeline stages after `$`. Every suggestion and hover says the fields came from a sample
- [x] **P12-T14** (M) `bulkLoad` through batched unordered `insertMany`, plus `importRecords` for JSON arrays and NDJSON (the format is read off the file, and one bad line costs one record) and `exportRecords` writing Extended JSON so an ObjectId survives the round trip
- [x] **P12-T15** (M) Guards: empty-filter `deleteMany`/`updateMany`, `drop*`, `$out`/`$merge` pipeline walk, server-side JS flagged [11 §11]
- [x] **P12-T16** (S) `generateDdl` → runnable `createCollection` + `createIndexes` script
- [x] **P12-T17** (M) docker-compose MongoDB 7 and an 8 replica set, `mongo-seed.js` mounted into both — documents that disagree with each other on purpose — and the conformance `EngineFixture`, which is the first time the kit runs against a schemaless engine on a real server. The replica set is on mongo:7 rather than mongo:8, which refuses to start on Linux 6.19+ (SERVER-121912)
- [x] **P12-T18** (M) Integration + security suites, green against MongoDB 7 standalone and a replica set: edit-verify by reading the document back through a second command, cancel through `$currentOp`/`killOp`, projection and missing-vs-null against real documents, and a prod guard matrix that runs on every commit. Running them found five real bugs, all fixed - an unreadable command classified safe rather than failing closed, an empty-filter `deleteMany` that was not destructive, a cursor error escaping as a raw `MongoServerError`, an explicit null dropped on insert, an `_id` always coerced to ObjectId (so a numeric or string key never matched), cancel released before the cursor was pulled (so it killed nothing), and writes inside a transaction issued without the client session (so nothing rolled back)

## Phase 13 — Redis driver
> **Complete.** The driver, the `.redis` editor language, the subscription
> panel, the TTL action, cluster's node level, cross-slot handling, replica
> reads, the big-key and TTL-coverage findings, and the settings that relax
> `KEYS`/`MONITOR`. Green against Redis 6.2, 7, redis-stack and a one-node
> cluster. The 1M-key assertion is opt-in behind `PITTA_TEST_REDIS_BIG=1`,
> because writing a million keys takes a minute and nobody wants that on every
> run - it passes. ADR-049 records how offset paging over a scan is expressed.
>
> Detail: `12-ENGINE-REDIS.md`.

- [x] **P13-T1** (L) `packages/driver-redis` skeleton, capabilities, `connectionSchema` (standalone / sentinel / cluster), `redis(s)://` parser
- [x] **P13-T2** (M) Connect: ACL auth, TLS, `CLIENT SETNAME`, `COMMAND INFO` table, topology probe, and SSH through `@pitta/ssh` — standalone only, because cluster and sentinel are handed the other nodes' own addresses and one forward cannot serve them
- [x] **P13-T3** (L) Keyspace tree: databases via `DBSIZE` / `INFO keyspace` (CONFIG-disabled fallback), SCAN prefix folders from a bounded sample, cursor paging, estimate labelling [ADR-044]
- [x] **P13-T4** (L) Per-type value views + `buildSelect`: string · hash · list · set · zset · stream · JSON module
- [~] **P13-T5** (M) `buildEdits` per type and the no-rollback wording — done, including the preview and the partial-apply report; commands run in order without `MULTI`/`EXEC`, which changes nothing about what is promised
- [x] **P13-T6** (M) TTL — shown in the structure view, and the editor action is wired: a prompt on the key rather than a cell in the grid, because TTL is a property of the key and not one of its fields. Empty clears it through `PERSIST`, which is not the same as an expiry of zero
- [x] **P13-T7** (M) `.redis` language: a splitter that ends a command at a newline *outside* quotes, completion and hover built from the server's own `COMMAND DOCS`, subcommands of the container commands, and diagnostics for unbalanced quotes, refused commands and commands this server does not have. Keys are deliberately never suggested (ADR-044)
- [x] **P13-T8** (M) Guards from command flags; always-destructive list; `KEYS` and `MONITOR` refusals; `EVAL` handling; unknown fails closed on prod [12 §9]
- [x] **P13-T9** (M) The notify panel is now the subscription panel and knows no engine: discovery is `readChannels`, publishing is `buildPublish`, delivery is `session.listen`. Redis offers `PUBSUB CHANNELS` plus the keyspace-notification patterns, and only when `notify-keyspace-events` is actually set. `MONITOR` is opt-in through `pitta.redis.allowMonitor`, stops itself after `pitta.redis.monitorSeconds`, and is refused on production whatever the setting says
- [x] **P13-T10** (M) `readActivity` / `stopBackend` from `CLIENT LIST` / `CLIENT KILL`
- [x] **P13-T11** (M) `readHealth`: memory, eviction, persistence, replication, blocked clients, hit rate, slowlog, and a bounded keyspace sample reporting the largest key and how much of the sample expires — a sample, and labelled as one, because the alternative is `KEYS` (ADR-044)
- [x] **P13-T12** (S) Cluster mode: a nodes level reading `CLUSTER NODES` with slot ranges (and `INFO replication` off a cluster), cross-slot commands split per slot and merged back in the caller's key order where that is meaningful and refused with the hash-tag explanation where it is not, and opt-in replica reads — opt-in because a replica can be behind, and a client that quietly read from one makes staleness look like a bug in the data
- [x] **P13-T13** (M) docker-compose Redis 6.2 and 7 plus an integration suite that seeds and cleans up after itself; redis-stack and a one-node cluster added, and the conformance `EngineFixture` written against a hash. Green against 6.2, 7, redis-stack and the cluster
- [x] **P13-T14** (M) Safety tests: `KEYS` and `MONITOR` refusals, the read-only guard, unknown-fails-closed, and value binding against a scripted server and again against a real one, plus the partial-apply promise, the TTL round trip, and the cluster's slot arithmetic checked against `CLUSTER KEYSLOT`. The 1M-key assertion runs under `PITTA_TEST_REDIS_BIG=1` and passes: a million keys written, a prefix folder still expanding in well under the budget. Running the suite found two real bugs - the whole file had never executed (its reachability flag was read at collection time, so every test silently skipped), and `COMMAND INFO` with no arguments is empty on Redis 6.2, which left the oldest supported server with no classification table and every write past the read-only guard

## Phase 14 — MySQL / MariaDB driver
> **Complete.** Written alongside MongoDB rather than after it, and it did land
> against the existing contract almost unchanged - which is the result ADR-047
> predicted and the reason it was scheduled last. Results stream, the plan has
> MySQL's own red flags, and the tunnel is shared with every other driver. The
> conformance and integration suites are green against MySQL 8 and MariaDB 11 -
> which is what "supported" means (docs/03-DRIVER-API.md section 6).

- [x] **P14-T1** (L) `packages/driver-mysql` on `mysql2`: connect, TLS, pool, `KILL QUERY` cancel, and SSH through `@pitta/ssh`
- [x] **P14-T2** (L) `information_schema` introspection; backtick quoting; `?` placeholders; DECIMAL/BIGINT exact
- [x] **P14-T3** (M) `EXPLAIN FORMAT=JSON` → plan model, with `EXPLAIN ANALYZE` supplying measured time, plus the MySQL red-flag rules: a full scan, an available index the optimizer passed over, examined-versus-returned, a low `filtered` percentage, a filesort, a temporary table
- [x] **P14-T4** (M) Processlist monitor; `performance_schema` and status-counter health report; `SHOW CREATE` DDL
- [~] **P14-T5** (M) Bulk import through batched INSERTs in one transaction. `LOAD DATA LOCAL INFILE` is deliberately not used — see ADR-056
- [x] **P14-T6** (M) docker-compose MySQL 8 + MariaDB 11, with the conformance and integration suites green against both (`PITTA_TEST_MYSQL_FLAVOUR=mariadb` picks the second). Running them found two real bugs: `EXPLAIN ANALYZE` is a syntax error on MariaDB, which spells it `ANALYZE FORMAT=JSON`, and MariaDB's plan JSON names its row counts `rows`/`r_rows` rather than `rows_examined_per_scan` - so every MariaDB plan reached the red-flag rules with no numbers in it and reported nothing at all
- [x] **P14-T8** (M) Streaming results: a query asked to stream holds its own pooled connection, leaves the stream paused and reads only what `fetch` pulls, and a connection abandoned mid-result is destroyed rather than handed back half-read. `supportsCursors` is now true because the behaviour is
- [x] **P14-T7** (S) The guide exists (P10-T2) and answers every gap the fourth, fifth and sixth drivers found; `03-DRIVER-API.md` section 7 is now the index that says which section answers which, rather than a list of things nobody had written down. Finishing Phase 11 against six written drivers added four more, all of them now sections of the guide: whose SQL a dialect is (ADR-060), naming a tree level core has no vocabulary for, reporting the end of a scan with `nextCursor`, and that removing a field is not clearing it

## Phase 15 — SQL Server driver
> **Complete.** Relational and SQL, so most of it landed against the existing
> contract unchanged - and the parts that did not were about TDS rather than
> about T-SQL. Every statement goes through `sp_executesql`, which makes `USE`
> and session `SET` meaningless (ADR-059), and the protocol decodes `decimal`
> into a double, which is the only engine so far where ADR-004 had to be
> defended on the server (ADR-058). The conformance and integration suites are
> green against SQL Server 2022 - which is what "supported" means
> (docs/03-DRIVER-API.md section 6).

- [x] **P15-T1** (L) `packages/driver-mssql` on `mssql`/`tedious`: connect, TLS mapped onto `encrypt` + `trustServerCertificate`, pool, NTLM for a domain login, named instances, attention-packet cancel, and SSH through `@pitta/ssh`
- [x] **P15-T2** (L) `sys` catalog introspection with three-part names so the tree crosses databases without `USE`; bracket quoting; `@1` placeholders; `decimal`/`bigint` exact (ADR-058)
- [x] **P15-T3** (M) `SHOWPLAN_ALL` and `STATISTICS PROFILE` → plan model through a pinned batch (ADR-059), plus the SQL Server red-flag rules: a scan judged against the table's own row count rather than what it returned, a key lookup that ran too often, an estimate far from the actual, a `CONVERT_IMPLICIT` that quietly disables an index, and the server's own operator warnings
- [x] **P15-T4** (M) `sys.dm_exec_*` session monitor with the blocker named directly; DMV health report (missing indexes, unread indexes, page life expectancy, log space); `sys.sql_modules` DDL for modules and a composed `CREATE TABLE` for tables
- [x] **P15-T5** (M) Streaming results: a query asked to stream pauses the request as soon as a page has arrived and resumes only when `fetch` asks, and a request abandoned mid-result is cancelled rather than returned to the pool half-read
- [x] **P15-T7** (M) Security and correctness review of the finished driver, which found five things worth the pass. A failed `explain` left `SET SHOWPLAN_ALL ON` on its pooled connection - the setting outlives both the statement and the rollback - so every later query that borrowed that connection returned *no rows at all* rather than an error; the cleanup now runs whatever happened, with a regression test that runs more queries than the pool has connections. `readOnly` was enforced nowhere in the driver while the capability claimed the server was doing it (S4.10); it is now refused in the client, the flag says false, and the T-SQL writes the shared heuristic reads as harmless - `EXEC`, `SELECT … INTO`, `BULK INSERT`, `RESTORE`, `BACKUP`, `DBCC`, `KILL` - are classified by the driver so the read-only block and the production confirmation see them (ADR-007, S4.4). A case-sensitive `LIKE` put a `COLLATE` clause on whatever column it was given, which is a syntax error on an int or a datetime. A `time` column read back as `1970-01-01T03:04:05Z`, an epoch date in a cell that holds a time of day, and a `date` as a midnight instant a time zone could move. And the health report's suggested SQL did not quote the identifiers it had read out of the catalog
- [x] **P15-T6** (M) docker-compose SQL Server 2022, with the conformance and integration suites green against it. Running them found three real bugs: `batch()` reports no column metadata at all (only `query()` does), so every plan rowset arrived unreadable; `mssql`'s type objects are functions that *carry* a `declaration` rather than returning one, so every decimal column was described as an nvarchar and skipped its scale; and a plan's scan node reports the rows it produced rather than the rows it read, so a full scan of twenty thousand rows returning three was not reported at all until the driver started asking the catalog for the table's real size

## Phase 16 — Stored routines
> A procedure was something Pitta could *show*. Everything people actually do
> with one - change it, call it, watch it run, find out where it broke - was
> done elsewhere, which for a five-hundred-line procedure means a scratch
> buffer, a paste back, and `RAISE` statements added one run at a time. This
> phase is that loop, closed inside the editor. What it is not is a step
> debugger: breakpoints, stepping and variable watch are their own phase, and
> they belong behind a debug adapter rather than in a panel.

- [x] **P16-T1** (M) `RoutineSupport` on the driver contract - `describe`, `buildReplace`, `buildDrop`, `buildInvoke`, `locateError` - with the data types in `model/routine.ts` so the capability can name `Session` without core importing itself in a circle. `PittaError` and the statement wire carry `context`, which is the engine's own stack
- [x] **P16-T2** (L) Routines are edited as documents: a `FileSystemProvider` on `pitta-routine`, so a definition gets a dirty marker, `Ctrl+S`, revert and a diff against the server for free. Saving runs the guards, replaces inside a transaction where the engine has one, and puts a failure on the line of the *body* it happened in. The Postgres overload trap - `CREATE OR REPLACE FUNCTION` with a changed argument type creates a second function and reports success - is detected against the server after the save rather than by parsing the edited text
- [x] **P16-T3** (M) Run Routine: arguments come from the catalog with their names, declared types and defaults, `OUT` parameters are not asked for, and the prompt is the parameters form from P13. The call is built by the driver - `CALL`, `SELECT * FROM`, `EXEC … OUTPUT` and the select that reads it back - and the runner gained a way to be handed statements rather than splitting text into them
- [x] **P16-T4** (M) Messages while it runs. SQL Server's `PRINT` was never listened for and MySQL's warnings were never asked for, so on two of the three engines a long procedure reported nothing at all; both are wired now, and every notice is pushed to the panel as it arrives instead of being attached to the statement when it ends. A failure shows the engine's stack under *Where*
- [x] **P16-T5** (M) SQL Server and MySQL parity for reading, replacing and calling. MySQL is the engine with no `CREATE OR REPLACE` and no transactional DDL, so its replacement is a drop and a create that nothing undoes: the editor warns first and restores the old definition when the create fails
- [ ] **P16-T6** (M) Integration tests against the docker compose: a routine round-trips through `describe → buildReplace → describe` unchanged, a failure inside a body lands on the right line, and `PRINT`/`RAISE`/`SIGNAL` output arrives while the call is still running
