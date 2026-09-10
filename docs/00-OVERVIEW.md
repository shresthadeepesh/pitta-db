# 00 — Product Overview

**Working name:** Pitta (extension id `pitta-db`, publisher TBD)
**One line:** A first-class PostgreSQL client inside VS Code — browse and edit visually, or write SQL — with a pluggable driver layer so other engines slot in later.

**After v1.0 that line changes.** Phases 11–14 take the driver layer past
relational: MongoDB and Redis ship from the same core, and the product becomes
one client for several *kinds* of database rather than a Postgres client with a
plugin point. The contract work that makes that possible is
`10-ENGINE-MODEL.md`; the engines are `11-ENGINE-MONGODB.md` and
`12-ENGINE-REDIS.md`; the decision is ADR-034.

---

## 1. Why build it

Existing VS Code DB extensions each fail on at least one axis:

| Gap | Who has it |
|---|---|
| Drivers installed as separate stale extensions | SQLTools |
| Core features paywalled / closed source | Database Client (cweijan), DBCode |
| Single engine, no growth path | MS PostgreSQL, MSSQL, MongoDB, Oracle |
| Result grid dies past ~50k rows | almost all |
| No `NOTICE`/`RAISE` capture, no cursor streaming, numeric precision loss | almost all |
| No prod-safety guardrails | all |
| No EXPLAIN plan visualizer worth using | all |

Pitta targets: **deep Postgres correctness + a grid that does not fall over + safety on production connections**, all in one open package.

## 2. Target users

1. **App developers** — need to poke at their dev DB without leaving the editor. Care about: fast connect, table browse, edit a row, run a query.
2. **Data / backend engineers** — care about EXPLAIN, indexes, bloat, long-running sessions, big result sets, exports.
3. **Teams** — care about shareable connection profiles in the repo with *no secrets committed*, and prod write-guards.

## 3. Two operating modes (both first-class)

### UI mode — no SQL typed
Explorer tree → click object → visual panel.
- Browse servers → databases → schemas → tables/views/functions/types/sequences/extensions.
- Table Data view: paginated/virtualized grid, per-column filter + sort, inline cell edit, insert/delete row, all changes staged then applied as reviewable DML in one transaction.
- Structure view: columns, types, defaults, nullability, PK/FK/unique/check, indexes, triggers, RLS policies, partitions, storage/bloat stats.
- Generated DDL tab for every object.
- ERD canvas per schema.

### Query mode — SQL first
- `.sql` files bound to a connection (status bar picker + file-level `-- @pitta connection: <name>` directive).
- Run statement under cursor / selection / whole file, each into its own result tab.
- Completion, hover, go-to-definition on schema objects; live syntax + semantic diagnostics.
- Query history, saved queries, parameterized snippets.
- SQL notebooks (`.psql-nb`) mixing markdown + SQL cells + charts.
- EXPLAIN / EXPLAIN ANALYZE tree visualizer.

Both modes share one connection manager, one metadata cache, one result grid component.

## 4. Non-goals (v1)

- Not a DBA console: no backup/restore orchestration, no replication management, no server config editing.
- No cross-connection joins, and no cross-*engine* ones either — that is a query engine, not a client (ADR-048).
- No BI dashboards or scheduled reports.
- No web extension host (`vscode.dev`) build — native driver dependency. Revisit post-v1.
- No AI/LLM features in v1 core. A separate optional extension may add them later.

## 5. Success criteria for v1.0

- Connect → browse → run a query in **under 30 s** from a cold install.
- `SELECT` returning **1M rows** streams into the grid without OOM; first page visible in **< 500 ms**.
- Zero secrets ever written to `settings.json` or any file in the workspace.
- Postgres type fidelity: numeric/decimal never lossy, arrays/json/ranges/enums/composites render correctly, timestamps honor session `TimeZone`.
- A second driver (SQLite) ships from the same core with **no changes to core packages**.

## 6. Success criteria for v1.2 (multi-model)

- A MongoDB collection and a Redis keyspace are browsable, editable, and safe to
  point at production from the same UI, the same guards, and the same grid.
- Expanding a 1M-key Redis database costs the server nothing measurable — no
  `KEYS`, nothing in `SLOWLOG`.
- A document with fields absent from its neighbours renders those fields as
  `MISSING`, not as `NULL`, and can have a field removed rather than nulled.
- A pasted `.mongodb.js` snippet cannot execute arbitrary JavaScript in the
  extension host.
- The MongoDB and Redis PRs add packages and do not edit core — the Phase 11
  contract work is what makes that true, and it is done first, in the open.
