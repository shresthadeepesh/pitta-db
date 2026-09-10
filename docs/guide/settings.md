# Settings

Everything is namespaced under `pitta.`. Open **Preferences: Open Settings** and
filter on `pitta`, or edit `settings.json` directly.

Settings apply per user by default and can be overridden per workspace — except
the guard settings, which VS Code refuses to take from an untrusted workspace so
a cloned repository cannot turn them off. See
[Safety](./safety#untrusted-workspaces).

## Safety

| Setting | Default | What it does |
| --- | --- | --- |
| `pitta.query.confirmDestructive` | `prod` | Which environments confirm before `DROP` / `TRUNCATE` / unqualified DML. The typed confirmation on `prod` cannot be turned off. |
| `pitta.query.blockUnqualifiedDml` | `true` | Refuse `UPDATE`/`DELETE` with no `WHERE`, on any connection. |
| `pitta.query.statementTimeoutMs` | `0` | Server-side statement timeout. `0` disables it. |
| `pitta.query.autocommit` | `true` | Run statements outside an explicit transaction. |
| `pitta.redis.allowKeysCommand` | `false` | Allow `KEYS`. It walks the whole keyspace and blocks the server while it does; the tree uses `SCAN` instead. |
| `pitta.redis.allowMonitor` | `false` | Allow `MONITOR`. It makes the server report every command to this client and measurably slows it for everyone. Refused on production whatever this is set to. |
| `pitta.redis.monitorSeconds` | `10` | How long `MONITOR` runs before stopping itself. |

## Results and memory

| Setting | Default | What it does |
| --- | --- | --- |
| `pitta.defaultFetchSize` | `500` | Rows fetched per page from a server-side cursor. |
| `pitta.query.streamResults` | `true` | Keep the cursor open after the first page and read on as you scroll. Turning it off reads up to `pitta.maxRowsInMemory` before the first row appears. |
| `pitta.maxRowsInMemory` | `50000` | Rows a result keeps before it is marked truncated. Costs roughly **0.5 KB per row per 20 columns**, so the default caps an accidental `SELECT *` at about 27 MB. |
| `pitta.gridCacheBudgetMB` | `200` | Memory budget for cached result pages; the oldest are evicted first. |

Exports and imports stream to and from disk and are not bounded by any of these.
A table larger than memory exports fine.

## Explorer

| Setting | Default | What it does |
| --- | --- | --- |
| `pitta.explorer.pageSize` | `500` | Objects per level before a **Show more** entry. VS Code virtualizes rendering, but handing it tens of thousands of items still costs a call each as you scroll. |
| `pitta.explorer.showSystemObjects` | `false` | Show `pg_catalog` and `information_schema`. |
| `pitta.explorer.rowCountMode` | `estimate` | `estimate` reads the catalog's row estimate and is free. `exact` runs `COUNT(*)` — accurate, and a full scan on a large table. |
| `pitta.metadataCacheTtlSeconds` | `300` | Schema cache lifetime. `0` re-reads the catalog every time. The cache is also invalidated eagerly when Pitta runs DDL itself. |

## Editor

| Setting | Default | What it does |
| --- | --- | --- |
| `pitta.editor.completion` | `true` | Suggest tables, columns and functions from the bound connection. |
| `pitta.editor.diagnostics` | `semantic` | `off`, `syntax` (grammar only), or `semantic` (adds unknown-name and type checks against the catalog). |
| `pitta.editor.diagnosticsDelayMs` | `400` | Pause after typing before diagnostics run. |
| `pitta.editor.formatOnSave` | `false` | Format `.sql` files bound to a Pitta connection on save. |
| `pitta.editor.keywordCase` | `upper` | Keyword case the formatter produces. |
| `pitta.editor.maxLineLength` | `100` | Length past which the formatter breaks a comma-separated list. |

## History and saved queries

| Setting | Default | What it does |
| --- | --- | --- |
| `pitta.history.enabled` | `true` | Record executed statements locally. |
| `pitta.history.excludeEnvironments` | `["prod"]` | Environments kept out of history entirely. |
| `pitta.history.maxEntries` | `5000` | Entries kept before the oldest are dropped. |
| `pitta.savedQueries.folder` | `.pitta/queries` | Workspace folder holding saved `.sql` files. |

## Diagnostics and privacy

| Setting | Default | What it does |
| --- | --- | --- |
| `pitta.logLevel` | `info` | Verbosity of the Pitta output channel: `trace`, `debug`, `info`, `warn`, `error`, `off`. Set `debug` before reporting a bug. |
| `pitta.telemetry.enabled` | `false` | Off. Nothing is collected or transmitted. |

## Per-connection overrides

Some of these are also profile fields, and the profile wins for that connection:
statement timeout, fetch size, autocommit, `search_path`, `TimeZone` and
`application_name`. Set them on the profile when they belong to the server
rather than to you.
