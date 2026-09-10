# Writing a driver

Adding an engine to Pitta is **one new package under `packages/driver-*` and no
edit to `core` or `extension`**. That is not a style preference; CI fails a PR
that touches both unless it is labelled `contract-change`, and every engine after
the first was added under that rule.

This guide is what the rule enforces against. It was written after six drivers —
PostgreSQL, SQLite, MongoDB, Redis, MySQL/MariaDB and SQL Server — and every
question those six had to answer is answered here rather than left to be
rediscovered.

::: tip If the guide is wrong, that is a bug in the guide
Anything you hit that this page does not answer is a **doc bug**. File it against
the guide rather than working around it in your driver. That is an explicit
acceptance criterion (P14-T7), and it is how the fifth and sixth drivers'
lessons got here.
:::

The authoritative types are in `packages/core/src/driver/`. This page is the
order to read them in and the decisions to make along the way.

## 0. Before you start

Answer six questions. They decide most of the rest.

| Question | Where the answer goes |
| --- | --- |
| Is a statement text, or a structured command? | `language`, `Statement.text` vs `Statement.params` |
| Are results rows, documents, or a status message? | `capabilities.resultShapes` |
| Can a tree level be read with a query, or must it be a paged loop? | `NodeDefinition.query` vs `NodeDefinition.fetch` |
| Are there transactions? Do batches apply atomically? | `supportsTransactions`, `supportsAtomicEdits` — these come apart |
| Can a running command be cancelled out of band? | `supportsQueryCancel` |
| Is there a pure-JavaScript client library? | whether this is possible at all |

That last one is a hard constraint: Pitta ships one platform-neutral VSIX, so a
driver needing a native module cannot be bundled (S6.3). `node-postgres`,
`mysql2`, `mongodb`, `ioredis`, `mssql`/`tedious` and `node-sqlite3-wasm` were
all chosen on that basis, with their optional native packages excluded.

## 1. The package

```
packages/driver-<engine>/
  package.json          name: @pitta/driver-<engine>
  src/
    index.ts            defineDriver({...}) — the only public surface
    capabilities.ts     what this engine can do
    connectionSchema.ts what the connection form asks for
    connect.ts          profile + secrets → Session
    session.ts          Session and QueryHandle
    types.ts            the type bridge
    sql.ts              quoting, qualification, buildSelect, buildDml
    introspection.ts    the tree
    ddl.ts              optional: generateDdl
    explain.ts          optional: plans
    planFlags.ts        optional: engine-specific plan findings
    activity.ts         optional: session monitor and health
  test/
    conformance.test.ts the kit, against a real server
```

`packages/driver-sqlite` is the smallest complete example — it declares `false`
for most capabilities, which makes the gating visible. `packages/driver-mysql`
is the closest to a middle-of-the-road relational engine.

Depend on `@pitta/core` and your client library. Depend on `@pitta/ssh` if you
tunnel. Do **not** depend on `@pitta/extension` or on `vscode` —
`dependency-cruiser` will reject it, and it would mean the driver could not run
anywhere else.

## 2. Registration

```ts
// packages/driver-acme/src/index.ts
import { defineDriver, type DriverAdapter } from '@pitta/core'

export const acmeDriver: DriverAdapter = defineDriver({
  id: 'acme',
  displayName: 'Acme DB',
  capabilities: ACME_CAPABILITIES,
  connectionSchema: ACME_CONNECTION_SCHEMA,
  introspection: ACME_INTROSPECTION,
  defaultPort: 9042,
  language: ACME_LANGUAGE,
  connect,
  describeType,
  quoteIdent,
  qualify,
  formatLiteral,
  placeholder,
  buildSelect,
  buildDml,
})

export default acmeDriver
```

Then add it to the static map in `packages/extension`. That one-line addition
and the docs are the only files outside your package that a driver PR may touch.

## 3. Capabilities

Start from `MINIMAL_CAPABILITIES` and override what you support:

```ts
export const ACME_CAPABILITIES: DriverCapabilities = {
  ...MINIMAL_CAPABILITIES,
  supportsSchemas: true,
  supportsCursors: true,
  supportsQueryCancel: true,
  objectKinds: ['database', 'schema', 'table', 'view', 'index'],
  resultShapes: ['rows'],
  parameterStyle: 'question',
  identifierCase: 'lower',
  maxIdentifierLength: 128,
}
```

Spreading the baseline matters: a capability added to the contract next year
defaults to *off* for your driver rather than being silently claimed.

### The honesty rule

**A flag describes what your code does, not what the client library could do.**

MySQL declared `supportsCursors: false` for two whole phases because the driver
used the pool's buffered `query`. The flag was honest and the *behaviour* was
the thing to fix. Declaring `true` because `mysql2` has a streaming API you have
not called would have been a lie that the grid then relied on.

Get this wrong and the failure is not a compile error — it is a promise made to
the user. `supportsAtomicEdits: true` makes the apply dialog say "this will be
rolled back if anything fails".

### Flags that come apart

- `supportsTransactions` vs `supportsAtomicEdits`. Redis `MULTI`/`EXEC` runs a
  batch without interleaving but does not roll back a command that fails at
  execution time. Transactions: sort of. Atomic edits: no. The dialog wording
  differs, and so does what the result reports.
- `supportsCursorPaging` vs `supportsOffsetPaging`. An engine with only a cursor
  makes the grid degrade its page control to Next/Previous instead of showing
  page numbers it cannot honour.
- `supportsServerSideSort` vs `supportsServerSideFilter`. A hash scan has no
  order but can still match a pattern. Say so separately.
- `schemaless` and `distinguishesMissing`. Together they turn on the missing
  token, the `exists` / `notExists` filter operators, and the clear-versus-remove
  question in the cell editor.

### Session-level capabilities

The adapter's flags describe the **engine**. A `Session` may narrow them to the
**deployment it actually reached** by returning a partial override:

```ts
get capabilities(): Partial<DriverCapabilities> {
  // A standalone server has no transactions; a replica set does.
  return this.topology === 'standalone'
    ? { supportsTransactions: false, supportsAtomicEdits: false }
    : {}
}
```

MongoDB needs this for topology; Redis needs it for a restricted ACL user who
cannot list clients even though the server can. **A session may only narrow.**
Nothing enforces that mechanically — it is a rule for you — but the overlay is
applied in one direction, so a session claiming something extra is at least
doing it visibly.

## 4. The connection form

You do not write a React form. You describe fields and the form renders itself:

```ts
export const ACME_CONNECTION_SCHEMA: ConnectionFieldSpec[] = [
  { key: 'name', label: 'Name', type: 'text', path: 'name', group: 'general', required: true },
  { key: 'host', label: 'Host', type: 'text', path: 'connection.host', group: 'connection', required: true, default: 'localhost' },
  { key: 'port', label: 'Port', type: 'number', path: 'connection.port', group: 'connection', default: 9042 },
  {
    key: 'mode',
    label: 'Mode',
    type: 'select',
    path: 'connection.options.mode',
    group: 'connection',
    default: 'standalone',
    options: [
      { value: 'standalone', label: 'Standalone' },
      { value: 'cluster', label: 'Cluster' },
    ],
  },
  {
    key: 'nodes',
    label: 'Seed nodes',
    type: 'tags',
    path: 'connection.options.nodes',
    group: 'connection',
    // Fields appear and disappear with the mode. No engine code in the webview.
    visibleWhen: { path: 'connection.options.mode', equals: ['cluster'] },
  },
  ...sshConnectionFields(),
]
```

Field types: `text`, `password`, `number`, `boolean`, `select`, `file`, `tags`.
Groups: `general`, `connection`, `tls`, `ssh`, `advanced`.

::: warning Do not write your own SSH fields
`sshConnectionFields()` from core is the nine-field SSH block, identical for
every engine because it describes the bastion rather than the database. It lived
in `driver-pg` until MongoDB, Redis and MySQL each needed it — four copies was
four places for one of them to drift. Pass `{ help }` for the one
engine-specific part, which is usually a warning that your topology refuses a
tunnel.
:::

Keep the well-known keys — `host`, `port`, `database`, `user`, `password` —
where they apply, even if your engine calls them something else. The URI
parsers and existing profiles fill them by name.

**Every password field is a `SecretRef`, never a value.** Marking a field
`type: 'password'` is what routes it through `SecretStorage`. Never add a field
that ends up holding a literal credential in the profile: the workspace file's
JSON Schema will refuse the file, which is the design working.

## 5. Connecting

```ts
export async function connect(
  profile: ResolvedProfile,
  options?: DriverConnectOptions,
): Promise<Session> { … }
```

### Asking the user something at connect time

**You cannot.** There is no prompt channel, and inventing one would put UI in a
driver. The host passes what a driver may ask through `DriverConnectOptions`:

- `signal` — an `AbortSignal`; honour it, including during a slow handshake.
- `confirmUnknownHostKey` — the only question that exists today. There is no
  auto-accept path and **no driver may supply a default that answers true.**
- `knownHostsPath` — for tests.
- `settings` — everything under `pitta.<yourDriverId>.*`, passed through
  untouched. This is where *policy* lives, as opposed to capability: whether
  `KEYS` is allowed at all, how long `MONITOR` may run. Core does not interpret
  it, and a driver that finds nothing there uses its own defaults.

If you need a question that does not exist, **add it to
`DriverConnectOptions`** — a contract change, reviewed as one — rather than
inventing a channel. Before `confirmUnknownHostKey` existed, a bastion Pitta had
never seen refused every first connection with nothing to accept.

### SSH tunnels

Never write your own. `@pitta/ssh` exports `tunnelFor(profile, options)`, which
handles agent, key, password, jump hosts and `known_hosts` verification once:

```ts
import { tunnelFor, refuseMultiHostTunnel } from '@pitta/ssh'

const tunnel = await tunnelFor(profile, options)
try {
  const client = await connectClient(tunnel?.host ?? host, tunnel?.port ?? port)
  …
} catch (error) {
  await tunnel?.close()
  throw error
}
```

::: danger A self-discovering topology must refuse the tunnel
If your engine's client is handed further node addresses *after* it connects —
a cluster, a sentinel set, an SRV or seed-list replica set — those addresses only
resolve on the bastion's side, and one forwarded port cannot serve them.

Call `refuseMultiHostTunnel(engine, mode)`. It throws with the reason and the fix.

Honouring the tunnel for the seed and then bypassing it for every node after
that would look like it worked and would not be, which is worse than refusing.
:::

### TLS

The `ssl` block on the profile is engine-independent and yours to map onto your
client's vocabulary. Two rules:

- Default a non-loopback host to full verification.
- If your client's vocabulary does not have a single switch — SQL Server's
  `encrypt` plus `trustServerCertificate` is the case that forced this — map
  both and make the insecure combination visible, so the host can badge it.

## 6. `Session` and `QueryHandle`

```ts
interface Session {
  readonly id: string
  readonly state: SessionState
  readonly serverInfo: ServerInfo
  readonly readOnly: boolean
  readonly capabilities?: Partial<DriverCapabilities>

  query(text: string, params?: readonly unknown[], options?: QueryOptions): Promise<QueryHandle>
  queryAll(text: string, params?: readonly unknown[], options?: QueryOptions): Promise<{ fields: readonly FieldMeta[]; rows: Row[] }>
  transaction<T>(fn: (tx: Session) => Promise<T>, options?: TxOptions): Promise<T>
  cancelCurrent(): Promise<void>
  listen?(channel: string, signal?: AbortSignal): AsyncIterable<NotificationEvent>
  ping(): Promise<void>
  close(): Promise<void>
  onStateChange(listener: (state: SessionState, error?: Error) => void): () => void
}
```

`transaction` is defined for every driver. On an engine with nothing to roll back
to it simply runs the function — which is exactly why `supportsTransactions`
exists as a separate flag, and why a dialog that assumes otherwise is asserting
a guarantee the engine never made.

### Streaming

```ts
interface QueryHandle {
  readonly id: string
  readonly shape?: ResultShape
  fields(): Promise<readonly FieldMeta[]>
  rows(): AsyncIterable<Row>
  fetch(count: number): Promise<Row[]>
  commandTag(): Promise<string>
  rowCount(): number | undefined
  cancel(): Promise<void>
  dispose(): Promise<void>
}
```

`fetch(n)` is the grid's pull. **Really pull.** A driver that has already
buffered the whole result and slices it satisfies the type and fails the point:
the memory budget is asserted in CI at 1M rows × 20 columns under 600 MB.

Concretely: pause the underlying request as soon as a page has arrived, and
resume only when `fetch` asks for more. A request abandoned mid-result must be
**cancelled**, not returned to the pool half-read — a pooled connection carrying
an unread result is a bug that shows up several queries later in someone else's
statement.

`dispose()` must be safe to call at any point, including mid-stream.

### Cancellation

`supportsQueryCancel` means *out of band*: something that stops the statement on
the server, on a second channel, while the first one is still blocked. A
PostgreSQL cancel request, a MySQL `KILL QUERY`, a MongoDB `killOp` against a
labelled operation, a SQL Server attention packet.

Closing the socket is not cancellation. If that is all your engine has, declare
`false` and the command is hidden rather than offered and useless.

Label your operations at connect time where the engine allows it — Redis
`CLIENT SETNAME`, MongoDB's operation comment, `application_name` — so the thing
you need to kill can be found.

## 7. Types

The one place engine differences really bite.

```ts
describeType(typeId: number | string, typeName: string): TypeInfo
```

The non-negotiable rules, for every engine:

1. **`decimal` / `numeric` → string.** Never `Number`. Rendered exact, compared
   as string, edited as string. An eslint rule fails the build on the coercion.
2. **`int8` / `bigint` → `bigint` or string.** Never silently truncated.
3. **`NULL` is a distinct sentinel.** Never `''`, never `0`.
4. **A missing field is not null** where your engine has both. Return
   `{ missing: true }` and set `distinguishesMissing`.
5. **Timestamps carry their zone**, and a time-of-day type must not come back as
   an epoch date. A `time` column that reads as `1970-01-01T03:04:05Z` is a bug
   found in review of the sixth driver; so is a `date` returned as a midnight
   instant that a time zone can move.
6. **An unknown type falls back to raw text.** Display something; never throw.

### When the wire cannot carry the type

This is the category the first five drivers did not have, and the sixth did.

TDS decodes `decimal` into a double before any driver code runs. No client
configuration fixes it. Rule 1 therefore cannot be satisfied by parsing more
carefully — so the driver **converts on the server**, in the statements it
builds, and states plainly where it cannot (ADR-058).

If you are in that position: convert server-side, document it, and **do not
quietly narrow rule 1**. Returning a rounded double because the protocol made it
hard is the failure mode this rule exists to prevent.

## 8. Statements and the language

If your engine's statements are not SQL, declare a language:

```ts
export const ACME_LANGUAGE: EngineLanguage = {
  id: 'acme',
  displayName: 'AcmeQL',
  fileExtensions: ['.acme'],
  lineComment: '#',
  fallbackSplit: 'newline',   // 'semicolon' | 'newline' | 'none'
}
```

Core passes statement text through and never inspects it. Every place that used
to say "SQL" in a label, a picker title or a file filter asks the language for
its display name instead. Omitting `language` means SQL, which is why the
relational drivers did not have to change when this arrived.

`fallbackSplit` is what core does when you supply no splitter. Supply
`splitStatements` when your language needs real lexing — a Redis command ends at
a newline *outside* quotes, and a value containing one must stay a single
command. Supply `formatCommand` if you have a formatter.

### If your engine *is* SQL, you still supply both

There is no such thing as "SQL", only four engines that nearly agree. Core keeps
a scanner and a printer, parameterized by a `SqlDialect`, and every SQL driver
passes its own:

```ts
import { MYSQL_DIALECT, formatSql, splitStatements as splitSql } from '@pitta/core'

export const DIALECT = MYSQL_DIALECT

export const splitStatements = (text: string) => splitSql(text, DIALECT)
export const formatCommand = (text: string, o?: FormatOptions) =>
  formatSql(text, { ...o, dialect: DIALECT })
```

The flags describe what the scanner has to see through, and each one is a real
bug where it is wrong: `backtickQuoting` (a `;` inside `` `odd;name` ``),
`bracketQuoting`, `hashComment`, `dollarQuoting`, `nestedBlockComments` (MySQL
closes at the first `*/`; treating them as nested swallows the file),
`metaCommands` (psql's `\dt`), and `batchSeparator` — a bare `GO` line that ends
a batch and is **not sent to the server**.

Every flag is off by default. A dialect that says nothing is scanned with ANSI
rules only, so you cannot inherit another engine's grammar by omission
(ADR-060). Core's `POSTGRES_DIALECT` remains the floor for a buffer that
declares SQL and has no connection to ask — a `.sql` file bound to nothing.

### A `Statement` is not necessarily text

```ts
interface Statement { text: string; params: readonly unknown[] }
```

For a document store, the command document rides in `params` and `text` is a
label. Core never reads the text, so this is legitimate — but say so in your
conformance fixture by overriding `run`, since the kit's default assumes the
text *is* the wire form.

### Classification

Guards need to know whether a command is destructive. Core has a shared
heuristic as a floor. Where your engine publishes its own metadata — Redis
`COMMAND INFO` flags, a MongoDB verb plus an empty-filter test — classify in the
driver and let core combine the two by the fixed rule: **destructive if either
says so, and neither can downgrade the other** (ADR-027).

Classify the commands the shared heuristic reads as harmless. On SQL Server that
meant `EXEC`, `SELECT … INTO`, `BULK INSERT`, `RESTORE`, `BACKUP`, `DBCC` and
`KILL` — all writes, none of them looking like one to a SQL-shaped heuristic.

An **unclassifiable** command on a `prod` connection is treated as destructive.
Unknown fails closed (ADR-040).

## 9. Introspection

Declarative by default: describe the query and the row mapping, and core owns
caching, batching and version gating.

### Name your own levels

`ObjectKind` is an open string (ADR-036), so a level your engine has and nobody
else does needs no edit to core. What it does need is a descriptor, or the tree
draws it with a default icon and a folder called "Keyprefixs":

```ts
nodeKinds: [
  { kind: 'keyPrefix', label: 'Prefix', pluralLabel: 'Keys', icon: 'folder' },
  { kind: 'key', label: 'Key', pluralLabel: 'Keys', icon: 'key', canOpenData: true },
]
```

`canOpenData` is what makes clicking the node open the data view — there is no
list of browsable kinds anywhere in the host, because a list like that could
only ever name the engines that shipped before yours.

Core has descriptors for the relational vocabulary and for the non-relational
kinds the shipped engines share, and they fill in per field: overriding an icon
for a kind core knows keeps its label, plural and `canOpenData`. The conformance
kit asserts that every kind your plan can emit is either one core knows or one
you described, which is the mitigation ADR-036 promised for losing the
compiler's typo check.

```ts
export const ACME_INTROSPECTION: IntrospectionPlan = {
  nodes: {
    schema: {
      query: (ctx) => ({ sql: 'select name from sys.schemas order by name', params: [] }),
      map: (row) => ({
        ref: { connectionId: '', schema: String(row.name), name: String(row.name), kind: 'schema' },
        label: String(row.name),
        hasChildren: true,
      }),
      children: ['table', 'view'],
      minVersion: 90000,   // skip on servers that lack the catalog
    },
  },
}
```

Where listing is not a query, supply `fetch` instead — imperative and **paged**:

```ts
key: {
  async fetch(session, context, page) {
    const { cursor, keys } = await scan(session, page?.cursor, page?.limit ?? 500)
    return { nodes: keys.map(toNode), nextCursor: cursor }
  },
}
```

Exactly one of `query` or `map`+`query`, or `fetch`, per level. Redis `SCAN`
forced this to exist; use it also for any level large enough that reading it
whole is the wrong thing to do (ADR-037).

`fetch` is handed a narrowed `FetchSession` with only `queryAll`, deliberately:
reading a tree level is a read, and a definition handed the whole session could
open a transaction or close it.

If your engine has object kinds core does not know by name, declare
`nodeKinds: NodeKindDescriptor[]` for their labels and icons. The explorer reads
descriptors; it does not have a switch for you to add a case to.

### Three-part names and databases you cannot switch to

If your client wraps every statement so that `USE`-style database switching is a
no-op, the introspection plan has to reach other databases **by name** rather
than by switching to them. SQL Server's plan qualifies through `sys` with
three-part names for exactly this reason (ADR-059).

## 10. Building statements for the grid

```ts
buildSelect(ref: ObjectRef, query: GridQuery, fields: readonly FieldMeta[]): Statement
buildDml(ref: ObjectRef, edits: readonly RowEdit[], fields: readonly FieldMeta[]): Statement[]
```

`buildSelect` receives the sort, the filters and the page — as a cursor or an
offset, according to which paging flag you set. Honour what you declared.

### Paging by cursor

If `supportsOffsetPaging` is false, the page arrives as
`{ mode: 'cursor', cursor?: string }` and your handle answers `nextCursor()`
with where the next one starts — or `undefined`, which is how a scan ends. There
is no total and no row count to compare against, so `undefined` is the *only*
way your engine can say there is no more.

The grid degrades to Next and Previous when it sees this, drops the jump to the
first page and the row range, and hides the exact count, which the host refuses
outright rather than answering with a full scan (P11-T9). Previous works because
the panel remembers the cursors it has been given, not because a cursor can be
rewound.

Read `nextCursor()` *after* the page has been consumed. And do not expect the
caller to ask for one row more than it wants: a cursor cannot be rewound by a
row, so on this path the limit is exactly the page size.

If your engine has offsets — even expensive ones — declare them. Redis pays for
its offsets with a `SKIP` it writes into the command bar where the user can see
it, which is a better trade than a page control that cannot jump (ADR-049).

**Every user value is a parameter.** Only identifiers are interpolated, and only
through `quoteIdent()`, which escapes embedded quotes. An eslint rule rejects a
template literal carrying a value into a statement in these paths. On an engine
that takes structured commands the rule is satisfied by construction — a BSON
filter and an argv array have no formatting step to escape from.

Filter operators include `exists`, `notExists` and `regex` alongside the
relational ones. Support the ones your engine has and no more; the grid offers
what the capability flags allow.

`buildDml` returns the statement list the apply dialog **shows the user before
running**. It is a preview, so it must be the real thing: what is displayed is
what executes.

If `supportsAtomicEdits` is false, the host applies the list one at a time and
reports which succeeded. Your job is to make each statement independently
meaningful and to have declared the flag honestly.

::: tip Removing a field is not clearing it
A `set` value may be core's `MISSING`. That asks for the field to be **removed**
— `$unset`, not `$set: null` — and afterwards the record does not have it. Two
different documents, matched by two different queries (ADR-039).

You only receive one if you declared `distinguishesMissing`; the host refuses
the edit everywhere else rather than writing NULL and calling it the same thing.
:::

Also relevant here:

- `placeholder(index)` — your parameter style. `none` for engines that take
  values rather than a statement with holes in it.
- `rowIdColumn` — only when `supportsRowIdFallback` is true (`ctid`, `rowid`).
- `formatLiteral` — for the places a literal genuinely must appear, such as
  generated DDL. Not a way around parameter binding.

## 11. The optional surfaces

Every one of these is gated on a capability, so skipping it hides the feature
rather than breaking it. Add them in this order — the first three are what makes
a driver feel finished.

| Method | Flag | Notes |
| --- | --- | --- |
| `generateDdl` | `supportsDdlGeneration` | Prefer the server's own text where the catalog has it; compose from the catalog where it does not, rather than guessing. |
| `readStructure` | — | Columns, indexes, constraints, and whatever your engine has instead. |
| `explain` + `planFlags` | `supportsExplain` | See below. |
| `readActivity`, `stopBackend` | `supportsSessionMonitor` | Name the blocker directly if the engine can. |
| `readHealth` | `supportsHealthReport` | Read-only findings. **Quote the identifiers you read out of the catalog** in any suggested SQL. |
| `estimateRowCount` | — | The cheap estimate. Do not run `COUNT(*)` here. |
| `bulkLoad` | `supportsBulkLoad` | `COPY`, `LOAD DATA`, `insertMany`. |
| `importRecords`, `exportRecords` | — | Document engines. |
| `readChannels`, `listen`, `buildPublish` | `supportsNotifications` | Offer only patterns the server is configured to emit. |
| `buildTtl` | `supportsTtl` | Clearing a TTL is `PERSIST`, not an expiry of zero. |
| `readSymbols`, `languageService` | — | Completion and hover from your engine's own metadata. |

### Where engine-specific plan findings go

`analyzePlan` in core is deliberately generic. Your engine's rules go in
`DriverAdapter.planFlags(plan)`, and the facts they read ride on
`PlanNode.engine`, which core never interprets.

Judge a scan against the table's **real size**, not against the rows it
returned. A full scan of twenty thousand rows that returns three is invisible if
you only look at the output count — that was a real bug in the sixth driver,
fixed by asking the catalog for the table's row count.

## 12. When the client library argues with the contract

The sixth driver added a whole category the first five did not have: problems
with the *client protocol* rather than with the engine's language.

**If the client wraps every statement.** `mssql` sends everything through
`sp_executesql`, which makes session-scoped `SET` and `USE` no-ops — the setting
applies to the wrapper's scope and vanishes. Anything needing a session setting
has to **pin a connection itself**. `Session` has no "give me a connection"
method, so the driver exposes its own alongside the contract. That is
legitimate; it is not something to work around by pretending the `SET` worked.

**Session state outlives your statement.** A failed `explain` once left
`SET SHOWPLAN_ALL ON` on a pooled connection. The setting outlived both the
statement and the rollback, so every later query that borrowed that connection
returned *no rows at all* rather than an error. Clean up in a `finally` that
runs whatever happened, and write the regression test so it runs **more queries
than the pool has connections** — otherwise it passes without ever reusing the
poisoned one.

**Client type objects can lie.** `mssql`'s type objects are functions that
*carry* a `declaration` rather than returning one, so a naive read described
every decimal column as an nvarchar and dropped its scale. Assert your type
mapping against a real server; the conformance kit's exact-decimal check is
there for this.

**Not every code path reports metadata.** `batch()` in `mssql` reports no column
metadata at all, only `query()` does — which made every plan rowset arrive
unreadable. Whatever path you use for an internal feature needs the same
verification as the main one.

## 13. Read-only

If your engine has no server-side read-only session, **do not claim one**. Set
`supportsReadOnlySessions: false`, refuse anything you classify as `write` or
`admin` in the client, and let the badge read "client-side only". The connection
form should recommend the real enforcement — a read-only database user, or an
ACL.

A guarantee the server is not making must never be presented as one (S4.10). The
sixth driver shipped a review that found `readOnly` enforced nowhere while the
capability claimed the server was doing it; that is the shape of the bug.

## 14. Passing the conformance kit

A driver is **supported** only when
[the kit](./conformance) runs green against a real server in CI. There are no
aspirational drivers.

For a relational engine:

```ts
runDriverConformance({
  name: 'Acme 3',
  adapter: acmeDriver,
  open: () => connectForTest(),
  fixture: sqlEngineFixture(acmeDriver, ACME_DIALECT),
  available: Boolean(process.env.ACME_URL),
})
```

For anything else, write the `EngineFixture` methods directly. Add your server to
`docker-compose.test.yml` and wire the suite into CI.

Every check in the kit is gated on a capability flag rather than on the driver's
identity. That is the point: the kit describes the *contract*, and an engine that
cannot do something declares so and is not asked to. **If a check ever needs to
know which engine it is talking to, the contract is wrong** — file that rather
than special-casing it.

## 15. Checklist

- [ ] Package under `packages/driver-*`; nothing outside it changed but the
      registry map and the docs
- [ ] Client library is pure JavaScript, optional native packages excluded
- [ ] Capabilities spread from `MINIMAL_CAPABILITIES`, each flag true only
      because the code does it
- [ ] Session narrows capabilities where the deployment differs from the engine
- [ ] `sshConnectionFields()` used; a self-discovering topology calls
      `refuseMultiHostTunnel`
- [ ] `tunnelFor` used; no second copy of host-key verification
- [ ] `AbortSignal` honoured through the handshake
- [ ] `fetch(n)` really pulls; an abandoned result is cancelled, not pooled
- [ ] `decimal` is a string, `bigint` is a `bigint`, and both round-trip exactly
      against a real server
- [ ] Missing and null stay distinct where the engine has both, in both
      directions: read back as missing, and removable as `$unset`
- [ ] A kind your plan emits that core has no vocabulary for has a `nodeKinds`
      descriptor
- [ ] A SQL engine passes its own `SqlDialect` through `splitStatements` and
      `formatCommand` rather than inheriting PostgreSQL's
- [ ] A cursor-paging engine answers `nextCursor()`, and `undefined` means the
      end of the scan
- [ ] Every user value is a parameter; identifiers go through `quoteIdent`
- [ ] Destructive classification uses the engine's own metadata where it exists
- [ ] `readOnly` is enforced, and the badge matches who is enforcing it
- [ ] Health-report SQL quotes the identifiers it read from the catalog
- [ ] Conformance kit green against a real server in CI
- [ ] Every gap this guide did not answer filed as a doc bug

## 16. Filing a doc bug

Open an issue with the `docs` label, quote the question you had, and say what
you did instead. The gaps that produced sections 5, 7, 9 and 12 of this page
came from exactly that, and each one had been rediscovered by two drivers before
anyone wrote it down.
