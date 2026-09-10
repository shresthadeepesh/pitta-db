# 09 — Decision Log (ADRs)

## ADR-001 · Pluggable driver registry from day one, Postgres shipped first
**Decided.** Define `DriverAdapter` + capability flags in Phase 1; only `driver-pg` exists until Phase 9.
**Why:** retrofitting multi-engine support after a Postgres-shaped core is the failure mode that produced every "PostgreSQL-only forever" extension. Cost is ~1 week of interface design; the alternative is a rewrite.
**Guard:** `dependency-cruiser` forbids `core`/`extension` importing `pg`, and forbids `if (driver.id === …)` branching (lint rule). Phase 9's SQLite PR must not touch core.

## ADR-002 · Webview + React 19 + TanStack Virtual for heavy panels
**Decided.**
**Why:** native VS Code UI has no data grid, no inline cell editing, no canvas. TreeView/QuickPick cover the explorer; everything else needs a webview. React chosen over Lit for the ecosystem around virtualized tables and the ERD canvas.
**Cost:** webview cold-start (~100–200 ms) and CSP discipline. Mitigated by keeping activation lazy and panels retained.

## ADR-003 · Node extension host only; no web extension build for v1
**Decided.**
**Why:** node-postgres needs TCP sockets. A browser build requires a WebSocket proxy the user must run — a different product. Revisit once demand is proven.
**Consequence:** `"extensionKind": ["workspace"]`, and the Remote-SSH "localhost means the remote" caveat gets top billing in the docs.

## ADR-004 · `numeric`/`int8` never touch JS `Number`
**Decided.** Parsed to string / `bigint`, rendered and edited as string.
**Why:** silent precision loss on money columns is the worst class of bug a DB client can have, and most existing extensions have it.
**Cost:** sorting and filtering on those columns is server-side or string/BigInt-comparison based; slightly more work in the grid.

## ADR-005 · Secrets only in `vscode.SecretStorage`
**Decided.** Workspace connection files hold `SecretRef`s; the JSON Schema rejects literal passwords.
**Why:** committed credentials are the #1 real-world harm from repo-shareable DB configs. Making the *file format itself* incapable of holding a secret beats documentation.

## ADR-006 · Environment tagging + write guards are core, not a nice-to-have
**Decided.** `dev|staging|prod` on every profile, color everywhere, typed confirmation for destructive statements on prod, unqualified DML blocked by default.
**Why:** the single most-cited fear about editor-embedded DB clients. Cheap to build, strong differentiator.

## ADR-007 · Real Postgres parser (`libpg-query` WASM), not regex
**Decided.** Phase 4 introduces it; Phase 2 ships a documented heuristic splitter as a stopgap.
**Why:** dollar-quoting, nested comments, and `E''` defeat regex splitting, and guard classification must not be fooled by a comment containing `DROP TABLE`.
**Cost:** ~1.5 MB WASM, lazily loaded.

## ADR-008 · Server-side cursors + columnar store instead of buffering rows
**Decided.**
**Why:** the shared failure of existing extensions is materializing every row as a JS object. Cursor + columnar buffers is the difference between 50k rows and 1M.
**Cost:** cursors hold a transaction open; mitigated by an idle timeout and an explicit "cursor open" indicator.

## ADR-009 · `QueryHost` child process deferred to Phase 8, interface-ready from Phase 1
**Decided.**
**Why:** in-process is simpler and adequate through beta; the `Session` interface is process-agnostic from the start, so the move is transport work, not a redesign.

## ADR-010 · MIT license, open core, no paywalled features
**Decided.**
**Why:** the freemium extensions are the main thing users complain about. Differentiation is quality, not feature gating. Sustainability, if needed later, comes from optional paid *team* services (shared connection catalogs, audit) — never from crippling the client.

## ADR-011 · Publish to both Marketplace and Open VSX
**Decided.** Avoid VS Code-proprietary APIs so Cursor / Windsurf / VSCodium work from the same VSIX.
**Cost:** near zero. Reach: large.

## ADR-012 · Pure-JS runtime dependencies; no native modules
**Decided.**
**Why:** native modules force per-platform VSIX builds and break in some remote/devcontainer images. `pg` is pure JS; `ssh2`'s native crypto is optional with a JS fallback.

## ADR-013 - `prefer` and `allow` are implemented as real negotiating modes
**Decided.** For `sslmode=prefer` Pitta attempts TLS and, on a TLS-negotiation
failure specifically, retries in plaintext; `allow` does the reverse. Every
other mode is absolute and never falls back.
**Why:** node-postgres has no notion of a negotiating mode - handed an ssl
option it fails outright against a server built without TLS, which is most
local development installs. Without this, `prefer` behaved as `require` and
Postgres.app / a default Homebrew server could not be connected to at all.
Found by the integration suite on the first real run.
**Guard:** the fallback triggers only on messages that indicate TLS negotiation
("does not support SSL", "SSL off"). An authentication failure must never cause
a plaintext retry, or a password would be re-sent in the clear. Unit-tested
explicitly.


## ADR-014 - DDL is a virtual read-only document, not a panel tab
**Decided.** `pitta-ddl:` scheme + `TextDocumentContentProvider`, opened as a
`sql` document.
**Why:** syntax highlighting, find, folding, copy, and Save As all come free and
behave the way the user already expects. A webview tab would reimplement each of
them worse, and the output is plain text with no interaction to speak of.
**Consequence:** the Structure panel (P3-T9) loses its DDL tab; the tree already
exposes columns, indexes, constraints, triggers, and policies as child nodes,
so what remains for that panel is a consolidated view rather than new data.

## ADR-015 - A failed statement stops the batch
**Decided.** When one statement in a run fails, the rest are marked skipped
rather than attempted.
**Why:** the statements in a file are usually a sequence, not a set. Running
statement 5 after statement 4 failed executes it against a state the author did
not intend. Skipped statements are shown as skipped, so nothing is silent.

## ADR-016 - An editor binding names a database, not just a connection
**Decided.** A `.sql` file is bound to `(connection, database)`. The status bar
always shows both, and "New Query" from a database node binds to that database.
**Why:** Postgres cannot query across databases, so a connection alone does not
say where a statement lands. A file bound only to `orders-prod` still has to
choose between `orders` and `analytics`, and choosing wrong is a *silent*
failure - the statement runs, against the wrong data. Naming both makes the
target unambiguous everywhere it is displayed, including the production
confirmation prompt.
**Directives:** `-- @pitta connection: name` and `-- @pitta database: db`.
Either pins; both travel with a checked-in file.

## ADR-017 - The schema graph is read in two queries, not two per table
**Decided.** `readSchemaGraph` issues one query for relations (columns packed
per row) and one for foreign keys.
**Why:** a 300-table schema drawn by introspecting each relation individually is
300 round trips for one picture, and many tables is exactly the case where a
diagram earns its keep. Packing columns into one array per relation, separated
by ASCII 31, keeps the result set narrow enough to draw in one pass.

## ADR-018 - The diagram is SVG with resolved colors, not canvas
**Decided.** Tables and edges are SVG elements; colors are resolved from the
theme variables into concrete values before drawing.
**Why:** SVG gives hit-testing, text selection, and accessible labels for free,
and the same element tree is what gets exported. Concrete colors are what make
the export usable - a file full of `var(--vscode-...)` renders blank outside the
editor. The palette is re-resolved when the theme changes, so the on-screen
diagram still follows light/dark.

## ADR-019 - A generated migration is a SQL document, applied through query mode
**Decided.** Schema comparison produces a `pitta-migration:` virtual document
rather than a bespoke review panel with its own Apply button.
**Why:** the reviewer gets highlighting, find, folding and Save As for free, and
running it goes through query mode - which already has the destructive-statement
guards, the typed production confirmation, per-statement results, and real
cancellation. A separate apply path would have had to reimplement all of that,
and would have been the weaker of the two.
**Consequence:** applying is deliberately two steps (generate, then run). That
is the right friction for a schema migration.

## ADR-020 - Definitions are compared with the schema qualifier removed
**Decided.** Constraint, index, view, routine and user-defined column types are
normalized by stripping their own schema name before comparison, and the
renderer can retarget the qualifier baked into server-rendered definitions.
**Why:** `pg_get_constraintdef` renders `REFERENCES v1.parent(id)`. Comparing
`v1` against `v2` verbatim reports every foreign key, index, view and enum
column as changed - forever. The generated migration would drop and re-add them
on every run and never converge. Caught by the round-trip integration tests,
which apply each migration and re-diff expecting nothing.

## ADR-021 - ADR-001 held for the driver, but the host had leaked
**Finding.** Adding SQLite needed no change to `packages/core` for the *driver
itself*: capabilities, introspection, SQL building, types and DDL all fit the
existing contract, and the same conformance kit passes against both engines.

But the audit (P9-T3) found three places where the extension host had quietly
assumed Postgres:

1. `TableDataService.estimateRows` ran `pg_catalog.pg_class` SQL directly.
   Fixed by adding an optional `estimateRowCount` to `DriverAdapter` - a real
   contract addition, so the strict "no core change" form of ADR-001 was not met.
2. The exact-count query used a `::text` cast, which SQLite rejects.
3. The blank connection form hardcoded host/port/database defaults, which are
   meaningless for a file-backed engine. Defaults now come from the driver's own
   `connectionSchema`.

**Why it is worth recording as a finding rather than quietly fixing.** The
abstraction was only ever tested against one engine, and single-engine
abstractions drift without anyone noticing. CI now fails a PR that touches both
`packages/driver-*` and `packages/core/src` unless it carries a
`contract-change` label, so the next drift is a deliberate decision.

## ADR-022 - SQLite ships as WebAssembly, not a native binding
**Decided.** `node-sqlite3-wasm`, vendored next to the bundle at build time.
**Why:** ADR-012 rules out native modules - they force a per-platform VSIX and
break in some remote and devcontainer images. `node:sqlite` would be simpler,
but VS Code's Electron ships Node 20 and that module landed in Node 22.
**Cost:** ~1.3MB of WASM, loaded lazily on first SQLite connection so a user who
never opens one does not pay for it at activation.

## ADR-023 - Two performance tasks cancelled by measurement
**Decided.** P8-T1 (a forked QueryHost child process) and P8-T2 (a columnar
store with typed arrays and string interning) are not being built.

**Why.** Both were planned before anything was measured. The benchmark suite
now says:

| Measurement | Result | Budget |
|---|---|---|
| Stream 1M rows x 20 columns | 3.1 s, peak **+10 MB** | 600 MB |
| Memory vs result size | 50k: +3.5 MB · 500k: +2.0 MB | flat |
| First page of 1M rows | **55 ms** | 500 ms |
| First page, 10k vs 2M rows | 2 ms vs 97 ms | independent of size |
| Activation, cold bundle load | **28 ms** | 200 ms |
| 1000 queries opened and disposed | +14.6 MB | no leak |
| Cell encoding | 48M cells/s | - |

P8-T1 existed to stop a large result exhausting the extension host. A million
rows costs ten megabytes, so the problem it solves does not occur; a child
process and a pipe transport would be real complexity bought for nothing.

P8-T2 existed to reduce grid memory. Cells already cross the boundary as text,
the panel holds one page, and encoding is not close to being a bottleneck.

If a future workload contradicts these numbers the benchmarks will say so,
because they now run in CI as assertions rather than as a report nobody reads.

**What measurement did change:** `pitta.maxRowsInMemory` defaulted to 200,000,
which costs **+108.8 MB** on a 20-column result. Lowered to 50,000 - about
27 MB - because that ceiling exists to bound an accidental `SELECT *`, and
anyone who genuinely wants a larger result can raise it.

**Still open:** P8-T3. The runner buffers up to the cap before the panel sees
anything, so a large result is held in the host even though only a page is
displayed. The lower default reduces the cost; it does not remove it.

## ADR-024 - Plan findings carry advice, not just labels
**Decided.** Every red-flag rule states what it observed, in numbers, and what
that usually means.
**Why:** a visualizer that only draws the tree leaves the reader to know what to
look for, and "Seq Scan" on its own is not a problem - on a forty-row table it
is the right plan. The rules therefore measure rows *scanned* rather than rows
returned, weigh a filter's selectivity, and account for loops, so that what is
reported is a finding rather than a node type.

Caught by testing against a real planner: the sequential-scan rule originally
counted rows returned, so a scan reading 100,000 rows and returning none - the
case most worth flagging - was silently missed.

## ADR-025 - Session monitoring goes through the driver contract
**Decided.** `readActivity`, `stopBackend` and `readHealth` are optional methods
on `DriverAdapter`, behind `supportsSessionMonitor` and `supportsHealthReport`.
**Why:** the first draft of the panel imported `@pitta/driver-pg` directly,
which is precisely the leak ADR-021 had just been written about. SQLite has no
concurrent sessions to inspect, declares both flags false, and the command
declines instead of failing.
**Also:** nothing is polled by default. A monitor sampling `pg_stat_activity`
every second is itself load on the server it is watching, so refresh is manual
with an opt-in five-second auto mode.

---
### Open questions
- **OQ-1** Publisher name and final extension name (`pitta-db` is a working title; check Marketplace availability).
- **OQ-2** Notebook file extension — `.psql-nb` vs reusing `.ipynb` with a SQL kernel.
- **OQ-3** Do we ship the optional DDL event-trigger for cross-client cache invalidation, or is asking users to install a trigger too invasive? (Leaning: ship it, off by default, documented.)
- **OQ-4** ~~Second driver: SQLite vs MySQL.~~ **Resolved** by ADR-047: SQLite
  shipped in Phase 9; the order after it is contract generalization (Phase 11),
  MongoDB (12), Redis (13), MySQL/MariaDB (14).
- **OQ-5** MongoDB Atlas Search and vector search: a separate tree branch and a
  query surface, or out of scope for a client? (Leaning: list the indexes in
  Phase 12, defer the search UI.)
- **OQ-6** Redis modules — JSON, Time Series, Search, Bloom, vector sets. JSON is
  in for Phase 13 because it changes how a key is *displayed*. The others are
  detected and listed; whether any gets a real view is a post-13 question.
- **OQ-7** Which engines a `.pittabook` may mix. ADR-029 binds a notebook to one
  database, which already answers it for now, but a "read from Postgres, write to
  Redis" notebook is the obvious next request and the answer is currently no
  (ADR-048).
- **OQ-8** Whether Amazon DocumentDB, Azure Cosmos DB's Mongo API, Valkey and
  Dragonfly are claimed as supported. Each answers a subset of the wire protocol.
  Position: they are not claimed until they run in CI (the `03 §6` rule), but the
  driver should not go out of its way to break on them.

## ADR-026 - The Postgres grammar ships as WebAssembly, vendored beside the bundle

**Context.** ADR-007 promised the Phase 2 heuristic classifier would be replaced
by a real parse tree. The obvious candidate, `libpg-query`, is a native addon:
it would mean a per-platform VSIX and a compiler on the user's machine, which
ADR-012 rules out.

**Decision.** Use `@pgsql/parser`, which is the same Postgres grammar compiled
to WebAssembly. The v17 grammar is vendored into `dist/vendor/pgsql-parser/`
by the build and loaded lazily through `createRequire`, first from the vendored
path and then from node_modules, so the same code works from source and from a
VSIX.

Only v17 is shipped. The package carries v13 through v18 and each has its own
1.1 MB `.wasm`; v17 accepts the syntax of every version Pitta supports, so the
other five would add ~7 MB for grammars nothing loads.

**Consequences.** No native module, one platform-neutral VSIX, and 1.3 MB added
to the package. The parser loads when a `.sql` file first appears rather than at
activation - activation stays at 31 ms - and every caller falls back to the
heuristic while it is loading.

Finding this also exposed a real packaging bug: esbuild compiles
`import.meta.url` to an empty object in a CJS bundle, so *both* WASM loaders -
the parser and the SQLite runtime shipped in Phase 9 - were resolving their
vendored files against `undefined`. The build now defines `import.meta.url` as
the bundle's own path.

## ADR-027 - The parse tree and the heuristic disagree toward asking

**Context.** With a real parser, the question is what to do when it and the
heuristic classifier disagree, and what to do when the parser has not loaded or
the statement does not parse.

**Decision.** `classifyStatement` combines them, and only in one direction: a
statement is destructive if *either* says it is. The parse tree wins on what a
statement *is* - its kind, its relations, its aliases - but it can never
downgrade a destructive verdict. A statement that does not parse keeps the
heuristic's answer rather than being treated as safe, because a syntax error
says nothing about whether the text would have dropped a table.

Semantic diagnostics inherit the same caution. Syntax errors are reported as
errors, because the server's own grammar rejected the text. Unknown names are
warnings, are suppressed entirely when the symbol index is empty, and only cover
relations and *qualified* columns - an unqualified name has too many legitimate
ways to resolve (CTE output, a function's columns, an alias defined later) for a
warning to be trustworthy.

**Consequences.** Guards can never be weakened by a parser bug, only
strengthened. The cost is that a heuristic false positive survives the parse
tree; measured against a set of statements the heuristic gets right, that has
not been observed, and the failure it prevents is the expensive one.

## ADR-028 - Saved queries are files, history is not

**Context.** Phase 5 adds two ways to keep a statement around, and they pull in
opposite directions. A saved query is something a team curates. History is a
byproduct of working.

**Decision.** Saved queries are ordinary `.sql` files in a workspace folder
(`.pitta/queries` by default), so they are reviewed, diffed, and versioned like
any other file, and subdirectories become groups in the tree. History is JSONL
in the extension's global storage, is not shared, and **excludes production by
default** - it is a durable record of statements run against real databases, so
what it omits is part of the design (S6).

Saved queries may take `:name` parameters. Those are rewritten to the engine's
positional placeholders through `driver.placeholder`, and the values are bound,
never interpolated - a saved query cannot be turned into an injection by what
someone types at the prompt (S3).

**Consequences.** A team shares saved queries through their repository and
nothing else. History stays local and stays out of production by default; a team
that wants production recorded has to say so explicitly.

## ADR-029 - A notebook is bound to one database, and saves as runnable SQL

**Context.** Notebooks could bind per cell, and could serialize to JSON with
their outputs like Jupyter.

**Decision.** Neither. The binding is per notebook, because a notebook is a
narrative about one database and a cell that quietly ran somewhere else makes
the narrative false. The file is a runnable `.sql` script, with cell boundaries
and markdown carried in comments the parser ignores, so a notebook someone
commits reads well in a diff and still runs under psql.

Outputs are never saved. A result set is a snapshot of a database at one moment,
and writing it into a file that looks like a script invites the next reader to
take stale numbers as current.

**Consequences.** A `.pittabook` is diffable and portable, and opening a plain
`.sql` file as a notebook works - it is split into one cell per statement. The
cost is that reopening a notebook shows no results until the cells are run
again, which is the intended trade.

## ADR-030 - Bulk import goes through the driver, and validates before it writes

**Context.** Importing a CSV with a loop of INSERTs is slow enough to make the
feature useless on the files people actually import, and Postgres has COPY.
COPY is a protocol mode rather than a statement, so it does not fit the
QueryHandle contract.

**Decision.** `bulkLoad` on the driver contract, gated on a new
`supportsBulkLoad` capability, taking rows as an async iterable so a 2 GB file
never becomes 2 GB of memory (ADR-008). PostgreSQL implements it with
`COPY ... FROM STDIN`; an engine without a bulk path falls back to batched
multi-row INSERTs inside one transaction, so a failure halfway through leaves
the table unchanged either way.

Coercion runs *before* anything is sent, on a capped sample, and the failures
are shown as a report. Learning that column 7 contains `N/A` after 400,000 rows
have been committed is the failure this exists to prevent. Numeric values are
sent as text, never through a JS number, on the way in as well as out (ADR-004).

**Consequences.** One new capability flag and one new optional contract method,
which is the additive shape ADR-001 asks for. COPY's text format means escaping
is Pitta's responsibility: an unescaped tab does not produce a bad row, it
shifts every following column, so that escaping is tested directly.

## ADR-031 - Nothing hand-written may live in the webview output directory

**Context.** The walkthrough pages were written into
`packages/extension/media/walkthrough/`. The Vite build writes webview bundles
into `packages/extension/media` with `emptyOutDir: true`, so the next build
deleted them. Everything still compiled, every test still passed, and the VSIX
shipped without the files - a failure visible only to a user.

**Decision.** Anything the extension ships that is not a webview build output
lives in its own directory beside `media/` - `walkthrough/`, `snippets/`,
`resources/`. A manifest test asserts that every file the manifest points at
exists on disk and is not under `media/`, and the release workflow greps the
built VSIX for the files that are loaded at runtime rather than imported.

**Consequences.** The class of bug where a build silently removes a shipped
asset now fails a test rather than reaching a user. The same VSIX check also
covers the two WASM runtimes, which are loaded from disk and would otherwise
fail only at runtime.

## ADR-032 - The structure view is a list of sections, not a fixed set of tabs

**Context.** The structure view shows what a table has besides rows: columns,
indexes, constraints, triggers, policies, partitions, statistics. The obvious
implementation is a typed record per section and a tab component that knows all
seven.

**Decision.** The driver returns `StructureSection[]` - each a label, a list of
column descriptors, and rows of text - and the panel renders whatever it was
given, in the order core sorts them into. Which sections exist is an engine
decision: PostgreSQL has row-level policies and declarative partitions, SQLite
has neither, and a core type enumerating PostgreSQL's catalog would be exactly
the leak ADR-001 exists to prevent. A section that does not apply is omitted
rather than returned empty, because a tab that always reads "none" is worse
than no tab.

Every value crosses as text, sizes and tuple counts included, for the same
reason rows do (ADR-004).

**Consequences.** Adding a section is a change in one driver file. The cost is
that the panel cannot do anything clever per section - it cannot, say, offer
"drop this index" from the indexes tab without the driver saying which rows are
droppable. That is a real limit and the right time to lift it is when there is
a second engine to check the design against.

## ADR-033 - The detail pane renders by content, and always keeps the raw text

**Context.** A grid cell is one line high. A 40 KB description, a nested JSON
document, and a PNG in a `bytea` column are all unreadable in it.

**Decision.** The pane offers a view per shape - JSON tree, image, hex dump,
text - chosen from the column's kind *and the value's own bytes*. A `bytea`
column says nothing about what someone put in it, so an image is recognised by
its magic bytes rather than by the column's name or type, and a PDF in an
`avatar` column simply gets the hex view.

The raw text view is always available and always last in the list. A rendered
view that quietly differs from what is stored would be worse than no rendering,
and the raw view is what settles the question.

Images render from a `data:` URI built in the webview from the hex Postgres
already sent, so nothing is fetched and the CSP stays closed (S5.1).

**Consequences.** The decision logic lives in a React-free module and is tested
directly - "is this hex", "is this a PNG", "should JSON be offered" are exactly
the parts that break quietly.


## ADR-034 - Pitta is a multi-model client, and the contract stops assuming SQL

**Context.** ADR-001 built a driver registry so a second engine would not be a
rewrite, and Phase 9 proved it for SQLite. SQLite is relational and speaks SQL,
so what it proved is narrower than it looked: the contract still assumes a
statement is SQL text, a result is columns by rows, introspection is a query,
and the tree vocabulary is a closed relational enum. MongoDB and Redis break all
four.

**Decided.** Generalize the contract deliberately, as one phase, before either
engine is written - `docs/10-ENGINE-MODEL.md` is the delta. A driver declares
its language (`sql`, `mongodb`, `redis`); `Statement.sql` becomes
`Statement.text` and is engine-native; splitting, formatting and classification
move behind optional driver methods; results declare a shape; the tree
vocabulary opens up.

**Why now rather than per-engine.** Doing it inside the MongoDB PR would make
every core change look like a MongoDB detail and get reviewed as one. Doing it
after Redis would mean two rounds of the same argument. ADR-021 already
established that a core change forced by a driver is a decision that needs a
label on the PR; this is that decision made once, in the open, with the two
engines that motivate each part named beside it.

**Consequences.** Roughly three weeks of work that ships no user-visible
feature, and one mechanical rename across every driver. In exchange, the
MongoDB and Redis PRs are additive in the way ADR-001 promised, and a fourth
engine after them is a package again. The alternative - a `mongo` fork of the
extension - is the outcome this project exists to avoid.

## ADR-035 - Capabilities are static, then refined by the session

**Context.** `DriverCapabilities` is a constant per driver. It cannot be. Mongo
has multi-document transactions only on a replica set or sharded cluster, Redis
in cluster mode cannot run a cross-slot `MULTI`, and a Redis connection under an
ACL user may be unable to run `CLIENT LIST` at all - the same server, two users,
two different sets of true statements.

**Decided.** `Session` may carry `capabilities?: Partial<DriverCapabilities>`.
Core resolves the static flags overlaid with the session's, and every UI gate
reads the resolved value.

**Why not just widen the static flags.** Claiming transactions and failing at
apply time is exactly the "offer it and fail" behavior ADR-001's flags exist to
prevent. Claiming they are absent everywhere would take real atomicity away from
the majority of MongoDB deployments, which are replica sets.

**Consequences.** One resolution point in core, and a rule: a driver may only
narrow at the session level, never claim something its static flags deny. Also
retires a small Postgres wart - version-gated feature checks that currently live
in call sites can move into the session's overlay.

## ADR-036 - `ObjectKind` becomes an open vocabulary

**Decided.** `ObjectKind` is `string`. The relational kinds stay as exported
constants and keep their shared behavior; a driver declares anything else
through `nodeKinds: NodeKindDescriptor[]` - label, plural, icon, and whether the
node can open a data or structure view.

**Why.** The alternative is extending a core enum for every engine forever:
`collection`, `key`, `keyspace`, `stream`, `consumerGroup` now, and whatever the
engine after that has. That makes every new engine a core edit, which is the
condition ADR-001 was written to remove.

**Cost.** The compiler stops catching a typo'd kind. Mitigated by the
conformance kit asserting that every kind a driver's introspection plan emits
has a descriptor, and that every descriptor names a real codicon.

## ADR-037 - Introspection may be imperative, and the tree pages

**Decided.** `NodeDefinition` gains `fetch(session, context)` as an alternative
to `query()` + `map()`, returning nodes and an optional cursor. The tree gains a
**Load more** node and `pitta.explorer.treePageSize`.

**Why.** Redis has no catalog to query - listing keys is a `SCAN` cursor loop -
and MongoDB's catalog is a command, not a query. Forcing either into
"return SQL text and core will run it" would mean inventing a fake query
language for the driver to speak to itself.

Paging is not cosmetic. A Redis database holds millions of keys with no `LIMIT`;
without a cursor in the contract, expanding a database node is either wrong or
an outage. It also caps the MongoDB database with twenty thousand collections,
and the Postgres schema with ten thousand tables, which the tree currently loads
in full.

**Consequences.** Core keeps caching, version gating and invalidation, because
`fetch` returns the same `TreeNodeData`. Drivers must not implement both forms
for one node; the kit checks it.

## ADR-038 - A result declares its shape, and documents are a sampled projection

**Decided.** Results carry a `ResultShape` - `rows`, `documents`, `keyValue`,
`message`, `none`. A `documents` result gets its columns from a sample of the
fetched page (default 200), `_id` first then by frequency, with each field
marked `inferred`. `message` replies render as a message, not as a one-cell
grid.

**Why.** A grid needs columns and a collection does not have any. Sampling is
the only honest way to get them, and saying so in the field metadata is what
lets the UI label the header rather than implying the server declared it.

The raw document is always in the detail pane and always the last view offered,
which is ADR-033's rule one level up: a projection that quietly differs from
what is stored would be worse than no projection, and the raw view is what
settles the question.

**Consequences.** Two documents with disjoint keys produce a wide, sparse grid -
correct, and occasionally ugly. The column set can change as you page; the grid
keeps columns it has seen and marks newly-absent ones rather than reshuffling
under the cursor.

## ADR-039 - Missing is not null

**Decided.** The wire cell type becomes `string | null | { missing: true }`. The
grid renders a distinct `MISSING` token. Filters offer `exists` / `does not
exist` alongside `IS NULL`. Clearing a field and removing a field are two
different edit actions producing `$set: null` and `$unset`. Engines that cannot
tell the difference declare `distinguishesMissing: false` and never see it.

**Why.** In a document store `{ a: null }` and `{}` are different documents that
different queries match, and merging them is the same class of error as
rendering `NULL` as an empty string - which ADR-004 already refuses to do. A
client that cannot express "remove this field" cannot fix a document that has a
field it should not.

**Cost.** A third state in the wire schema, the grid renderer, the filter row
and every cell editor. It is a small amount of work in a lot of places, which is
why it is decided before either driver is written rather than after.

## ADR-040 - Guards classify from the engine's own metadata, and unknown fails closed on production

**Decided.** `classifyCommand(text, session)` on the driver returns kind,
destructive, unfiltered, targets and a human reason. ADR-027's combining rule is
unchanged: destructive if *either* the driver or the shared heuristic says so,
and neither can downgrade the other. Two additions:

1. Where the engine publishes its own command metadata, that is the source.
   Redis `COMMAND INFO` flags every command `write`, `admin`, `dangerous`,
   `blocking`; Pitta reads the table at connect, so a module command it has
   never heard of is still classified correctly. Same principle as ADR-026.
2. An `unknown` classification on a `prod`-tagged connection is treated as
   destructive and requires the typed confirmation. On dev it is a single
   confirm.

**Why the asymmetry with SQL.** A SQL statement that fails to parse keeps the
heuristic's answer because the heuristic is good on SQL. There is no comparable
heuristic for an arbitrary Redis module command or an unrecognised
`db.runCommand`, and the failure being guarded against - `FLUSHALL` on
production - takes one line and no time at all.

**Consequences.** Some friction on production against commands that turn out to
be harmless. That is the correct direction for the error to point, and the
confirmation names what it could not classify so the user can see why they were
asked.

## ADR-041 - Atomic apply is a capability, not a promise

**Decided.** `supportsAtomicEdits` is a flag, resolved per session (ADR-035).
When it is false the apply dialog states, in those words, that changes are
applied in order and cannot be rolled back, and that a failure stops the batch
leaving earlier changes in place. The result reports exactly which edits were
applied.

**Why.** The Postgres data view taught users that Apply is all-or-nothing.
Redis `MULTI`/`EXEC` does not roll back a command that fails at execution time,
and MongoDB has no transaction at all on a standalone server. Carrying the
Postgres wording across would be a false guarantee about the user's data, which
is the worst kind to make.

**Consequences.** The affected-count verification of S4.5 degrades where there
is no count: it becomes a read-back of the edited records where a key exists,
and nothing where it does not - stated in the dialog rather than assumed.

## ADR-042 - The MongoDB shell dialect is parsed, never evaluated

**Decided.** `.mongodb.js` text is parsed with `acorn` to an AST, matched
against an allowlist of call shapes, and converted to BSON directly from the
syntax tree. Constructor forms (`ObjectId`, `ISODate`, `NumberLong`,
`NumberDecimal`, `UUID`, `BinData`, regex literals) are recognised as literals.
No `eval`, no `vm`, no `new Function`. Anything outside the allowlist is a
diagnostic.

**Why.** The obvious implementation of a mongosh-compatible editor is to run the
text as JavaScript. That gives a pasted snippet from a ticket, a wiki, or a chat
message full access to the extension host - the file system, the user's other
connections, and their credentials. No sandbox available in a VS Code extension
makes that acceptable, and the feature that requires it is loops in a query
file.

**Consequences.** No loops, no variables, no user-defined helpers in a query
file. The 95% of statements people actually write - `find`, `aggregate`,
`update*`, `delete*`, `createIndex`, `runCommand` - are unaffected, and
everything else has an error message that says what was rejected rather than
failing strangely at runtime.

## ADR-043 - Every MongoDB operation carries a comment, and that is how cancel finds it

**Decided.** Pitta attaches a unique `comment` to every operation it issues.
Cancel closes the cursor and then locates the operation by that comment in
`$currentOp` and issues `killOp`. The session monitor uses the same field to
show which rows are Pitta's own.

**Why.** Abandoning a cursor does not stop a long-running aggregation on the
server. That is the same failure the Postgres out-of-band CancelRequest work
(P1-T3) was built to avoid: a Cancel button that only stops the client is a lie
about what happened to the server. MongoDB offers no out-of-band cancel channel, and `killOp` needs an
opid, and the only reliable way to know the opid of the operation you just
started is to have labelled it.

**Consequences.** Cancel needs a second connection and the `killOp` privilege;
without it the button reports that it stopped reading but could not stop the
server, which is at least true. The comment also appears in the profiler and the
slow-query log, which turns out to be useful on its own.

## ADR-044 - The Redis keyspace is browsed with SCAN, and folders come from a bounded sample

**Decided.** Every listing is `SCAN`-based and cursor-paged. `KEYS` is never
issued; the setting that permits it defaults to false and it is classified as
dangerous even when enabled. Prefix folders are computed from a bounded sample
(default 5 000 keys) split on a configurable separator, and folder counts are
labelled as estimates.

**Why.** `KEYS *` blocks the server for a full keyspace walk. On a production
instance with ten million keys, a DB client that runs it on tree expand is an
outage - and it is the single most common thing Redis GUIs get wrong. There is
no correct exact answer available cheaply, so the choice is between a labelled
estimate and a wrong number.

**Consequences.** Folder counts are approximate and say so. Expanding a folder
is a real scan and pages. A keyspace with no separators is one flat folder,
which is the truth about that keyspace.

## ADR-045 - MongoDB's schema is inferred by sampling, and always labelled as an inference

**Decided.** The Fields section of the structure view, the completion index, and
the grid's column union all come from sampling documents. Every surface that
shows them says the sample size, and every field carries observed types with
percentages and a presence percentage rather than a single type.

**Why.** A collection has no schema. Showing "the fields of this collection"
without qualification invites the reader to treat a 200-document sample as a
guarantee, and the field that appears in 1% of documents is exactly the one that
breaks their code. Percentages turn a false statement into a true one at no
extra cost.

**Consequences.** The Fields tab and the completion list can be wrong about a
rare field, which is why they report presence. `$jsonSchema` validators, where a
collection has one, are shown separately and are *not* an inference - the
distinction is worth the two sections.

## ADR-046 - MongoDB and Redis drivers stay pure JavaScript

**Decided.** `mongodb` (with `bson`'s JS path) and `ioredis`. The optional
native packages - `mongodb-client-encryption`, `kerberos`, `@mongodb-js/zstd`,
`snappy` - are excluded from the bundle and the features that need them are not
claimed.

**Why.** ADR-012: a native module forces a per-platform VSIX and breaks in some
remote and devcontainer images. That reasoning does not change because the
engine did.

**Consequences.** No client-side field-level encryption, no Kerberos, and no
zstd/snappy wire compression for MongoDB; zlib compression is still available
and is enough. If FLE is ever demanded, it is a separate optional extension, not
a native dependency in the core VSIX.

## ADR-047 - Engine order: generalize, then MongoDB, then Redis, then MySQL

**Decided.** Phase 11 generalizes the contract, Phase 12 ships MongoDB, Phase 13
ships Redis, Phase 14 ships MySQL/MariaDB. This resolves OQ-4, which had MySQL
second.

**Why the order changed.** MySQL is the largest audience but it validates
nothing: it is relational, it speaks SQL, and it would land against the existing
contract almost unchanged - which is why it is also the cheapest to do *last*,
and the best candidate to hand to a contributor once the driver-authoring guide
exists.

MongoDB first among the non-relational engines because it exercises every part
of the generalization at once - documents, missing fields, sampled schema, a
non-SQL language, cursor paging, conditional transactions - while still being
close enough to the existing model that the grid and the editor mostly hold.
Redis second because it is the harshest test of the same contract: no schema, no
rows, no rollback, no planner, and a keyspace that punishes a client for asking
a naive question. If the contract survives Redis it will survive most things.

**Consequences.** Roughly twelve weeks after v1.0 before MySQL exists, which is
a real cost in reach. The judgement is that shipping two engines nobody else in
this space handles well is worth more than being the fourth good Postgres+MySQL
client.

## ADR-048 - Cross-engine querying stays out

**Decided.** Reaffirmed, now that there is more than one shape of engine: no
joins across connections, no federated query layer, no "SQL over Mongo".

**Why.** Every one of those is a query engine, not a client feature, and each is
a product on its own. The non-goal was cheap to hold when every engine was
relational; it needs restating now precisely because multi-model makes it sound
plausible.

## ADR-049 - Offset paging over a SCAN is a written-down SKIP, not a hidden cost

**Context.** The data view asks a driver for "rows 200 to 250 of this key". Two
Redis containers can answer that directly - `LRANGE` and `ZRANGE` take index
ranges. The rest cannot: `HSCAN`, `SSCAN` and `SCAN` are cursors, and a cursor
cannot be resumed from a number. Page 5 of a hash means reading pages 1 to 4
and throwing them away.

**Decision.** The driver writes that into the command: `HSCAN key 0 COUNT 50
SKIP 200`. `SKIP` is Pitta's, not Redis' - it is stripped by the session, which
then loops the cursor and discards what it was told to. The command bar shows
it, so what the user sees is what the server was asked to do.

**Why not hide it.** The alternative is a page control that looks like every
other one in the product while quietly costing the server four extra passes over
a hash. On a 100 000-field key that is a real amount of work done on a
single-threaded server, and a client that does it invisibly is how a "read-only
browse" turns into a production incident. The same reasoning as ADR-044: where
Redis charges for a question, the UI says so.

**Consequences.** Deep paging into a large hash is honest but not fast, and the
grid's page control will eventually offer Next/Previous over a real cursor
instead (`GridQuery.page.mode: 'cursor'` exists for it). `SKIP` is also
type-able in a `.redis` file and does the same thing there, so it is a feature
of the client's dialect rather than a private protocol between two of its
modules.

## ADR-050 - The Redis driver classifies through `parseStatement`, not a new hook

**Context.** `10-ENGINE-MODEL.md` proposed `classifyCommand` as a new driver
method for non-SQL guard classification.

**Decision.** Redis implements the *existing* `parseStatement` hook instead. It
returns the same `ParsedStatement` the Postgres parser does, and the host
combines it with the shared heuristic under ADR-027's rule unchanged.

**Why.** The hook already means "the driver's own answer about what this
statement is", and the combining rule it feeds is exactly the one wanted here.
Adding a second method with the same purpose and a different name would have
meant two guard paths to keep in step, which is how a safety mechanism develops
a hole.

**Consequences.** One less contract change than Phase 11 planned. The name reads
oddly for an engine with no statements, and renaming it to `classifyCommand`
across all drivers is worth doing when `Statement.sql` is renamed to `.text`
(P11-T1) - one mechanical pass, not two.

## Numbering note

ADR-034 through ADR-037 were written twice: the multi-model work and the UI
search work were in flight at the same time and both numbered from 033. The
four below are the search-and-streaming set, renumbered to 051-054; the
multi-model set keeps 034-037 because the code and the engine documents cite
those numbers throughout. Commit messages written before the renumber refer to
the old numbers.

## ADR-051 - The listening session is its own connection

**Context.** LISTEN holds a connection for as long as you want notifications,
which is the point of it. The panel could borrow the session queries run on.

**Decision.** It opens its own, through a new `connectDedicated` on the
connection manager: same profile, same credentials from the keychain, same
tunnel, but a session nothing else is ever handed. A session parked in LISTEN is
a session the next query would queue behind, and the failure would look like
"Pitta got slow" rather than "the notify panel is holding the connection".

The session is still tracked, so disconnecting the profile closes it and the
explorer still shows one connection. Closing the panel closes the session:
leaving it open would park a backend on the server for the life of the window.

Channel discovery deserves a note. There is no catalog of channels - a channel
exists only while something listens on it, and `pg_listening_channels()` reports
only the current session. So the suggestion list is built from where
notifications actually come *from*: `pg_notify(...)` and `NOTIFY ...` inside
trigger and routine bodies, read out of `pg_proc.prosrc`.

## ADR-052 - Streaming is pull-based, and scrolling is the backpressure

**Context.** P8-T3. Until now the runner read up to `maxRowsInMemory` before the
first row could be drawn: a `SELECT *` over a large table paid the whole cost up
front even though nobody was going to look past the first screen.

**Decision.** The cursor stays open after its first page, and the panel pulls
more when the reader scrolls near the end. There is no push, no queue, and no
ack protocol - the webview asking *is* the backpressure signal, and a result
nobody scrolls through is a result the server is never asked to produce.

Three constraints fall out of the session model and are enforced rather than
documented:

- Only the last statement of a batch may keep a cursor open. A cursor holds the
  session, so statement N+1 would wait behind it.
- A new run closes the previous run's cursors first, for the same reason.
- Closing the panel closes them, or a backend sits idle-in-transaction with
  nobody left to read from it.

Exhaustion is detected from a short batch rather than an empty one. A cursor
returns fewer rows than asked for only at the end, so waiting for an empty
fetch to prove it would add a round trip to every result.

**Consequences.** `maxRowsInMemory` is now a ceiling on what a panel can
accumulate by scrolling, not a cost paid on every query. The unit tests assert
the thing that matters and is otherwise invisible - *how many times the server
was read* - by counting fetches on a fake handle.

## ADR-053 - Extension types get a view, not a decoded value

**Context.** pgvector and PostGIS values are text and hex respectively, and
neither is readable. The tempting fix is to decode them into something richer
on the way through the host.

**Decision.** They cross as text like everything else (ADR-004), and the
*webview* interprets them for display only: a vector becomes a magnitude, a
range, a zero count and a strip plot; a geometry becomes an SVG drawn from its
own coordinates, with no basemap and no tile request, because the webview has no
network access and should not have one (S5.1).

Nothing decoded is ever written back or used to build SQL. The raw text view is
always present, which is what makes the interpretation safe to be approximate -
a GeometryCollection is reported but not walked, and a truncated EWKB still
yields a useful header.

## ADR-054 - Search is one box, rendered by the engine, and never an index scan

**Context.** UI mode had per-column filters with a full operator set, and no way
to answer "which rows mention this anywhere". Those are different questions: a
filter is *this column is that*, search is *this text appears somewhere in the
row*.

**Decision.** `GridQuery` grows a `search` field, and the driver renders it -
PostgreSQL as `col::text ILIKE $1` ORed across columns, SQLite as
`CAST(col AS TEXT) LIKE ? ESCAPE '\'`, because SQLite's LIKE is already
case-insensitive for ASCII and has no default escape character. One bind
parameter is referenced by every column rather than one per column, and the term
is always bound, never interpolated (S3.1).

Three details are deliberate:

- **Wildcards are escaped.** A user typing `50%` means fifty percent, not
  "match every row", and that failure would look like the feature working.
- **Binary columns are skipped.** Casting a 40 MB bytea to text on every row to
  look for a word costs everything and finds nothing anyone wanted.
- **Search is ANDed with the filters**, so searching inside a filtered view
  narrows it rather than replacing it.

Casting every column to text means no index can be used and the scan is
sequential. That is inherent to the question, not a shortcoming to fix later,
so the UI labels it *search* rather than presenting it as another filter, the
input is debounced rather than firing per keystroke, and the tooltip says the
scan cannot use an index.

**Consequences.** A filter chip bar now shows what is applied - a filter row
scrolled off to the right is easy to forget, and "where did my rows go" is a bad
five minutes. Selecting a cell offers Filter and Exclude on its value, because
"show me the other rows like this one" is the most common thing anyone wants
from a cell they are already looking at, and NULL maps to IS NULL rather than
to `= NULL`, which is never true.

## ADR-055 - The text a driver shows and the operation it runs are built together

**Context.** The data view asks a driver for a read or an edit and gets back a
`Statement`. For SQL that is text plus bound parameters, and the text is both
what runs and what is shown above the grid. MongoDB has no such text: the driver
speaks BSON, and the shell syntax people read is a *rendering* of it.

Rendering values into that text and parsing them back would undo the property
S3.1 exists for - the values would have made a round trip through a string, and
the escaping of that string would be the only thing standing between a value and
the query.

**Decision.** `buildSelect` and `buildEdits` return the rendered text in `sql`
and the already-built operation in `params[0]`. The session runs the operation
when it is given one and parses the text only when it is not - which is the case
for a command someone typed themselves.

**Consequences.** The command bar shows `db.orders.updateOne({_id:
ObjectId("...")}, {$set: {...}})` and the server receives BSON that was never
text. The cost is that two representations exist and could disagree; they are
built in the same function from the same values, and the tests assert the pair.

The same shape is available to any driver whose engine does not take a string -
which is most of the non-relational ones.

## ADR-056 - MySQL imports through batched INSERTs, not LOAD DATA

**Context.** `bulkLoad` exists so an import is not a loop of single INSERTs
(ADR-030). MySQL's fast path is `LOAD DATA LOCAL INFILE`.

**Decision.** Use batched multi-row INSERTs inside one transaction instead.

**Why.** `LOAD DATA LOCAL INFILE` needs `local_infile` enabled on the server
*and* the client, and it has been off by default on both since MySQL 8.0 for
good security reasons - a server can ask a client that allows it for any file
the client can read. A fast path that fails on most servers, and that asks the
user to turn off a protection to get it, is worse than a slower one that always
works.

**Consequences.** Import is a few times slower than `mysqlimport` and still
orders of magnitude faster than one statement per row. If a user has
`local_infile` on and wants it, that is a later opt-in with the trade written
next to the setting.

## ADR-057 - A selection runs exactly what is selected

**Context.** Run honours a selection when there is one, and used to widen it out
to whole statement boundaries: selecting the middle of a statement ran all of
it, and selecting one of several ran from the first covered statement to the
last.

That reads as helpful and is not. Highlighting is how someone says *this much
and no more*. Two cases it got wrong:

- A file where nothing is terminated with a semicolon is one statement to the
  splitter, so selecting one query out of five ran all five.
- Selecting one branch of a `WHERE` clause, or one arm of a `UNION`, ran the
  whole statement instead - which on DML is the expensive kind of surprise.

**Decision.** With a selection, Run executes the selected text verbatim. The
text is still split, so selecting three statements runs three of them into three
result tabs, and an empty selection says so rather than running something else.

**Consequences.** Selecting half a statement produces a syntax error from the
server, which is the correct answer to what was asked. The guards run on the
selected text, so a destructive statement is still confirmed - what changed is
which text is being judged, not whether it is.


## ADR-058 - SQL Server's exact numerics are converted on the server

**Context.** ADR-004 says a `decimal` is a string and never a JS number. Every
other driver satisfies it by asking its client library not to convert: `pg`
returns numerics as text, `mysql2` does the same, MongoDB has `Decimal128`.

TDS does not offer the choice. `tedious` decodes `decimal`, `numeric` and
`money` in its value parser and hands over a JavaScript number, so by the time
any code in this repository sees the value, the digits past the fifteenth are
gone. There is no option, no hook, and no pure-JS alternative client - the only
driver that does better is `msnodesqlv8`, which is a native ODBC binding and is
ruled out by ADR-012.

**Decision.** Convert on the server for everything the grid reads:
`buildSelect` projects an exact-numeric column as
`CONVERT(varchar(41), [col]) AS [col]`. Values arrive as text, exact at any
precision. For a statement the user typed, where there is nothing to rewrite,
the number is rendered at the column's declared scale - exact for every
precision a double holds, and no better.

**Why.** The data view is where a decimal is read, compared and edited, and it
is the path where being wrong would be silent: a total that renders as
`12345678901234567000` looks like a number rather than like a failure. That path
can be made exact, so it is. The ad-hoc path cannot be, and saying so is better
than pretending.

Two details make the conversion safe. The alias keeps the column's own name, and
the data view takes a column's *type* from the catalog rather than from the
result, so the cell still edits as a decimal. And the generated SELECT aliases
its table and qualifies every reference, because T-SQL resolves a bare
`ORDER BY total` against the select list - which would have sorted the converted
text instead of the number.

**Consequences.** The conformance kit's exact-decimal case for this engine is
written with the same `CONVERT`, which is what the driver itself does rather
than a way around the check. A user who selects a `decimal(38,10)` column by
hand and needs every digit has to ask for it the same way - and the driver's
own statement shows them how.

## ADR-059 - Every SQL Server statement is wrapped, so plans need a pinned batch

**Context.** `mssql` sends a parameterized statement through `sp_executesql`.
That is what makes `@1` binding possible, and it has a consequence that reaches
the rest of the driver: anything session-scoped applies to the *nested* batch
and is gone when it returns. `USE [other_db]` changes nothing. `SET
SHOWPLAN_ALL ON` - which must also be the only statement in its batch - plans
the nested batch and returns nothing useful.

**Decision.** Two rules. The introspection plan never says `USE`; it writes
three-part names (`[db].sys.tables`), which is how one connection reads another
database's catalog. And `explain` goes through `Session.runBatch`, which opens a
transaction to pin one connection and sends `SET … ON`, the statement, and
`SET … OFF` as three real batches on it.

**Why.** The alternatives are worse in ways that are not obvious until they
fail. Sending the three settings as separate pool requests looks correct and is
not - each one may land on a different connection, so the setting and the
statement end up on different sessions. Opening a second connection per database
would multiply connections by the size of the tree.

**Consequences.** `runBatch` takes no parameters, because `execSqlBatch` cannot
carry them; its callers pass statement text that came from the user's own
editor. An estimated plan rolls its transaction back, an analyzed one commits -
`STATISTICS PROFILE` really runs the statement, which is the same promise
`EXPLAIN ANALYZE` makes everywhere else. And `batch()` reports no column
metadata, so those result sets are read as records keyed by column name rather
than as arrays.

## ADR-060 - There is no "SQL"; there are four engines that nearly agree

**Context.** P11-T2 asked for the SQL statement splitter and formatter to move
out of core and into `driver-pg`, so that core stopped applying one engine's
grammar to every engine that said "SQL". Taken literally that means four copies
of a 240-line scanner and a 300-line printer, which is four places for one of
them to drift.

**Decision.** The scanner and the printer stay in core as shared code, and take
a `SqlDialect`. Every SQL driver passes its own through `splitStatements` and
`formatCommand`; core keeps `POSTGRES_DIALECT` only as the floor for a buffer
that declares SQL and has no connection to ask - a `.sql` file bound to nothing.

Every flag on a dialect is off by default, so an engine that says nothing is
scanned with ANSI rules and cannot inherit another engine's grammar by omission.

**Why.** What was actually wrong was not the location of the code. It was that a
MySQL buffer was being read with dollar quoting, nested block comments and
psql's backslash commands, and without backticks or `#`; that a SQL Server
buffer had `GO` handed to the server as if it were T-SQL, and `[odd;name]` split
down the middle. Moving the file would not have fixed any of that, and
parameterizing it fixes all of it. The rule the task was defending - core does
not decide what an engine's statements look like - is satisfied by the driver
supplying the dialect, not by the driver owning the loop.

**Consequences.** Adding a SQL engine is a dialect constant and two one-line
functions. A gap in the dialect vocabulary is a contract change, reviewed as
one, rather than a fix buried in one driver where the other three keep the bug.
The cost is that `@pitta/core` still exports a SQL scanner, which reads oddly in
a multi-model client; it is the floor rather than the default, and the doc
comment says so.
