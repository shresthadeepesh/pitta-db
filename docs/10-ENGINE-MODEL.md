# 10 — Multi-Model Engine Contract (driver contract v2)

`03-DRIVER-API.md` describes the contract as it shipped for PostgreSQL and
SQLite. Both are relational, both speak SQL, and the contract quietly assumes
it in five places. This document is the delta that removes those assumptions so
MongoDB (Phase 12) and Redis (Phase 13) can be drivers rather than forks.

It is written as a *contract change*, deliberately: ADR-021 established that
core changes forced by a new engine must be a decision with a label on the PR,
not a quiet edit. Everything here is that decision, made once, up front, with
the engines that motivate it named.

---

## 1. Where SQL is currently assumed

| # | Assumption | Where | Breaks on |
|---|---|---|---|
| 1 | A statement is SQL text with positional params | `Session.query(sql, params)`, `Statement { sql, params }` | Mongo (BSON command documents), Redis (argv arrays) |
| 2 | Introspection is a query whose rows map to nodes | `NodeDefinition.query()` + `map()`; core executes the SQL | Redis (`SCAN` is a cursor loop), Mongo (`listCollections` is a command) |
| 3 | A result is a fixed set of columns × rows | `FieldMeta[]` + `Row = unknown[]`, wire cell `string \| null` | Mongo (heterogeneous documents, missing ≠ null), Redis (a value is not a row) |
| 4 | The tree vocabulary is a closed enum of relational kinds | `OBJECT_KINDS` | `collection`, `key`, `keyspace`, `stream`, `consumerGroup` |
| 5 | Safety classification comes from a SQL grammar | `classifyStatement`, `splitStatements` | `FLUSHALL`, `db.c.deleteMany({})`, `$out` |

Each is addressed below. Nothing here removes a guarantee: the exact-decimal
rule (ADR-004), the params-not-interpolation rule (S3.1), the staged-edit
preview, and the production guards all survive, and in two cases get stronger.

---

## 2. Engines declare a language

```ts
interface EngineLanguage {
  /** VS Code language id contributed by the driver's extension bundle. */
  id: string                              // 'sql' | 'mongodb' | 'redis'
  displayName: string                     // 'SQL' | 'MongoDB shell' | 'Redis commands'
  fileExtensions: readonly string[]       // ['.sql'] | ['.mongodb.js'] | ['.redis']
  lineComment: string                     // '--' | '//' | '#'
  /** Used only when the driver supplies no splitter of its own. */
  fallbackSplit: 'semicolon' | 'newline' | 'none'
}
```

`DriverAdapter` gains `readonly language: EngineLanguage`, and `Statement.sql`
is renamed `Statement.text`. The text is in *the engine's* language; core never
inspects it, and every place that used to say "SQL" in a variable name or a UI
string reads the language's `displayName` instead.

Query mode, CodeLens, the connection binding, history, saved queries and
notebooks are already text-and-connection shaped. They become language-generic:
a saved query is a file with the engine's extension, a notebook cell carries the
language id, and the status bar shows `connection · database · language`.

Statement splitting and formatting move behind optional driver methods:

```ts
splitStatements?(text: string): readonly { text: string; start: number; end: number }[]
formatCommand?(text: string): string
```

**As built.** Every shipped driver supplies both, the SQL ones included: the
scanner and the printer stay in core as shared code taking a `SqlDialect`, and
each SQL driver passes its own (ADR-060). `POSTGRES_DIALECT` is what core falls
back to for a buffer that declares SQL and has no connection to ask, which is
the whole of what `fallbackSplit: 'semicolon'` now means.

## 3. Introspection may be imperative, and is paged

```ts
interface NodeDefinition {
  // Existing declarative form; still preferred where the catalog is queryable.
  query?(context: NodeContext): NodeQuery
  map?(row: Row, context: NodeContext): TreeNodeData | undefined

  /** For engines whose catalog is not a query. Mutually exclusive with query/map. */
  fetch?(session: Session, context: NodeContext & { page?: TreePage }):
    Promise<{ nodes: TreeNodeData[]; nextCursor?: string }>

  children?: readonly ObjectKind[]
  minServerVersion?: number
  folderLabel?: string
}

interface TreePage { cursor?: string; limit: number }
```

Paging is not a Redis nicety. A Redis database holds millions of keys and there
is no `LIMIT`; the only correct traversal is a `SCAN` cursor. The tree therefore
gains a **Load more** node and a `pitta.explorer.treePageSize` setting, and the
same mechanism caps a MongoDB database with 20 000 collections.

Core keeps ownership of caching, version gating, and invalidation either way,
because `fetch` returns the same `TreeNodeData` the declarative path does.

## 4. The tree vocabulary opens up

`ObjectKind` becomes `string`. The relational kinds stay as exported constants
(`OBJECT_KINDS` remains, as the *known* set), and a driver declares anything
extra:

```ts
interface NodeKindDescriptor {
  kind: string
  label: string
  pluralLabel: string
  /** Codicon id. */
  icon: string
  canOpenData?: boolean
  canOpenStructure?: boolean
}

readonly nodeKinds?: readonly NodeKindDescriptor[]   // on DriverAdapter
```

The alternative — extending the enum for every engine — makes every new engine
a core edit forever, which is precisely the failure ADR-001 exists to prevent.
See ADR-036.

New kinds the first two non-relational drivers introduce: `collection`,
`keyspace`, `keyPrefix`, `key`, `stream`, `consumerGroup`, `serverNode`.

**As built.** `ObjectKind` is `(typeof OBJECT_KINDS)[number] | (string & {})`,
which is `string` with the known kinds still autocompleting. The tree asks
`describeNodeKind(driver, kind)` for a label, a plural, an icon and
`canOpenData`, layered per field: the driver's descriptor, then core's
vocabulary, then the kind string Title Cased with a neutral icon - so a level
nobody has described yet is readable rather than blank. `canOpenStructure` was
not needed: the structure tab is drawn from whatever `readStructure` returned,
so an engine that returns nothing for a kind already has no tab. The conformance
kit asserts that every kind a plan can emit is either a core kind or one the
driver described, which is the typo check ADR-036 promised in place of the
compiler's.

## 5. Results declare a shape

```ts
type ResultShape = 'rows' | 'documents' | 'keyValue' | 'message' | 'none'
```

`rows` is today's behavior. `documents` means the fields were derived by
sampling rather than declared by the server. `keyValue` is a single value with
no column structure (a Redis `GET`). `message` is a status reply (`OK`, `PONG`,
`{ acknowledged: true }`) — rendered as a message, not as a one-cell grid.

`FieldMeta` gains two optional members:

```ts
/** Dotted path into a document, e.g. ['address','city']. */
path?: readonly string[]
/** True when this column came from sampling, not from a declared schema. */
inferred?: boolean
```

For a `documents` result the driver projects a **column union from a sample**
(default 200 documents, `pitta.documents.sampleSize`), ordered `_id` first then
by frequency. The raw document is always available in the detail pane and is
always the last view offered, which is ADR-033's rule applied one level up: a
projection that quietly differs from what is stored would be worse than no
projection, and the raw view is what settles the question. See ADR-038.

## 6. Missing is not null

Postgres has no way for a row to lack a column. A document does, and
`{ a: null }` and `{}` are different documents that different queries match.
Collapsing them would be the same class of bug as rendering `NULL` as an empty
string, which ADR-004 already forbids.

The wire cell type becomes:

```ts
type WireCell = string | null | { missing: true }
```

The grid renders a `MISSING` token, styled distinctly from `NULL`. The filter
row offers `exists` / `does not exist` separately from `IS NULL`, so
`FILTER_OPS` gains `exists`, `notExists`, and `regex`. A cell editor can clear a
field to null (`$set: null`) or remove it (`$unset`), and those are two
different menu items with two different generated commands. Engines that cannot
distinguish the two declare `distinguishesMissing: false` and never see the
token. See ADR-039.

**As built.** Removing lives in the cell detail pane rather than in a cell
editor: clearing a cell is typing, and removing a field is an action about the
record, so it sits beside Filter and Copy where the field is named. It reaches
the driver as core's `MISSING` inside `RowEdit.set` - the same value a read puts
in a cell the record does not have - and the host refuses it on an engine that
declared `distinguishesMissing: false` rather than writing NULL and calling it
the same thing.

## 7. Paging gains a cursor mode

```ts
page: { mode: 'keyset'; after?: readonly unknown[] }
    | { mode: 'offset'; offset: number }
    | { mode: 'cursor'; cursor?: string }
```

`QueryHandle` gains `nextCursor(): string | undefined`. Redis `SCAN`/`HSCAN`
and a MongoDB cursor both page this way, and neither can report a total or jump
to an offset — so the grid's page control renders as *Next / Previous within
this session* rather than as numbered pages when
`supportsCursorPaging && !supportsOffsetPaging`.

**As built.** The switch is `!supportsOffsetPaging` alone: an engine with
offsets keeps the control that can jump even where it also has a cursor, because
Redis pays for its offsets in a `SKIP` the user can see rather than in a page
control that cannot move (ADR-049). In cursor mode the grid drops the jump to
the first page, numbers rows within the page rather than against a total it does
not have, and hides the exact count — which the host refuses outright rather
than answering with a full scan. Previous is served by remembering the cursors
already handed out; nothing rewinds one. The host also stops asking for one row
more than the page holds, since that extra row cannot be given back.

The Redis case also has no server-side sort and no server-side filter over a
hash scan. Two flags say so, and the grid hides the affordances rather than
sorting one page and implying the whole key was sorted.

## 8. Capability additions

Added to `DriverCapabilities`, all defaulting to `false` in
`MINIMAL_CAPABILITIES` so an engine claims nothing by accident:

| Flag | Meaning |
|---|---|
| `supportsTransactions` | A transaction with rollback exists at all |
| `supportsAtomicEdits` | A staged-edit batch applies all-or-nothing |
| `schemaless` | Records in one container may have different fields |
| `distinguishesMissing` | Absent and null are different values |
| `supportsCursorPaging` / `supportsOffsetPaging` | Which page modes are real |
| `supportsServerSideSort` / `supportsServerSideFilter` | Whether the grid may offer them |
| `supportsAggregation` | A pipeline/aggregation surface worth its own affordances |
| `supportsTtl` | Records expire; TTL is shown and editable |
| `supportsSecondaryIndexes` | An index tree branch and an advisor are meaningful |
| `resultShapes` | Which of the shapes above this engine ever returns |

`parameterStyle` gains `'none'` for engines that take values rather than
placeholders. `isolationLevels` may be empty.

## 9. Capabilities are static, then refined by the session

Some of these are not knowable until connect. MongoDB has multi-document
transactions only on a replica set or a sharded cluster. Redis in cluster mode
cannot run a multi-key `MULTI` across slots, and a connection under an ACL user
may be unable to run `CONFIG` or `CLIENT LIST` at all — the same server, two
users, two different sets of true statements.

```ts
interface Session {
  /** Overrides for facts only knowable after connecting. */
  readonly capabilities?: Partial<DriverCapabilities>
}
```

Core resolves `driver.capabilities` overlaid with `session.capabilities` and the
UI reads the resolved value. This also retires a small Postgres wart: version
gating for feature flags currently lives in call sites. See ADR-035.

**As built.** `resolveCapabilities` is core's; the host reaches it through
`ConnectionManager.capabilitiesFor(profileId, database?)`, which overlays an
*already-open* session and never connects - a question about what a connection
can do must not be the thing that dials a production database. Every UI gate
reads it: the server-activity command, the notification panel, and the data
view's row-id fallback, document shape, atomicity promise and page mode. Before
a session exists the answer is the engine's flags, which is the honest answer to
"what could this connection do".

## 10. Guards become engine-classified

`classifyStatement` keeps its shape and its rule from ADR-027 — a command is
destructive if *either* the driver's classifier or the shared heuristic says so,
and neither can downgrade the other — but the driver-side half becomes explicit:

```ts
interface CommandClassification {
  kind: 'read' | 'write' | 'ddl' | 'admin' | 'transaction' | 'unknown'
  destructive: boolean
  /** The analogue of DML with no WHERE: affects every record in the container. */
  unfiltered: boolean
  targets: readonly ObjectRef[]
  /** Shown verbatim in the confirmation dialog. */
  reason?: string
}

classifyCommand?(text: string, session?: Session): CommandClassification | undefined
```

Two rules that are new, and that matter more here than they did for SQL:

1. **Unknown fails closed on production.** A SQL statement that does not parse
   keeps the heuristic's answer, because the heuristic is good on SQL. There is
   no comparable heuristic for an arbitrary Redis module command or an
   unrecognised `db.runCommand`, so on a `prod`-tagged connection an
   `unknown` classification is treated as destructive and requires the typed
   confirmation. On dev it is allowed with a single confirm.
2. **Classification comes from the engine where the engine offers it.** Redis
   reports `write`, `admin`, `dangerous`, `blocking` and `noscript` flags
   through `COMMAND INFO`, read once at connect. That is the same principle as
   ADR-026's "use the server's own grammar", applied to a different engine's
   own metadata. See ADR-040.

## 11. Editing without transactions

`buildDml` becomes `buildEdits`, returning the same `Statement[]` (now
`{ text, params }`) in the engine's language. The staged-edit model, the dirty
highlighting, and the preview-before-apply flow are unchanged — the preview
shows `db.users.updateOne({_id: ObjectId("…")}, {$set: {…}})` or
`HSET session:42 status active` instead of an `UPDATE`.

What changes is the promise. With `supportsAtomicEdits: false` the apply dialog
says, in those words, that the changes are applied in order and cannot be rolled
back, and that a failure stops the batch leaving earlier changes in place. It
does not silently degrade a guarantee the user was taught to expect from the
Postgres panel. See ADR-041.

For engines with no affected-row count, S4.5's verification degrades to a
read-back of the edited records where a key exists, and to nothing where it does
not — stated in the dialog rather than assumed.

## 12. What is *not* generalized

- **No cross-engine query.** Joining a Postgres table to a Mongo collection is a
  different product. Reaffirmed, not revisited.
- **ERD and schema diff stay relational.** They are gated on
  `supportsSchemaDiff` and foreign keys. A Mongo "relationship" inferred from
  field naming is a guess, and a diagram of guesses is worse than no diagram.
  Index and validator diffing for MongoDB is a separate, honest feature — [P2].
- **The SQL parser stays in `driver-pg`.** Nothing about generalization moves
  grammar into core.
- **`generateDdl` stays optional.** For MongoDB it returns a runnable
  `createCollection` + `createIndexes` script; Redis has no schema to generate
  and declares the flag false.

## 13. Conformance

`packages/core/test/driver-conformance.ts` currently issues SQL. It becomes
engine-agnostic: each driver supplies an `EngineFixture` that can create a
container, write records of the engine's types, and name them back.

The kit then asserts the same behaviors it always did — connect/close, cancel
mid-operation, stream a large result without buffering, every declared type
round-trips, introspection returns a well-formed tree, capability flags match
observed behavior — plus four that only exist now:

- a `documents` result with heterogeneous keys projects to a stable column union
- a missing field survives round-trip as missing, not as null
- an `unknown` command is refused on a `prod` profile
- with `supportsAtomicEdits: false`, a failing batch reports exactly which edits
  were applied

**A driver is still "supported" only when it passes the kit against real servers
in CI.** No aspirational drivers.
