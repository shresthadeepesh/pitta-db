# 03 — Driver API Contract

> **Contract v1 — relational engines.** This document describes the contract as
> it shipped for PostgreSQL and SQLite, and it assumes SQL in five places:
> statements are SQL text, results are columns × rows, introspection is a query,
> the tree vocabulary is a closed relational enum, and safety classification
> comes from a SQL grammar.
>
> **`10-ENGINE-MODEL.md` is the v2 delta** that removes those assumptions for
> MongoDB and Redis — engine languages, imperative paged introspection, result
> shapes, missing-vs-null, cursor paging, session-refined capabilities, and
> driver-side command classification. Read this document for the shape, then
> that one for what changes in Phase 11. Rationale: ADR-034.

Goal: adding an engine means adding one package under `packages/driver-*` and registering it. **Zero edits to `core` or `extension`.** CI enforces this — the SQLite adapter (Phase 9) lands as an additive-only PR or the design failed.

## 1. Registration

```ts
// packages/driver-pg/src/index.ts
import { defineDriver } from '@pitta/core/driver'
export default defineDriver({ id: 'postgres', displayName: 'PostgreSQL', … })
```
Registry is a static map in `packages/extension` (bundled drivers) plus, **[P2]**, a `pitta.drivers` contribution point so third-party extensions can register their own.

## 2. Capabilities — the anti-`if (id === 'postgres')` device

```ts
interface DriverCapabilities {
  // structure
  supportsCatalogs: boolean            // multiple databases per connection
  supportsSchemas: boolean
  objectKinds: ObjectKind[]            // which tree branches exist at all
  // execution
  supportsCursors: boolean             // server-side streaming
  supportsMultiStatement: boolean
  supportsNamedParameters: boolean
  supportsQueryCancel: boolean         // out-of-band cancel
  supportsTransactionalDdl: boolean
  isolationLevels: IsolationLevel[]
  // features
  supportsExplain: boolean
  supportsExplainAnalyze: boolean
  supportsNotifications: boolean       // LISTEN/NOTIFY
  supportsArrays: boolean
  supportsJson: boolean
  supportsRowIdFallback: boolean       // ctid / rowid for PK-less editing
  supportsDdlGeneration: boolean
  supportsSchemaDiff: boolean
  // limits
  maxIdentifierLength: number
  identifierCase: 'lower' | 'upper' | 'exact'
}
```
Every UI affordance is gated on a flag. A command whose capability is false is `when`-clause-hidden, not disabled-and-confusing.

## 3. Core surface

```ts
interface DriverAdapter {
  readonly id: string
  readonly displayName: string
  readonly capabilities: DriverCapabilities

  /** JSON-schema-ish descriptor the connection form renders itself from.
   *  Adding MySQL must not require writing a new React form. */
  readonly connectionSchema: ConnectionFieldSpec[]

  /** Turn a raw profile + resolved secrets into a live session. */
  connect(profile: ResolvedProfile, signal: AbortSignal): Promise<Session>

  /** Declarative introspection: queries + row→node mapping, no imperative tree code. */
  readonly introspection: IntrospectionPlan

  // SQL generation helpers
  quoteIdent(name: string): string
  qualify(ref: ObjectRef): string
  formatLiteral(value: unknown, type: TypeInfo): string
  // Since Phase 11 these return `{ text, params }`: what a driver builds is a
  // `find` on MongoDB and an `HSET` on Redis, and core never reads the text.
  buildSelect(ref: ObjectRef, q: GridQuery): Statement
  buildDml(ref: ObjectRef, edits: RowEdit[]): Statement[]

  // optional, gated by capabilities
  explain?(session: Session, sql: string, o: ExplainOptions): Promise<PlanNode>
  generateDdl?(session: Session, ref: ObjectRef): Promise<string>
  diffSchema?(a: Session, b: Session, o: DiffOptions): Promise<string>
  parseSql?(sql: string): ParseResult          // for diagnostics
}
```

```ts
interface Session {
  readonly id: string
  readonly state: 'connecting' | 'open' | 'closed' | 'error'
  query(sql: string, params?: unknown[], opts?: QueryOptions): QueryHandle
  transaction<T>(fn: (tx: Session) => Promise<T>, o?: TxOptions): Promise<T>
  cancelCurrent(): Promise<void>
  listen?(channel: string): AsyncIterable<NotificationEvent>
  ping(): Promise<void>
  close(): Promise<void>
  readonly serverInfo: { version: string; versionNum: number; encoding: string; timeZone: string }
}

interface QueryHandle {
  readonly id: string
  fields(): Promise<FieldMeta[]>
  rows(): AsyncIterable<Row>         // streams; cursor-backed when supported
  fetch(n: number): Promise<Row[]>   // pull-based paging for the grid
  commandTag(): Promise<string>
  // Where the next page starts, on an engine that pages by cursor (P11-T9).
  // Opaque, read after the page has been consumed, and undefined at the end of
  // a scan - which is the only way an engine with no total can say "no more".
  nextCursor?(): string | undefined
  notices: EventEmitter<Notice>
  cancel(): Promise<void>
  dispose(): void
}
```

### Splitting and formatting are the driver's

```ts
splitStatements?(text: string): { text: string; start: number; end: number }[]
formatCommand?(text: string, o?: FormatOptions): string
readonly dialect?: SqlDialect
```

Absent means core's floor: the semicolon scanner for an engine whose language
declares `fallbackSplit: 'semicolon'`, and no formatting at all otherwise. Every
shipped driver supplies both, because the four SQL engines do not agree on what
a statement even looks like - a `;` inside a backtick identifier, a `#` comment,
a `GO` line that is not sent to the server. The scanner and the printer are
shared code in core, parameterized by a `SqlDialect` the driver passes; what is
not shared is the claim about whose SQL is being read (ADR-060).

`dialect` is that same value, published rather than kept private, for the other
things that have to read *around* the code without parsing it. Finding the
placeholders in a buffer is one: `'?'` inside a MySQL string is a character and
`[?]` on SQL Server is an identifier, and a prompt that asked for either would
be asking about the engine's punctuation. Absent means ANSI rules only.

### Routines are read, replaced and called through the driver

```ts
readonly routines?: RoutineSupport
```

```ts
describe(session, ref): Promise<RoutineDefinition>   // text, arguments, what it returns
buildReplace(previous, text): RoutineReplacement     // and whether it can be undone
buildDrop(definition): Statement[]
buildInvoke(definition, args): Statement[]           // CALL / EXEC / SELECT
locateError?(definition, error): RoutineErrorLocation | undefined
```

Absent means the engine has no routines, or Pitta can only show them: every
command it powers is hidden rather than offered and broken (ADR-001).

Two fields carry what the host cannot work out for itself. `RoutineReplacement.
atomic` is false where a replacement is a drop and a create with nothing holding
them together - MySQL, which has neither `CREATE OR REPLACE` for a routine nor
transactional DDL - and the editor warns before it runs and restores the old
definition when the create fails. `RoutineDefinition.bodyOffset` says where the
body starts inside the printed definition, because engines report a failure as a
line of the *body* and the editor is showing the whole `CREATE`.

`locateError` is optional on purpose. MySQL reports no line inside a routine at
all, and a guessed line is worse than none: it puts a squiggle under a statement
that is fine.

### Removing a field is not clearing it

`RowEdit`'s `set` may carry core's `MISSING` for a field, which asks for the
field to be **removed**: `$unset` rather than `$set: null`, and afterwards the
record does not have it (ADR-039). The grid only offers the action where the
session's resolved `distinguishesMissing` is true, and the host refuses it
anywhere else rather than quietly writing NULL - so a relational driver never
receives one.

## 4. Type system bridge

The single place engine differences actually bite. Each driver supplies:

```ts
interface TypeHandler {
  matches(oid: number | string): boolean
  kind: 'string'|'number'|'bigint'|'decimal'|'bool'|'date'|'time'|'timestamp'|'timestamptz'
      | 'interval'|'json'|'array'|'enum'|'binary'|'uuid'|'geometry'|'vector'|'range'|'composite'|'unknown'
  parse(raw: string | Buffer): unknown
  serialize(value: unknown): string | Buffer | null
  /** which webview cell editor to mount */
  editor: EditorKind
  /** display without full parse — grid renders 1M cells */
  preview(value: unknown): string
}
```

Non-negotiable rules, all engines:
1. `decimal`/`numeric` → **string**, never `Number`. Rendered exact, compared as string, edited as string.
2. `int8`/`bigint` → `bigint` or string. Never silently truncated.
3. `NULL` is a distinct sentinel, never conflated with `''` or `0`. Grid shows a styled `NULL` token; filters offer `IS NULL` separately.
4. `timestamptz` carries the session `TimeZone`; the grid shows the offset and can toggle to UTC.
5. Unknown OIDs fall back to the raw text representation — display something, never throw.

## 5. Introspection plan (declarative)

```ts
interface IntrospectionPlan {
  nodes: Record<ObjectKind, {
    sql(ctx: NodeContext): { sql: string; params: unknown[] }
    map(row: Row): TreeNodeData
    children?: ObjectKind[]
    /** min server version, so PG13 doesn't run PG16-only catalog queries */
    minVersion?: number
  }>
}
```
Keeps every engine's catalog SQL in one readable place and lets `core` cache, batch, and version-gate uniformly.

## 6. Conformance test kit

`packages/core/test/driverConformance.ts` exports a suite any driver must pass:
connect/close · cancel mid-query · streaming 100k rows without buffering · every declared type round-trips (write → read → compare) · transaction rollback leaves no trace · introspection returns a well-formed tree for a fixture schema · capability flags match observed behavior.

**A driver is "supported" only when it passes the kit against real servers in CI.** No aspirational drivers.

Phase 11 made the kit engine-agnostic (landed): each driver supplies an `EngineFixture`
that creates a container, writes records of the engine's types, and names them
back, and the kit gains four assertions that only non-relational engines can
fail — stable document projection, missing surviving round-trip as missing, an
unknown command refused on `prod`, and a non-atomic batch reporting exactly
which edits were applied. See `10-ENGINE-MODEL.md` section 13. The relational
drivers reach it through `sqlEngineFixture`, and `test/echo-driver` is the
deliberately non-relational engine the kit is run against on every commit.

## 7. Gaps the drivers found, and where they are answered

P14-T7 asked that every gap hit while writing a driver be filed as a doc bug and
fixed in the guide. The guide now exists —
[`docs/drivers/authoring.md`](./drivers/authoring) — and each of the gaps below
has a section there rather than a note here. This list is kept as the index: it
says what was learned, who learned it, and where the answer lives.

From the fourth and fifth drivers (MySQL, MongoDB):

| Gap | Answered in |
| --- | --- |
| Where does an SSH tunnel come from, and what must a self-discovering topology do with one? | Guide §5, *SSH tunnels* |
| How does a driver ask the user something at connect time? It cannot; it adds to `DriverConnectOptions`. | Guide §5, *Asking the user something at connect time* |
| Where do engine-specific plan findings go? | Guide §11, *Where engine-specific plan findings go* |
| Buffered is not a shape of streaming: a capability flag describes the code, not the library. | Guide §3 and §6, *Streaming* |
| What does the conformance kit need from a non-relational engine? | Guide §14 |
| Which connection-form fields belong in core? The nine SSH ones. | Guide §4, *Do not write your own SSH fields* |

From the sixth driver (SQL Server), both about the *client protocol* rather than
the engine's language:

| Gap | Answered in |
| --- | --- |
| What if the wire cannot carry a type the contract requires exactly? (ADR-058) | Guide §7, *When the wire cannot carry the type* |
| What if the client wraps every statement, so session `SET` and `USE` are no-ops? (ADR-059) | Guide §12 |

From finishing Phase 11 against the six drivers already written:

| Gap | Answered in |
| --- | --- |
| "SQL" is four engines that nearly agree; whose SQL is a driver's to say (ADR-060). | Guide §8, *If your engine is SQL, you still supply both* |
| A level core has no vocabulary for needs a `nodeKinds` descriptor, not a core edit (ADR-036). | Guide §9, *Name your own levels* |
| A cursor-paging engine reports the end of a scan with `nextCursor()`, because it has no total. | Guide §10, *Paging by cursor* |
| Removing a field and clearing it are different edits, and only one of them is `$set: null` (ADR-039). | Guide §10, *Removing a field is not clearing it* |

New gaps go to the guide, and the issue that reports one carries the `docs`
label (guide §16).
