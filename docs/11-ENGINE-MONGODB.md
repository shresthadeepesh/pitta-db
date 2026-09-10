# 11 — MongoDB Engine

Driver package `packages/driver-mongodb`, engine id `mongodb`, built on the
pure-JS `mongodb` Node driver (ADR-046). Phase 12. Depends on the contract
changes in `10-ENGINE-MODEL.md` being landed first.

Target: MongoDB 6.0 → 8.x, self-hosted or Atlas, standalone / replica set /
sharded. DocumentDB and Cosmos' Mongo API are *not* claimed — they answer to a
subset of the same wire protocol, and claiming them without CI against them
would be an aspirational driver.

---

## 1. Capabilities

```ts
supportsCatalogs: true          // databases
supportsSchemas: false          // there is no level between database and collection
schemaless: true
distinguishesMissing: true
objectKinds: ['catalog','folder','collection','view','index','field','serverNode']

supportsCursors: true           // a real server cursor, batched
supportsMultiStatement: true    // one shell command per line-group
supportsNamedParameters: false
supportsQueryCancel: true       // killOp, found by comment — ADR-043
supportsTransactionalDdl: false
supportsTransactions: <session>  // replica set or sharded only — ADR-035
supportsAtomicEdits: <session>
supportsSavepoints: false
isolationLevels: ['read uncommitted','snapshot' as available]

supportsExplain: true
supportsExplainAnalyze: true    // executionStats actually runs the query
supportsNotifications: true     // change streams, on a replica set
supportsArrays: true
supportsJson: true
supportsRowIdFallback: false    // _id always exists; there is no fallback to need
supportsDdlGeneration: true     // createCollection + createIndexes script
supportsSchemaDiff: false       // [P2] index/validator diff only
supportsReadOnlySessions: false // enforced client-side + a read-only user
supportsSessionMonitor: true    // $currentOp
supportsHealthReport: true
supportsBulkLoad: true          // insertMany, ordered:false, batched
supportsCursorPaging: true
supportsOffsetPaging: true      // skip/limit, with the usual deep-page warning
supportsServerSideSort: true
supportsServerSideFilter: true
supportsAggregation: true
supportsTtl: true               // TTL indexes
supportsSecondaryIndexes: true
resultShapes: ['documents','message','none']
parameterStyle: 'none'
identifierCase: 'exact'
```

## 2. Connecting

Rendered from `connectionSchema` like every other engine — no bespoke form.

| Group | Fields |
|---|---|
| general | name, group, color, environment, read-only |
| connection | scheme (`mongodb` / `mongodb+srv`), hosts (tags field, `host:port` each), database, authSource, replicaSet, directConnection, readPreference, appName (default `pitta/<version>`) |
| auth | mechanism (`SCRAM-SHA-256`, `SCRAM-SHA-1`, `MONGODB-X509`, `MONGODB-AWS`, `DEFAULT`), username, password (`SecretRef`) |
| tls | enabled, CA file, client cert, client key, key passphrase (`SecretRef`), allowInvalidCertificates, allowInvalidHostnames, tlsInsecure |
| ssh | the existing `ssh2` tunnel, unchanged |
| advanced | connectTimeoutMS, socketTimeoutMS, serverSelectionTimeoutMS, maxPoolSize, `maxTimeMS` default, compressors, retryWrites, retryReads |

`parseConnectionUri` accepts a full `mongodb://` / `mongodb+srv://` string,
strips the password straight into SecretStorage and never echoes it (A1, S1.3).
`mongodb+srv` implies TLS; the form says so rather than letting the user think
they turned it off.

S2.1 applies unchanged: any non-loopback host defaults to TLS with certificate
validation, and `allowInvalidCertificates` or `tlsInsecure` badges the
connection "insecure TLS" in the tree.

**Topology probe at connect.** `hello()` tells us whether this is a replica set
or a sharded cluster, which decides `supportsTransactions` and
`supportsAtomicEdits` for the session (ADR-035), and whether change streams are
available for the notifications panel.

## 3. The tree

```
Connection (env-colored)
└─ Databases                       (admin/local/config collapsed unless showSystemObjects)
   └─ Collections                  (+ document count estimate, storage size)
      ├─ Indexes                   (keys, unique, sparse, partial, TTL, hidden)
      └─ Fields          [inferred] sampled key/type profile — ADR-045
   ├─ Views                        (name + the pipeline that defines it)
   └─ (Atlas) Search indexes       [P2]
└─ Server                          hello(), build info, topology, members
```

Collection counts use `estimatedDocumentCount()` — the metadata count, free —
which is exactly what `estimateRowCount` was added for in ADR-021. Exact
`countDocuments()` stays on demand, and says which one is being shown.

A database with thousands of collections pages through the `Load more` node
(§3 of `10-ENGINE-MODEL.md`).

## 4. Query mode

**Language id `mongodb`, files `.mongodb.js`.** The dialect is the mongosh
subset people already write:

```js
db.orders.find({ status: "open" }, { _id: 1, total: 1 }).sort({ total: -1 }).limit(50)
db.orders.aggregate([{ $match: { status: "open" } }, { $group: { _id: "$customerId", n: { $sum: 1 } } }])
db.orders.updateMany({ status: "draft" }, { $set: { status: "open" } })
db.runCommand({ collStats: "orders" })
```

**It is parsed, never evaluated (ADR-042).** The text goes through `acorn` to an
AST; the AST is matched against an allowlist of call shapes; object and array
literals are converted to BSON directly from the syntax tree, with the
constructor forms mongosh uses (`ObjectId`, `ISODate`, `NumberLong`,
`NumberDecimal`, `UUID`, `BinData`, `/regex/flags`) recognised as literals. No
`eval`, no `vm`, no `new Function`. Anything outside the allowlist — a variable,
a function call we do not know, control flow — is a diagnostic, not a fallback
to execution.

Consequences, stated up front: no loops, no `let`, no user-defined helpers in a
`.mongodb.js` file. That is a real limitation against mongosh and the right
trade for a client that executes what someone pastes from a ticket.

- **Splitting.** Statements split on top-level statement boundaries in the AST,
  so a multi-line pipeline is one unit and a file of ten commands is ten result
  tabs. Same execution semantics as SQL: a failure stops the batch (ADR-015).
- **Intelligence.** Completion of database names, collection names, and *fields
  from the sampled schema*, plus operator keywords (`$match`, `$lookup`, …) with
  signatures. Hover on a field shows the sampled types and presence. Backed by
  the same metadata cache; the sample is what `readSymbols` returns for this
  engine.
- **Diagnostics.** Unparseable text, disallowed constructs, unknown collection
  (warning, suppressed when the index is empty — ADR-027's caution applies
  unchanged), unknown top-level operator.
- **Cancel.** Real, see ADR-043.

## 5. The grid

A result is `documents`. The column union is sampled from the fetched page
(default 200 docs), `_id` first, then by descending frequency, then
alphabetically for ties. Nested objects are flattened one level into dotted
paths when the dotted name does not collide with a real top-level field;
otherwise the object stays a single cell. Arrays render as an `[n]` chip.

Every cell keeps its raw BSON in the detail pane, which offers JSON tree /
extended-JSON text / hex-for-binary, with raw text always last (ADR-033).

Type mapping, with ADR-004 intact:

| BSON | ValueKind | Notes |
|---|---|---|
| Double | number | |
| Decimal128 | decimal | **string on the wire, always** |
| Int32 | number | |
| Int64 | bigint | never through `Number` |
| String | string | |
| ObjectId | uuid-like | rendered as the 24-hex form, copyable |
| Date | timestamp | UTC; the grid's timezone toggle applies |
| Timestamp | timestamp | the internal oplog type, labelled as such |
| Boolean | bool | |
| Null | — | renders `NULL` |
| *absent* | — | renders `MISSING` (ADR-039) |
| Object / Array | json / array | tree in the detail pane |
| Binary | binary | subtype shown; images detected by magic bytes (ADR-033) |
| Regex | string | `/pattern/flags` |
| MinKey / MaxKey | unknown | rendered as their literal token |

## 6. Editing

A document result is editable when every document in it came from one
collection and carries `_id`. An aggregation result is read-only with the reason
shown, unless the pipeline is a pure `$match`/`$sort`/`$project`/`$limit` chain
over one collection, in which case identity survives and editing is allowed.

Generated commands, always previewed before they run:

```js
db.orders.updateOne({ _id: ObjectId("…") }, { $set: { status: "open" }, $unset: { legacyFlag: "" } })
db.orders.insertOne({ … })
db.orders.deleteOne({ _id: ObjectId("…") })
```

- Clearing a field to `null` and removing a field are **two different actions**
  producing `$set: null` and `$unset` (ADR-039).
- Editing a field inside a nested object or an array element uses a dotted or
  positional path; the preview shows the exact path so an accidental
  `orders.0.total` is visible before it runs.
- Apply runs in a transaction when the session reports one is available, and
  says plainly that it cannot when it is not (ADR-041).
- S4.5's affected-count check maps to `matchedCount`/`modifiedCount`; a
  `matchedCount` of 0 on an update aborts the batch — that is the stale-key
  mass-update guard, and it works here too.

## 7. Structure view

`readStructure` returns, as `StructureSection[]` (ADR-032, unchanged):

| Section | Contents |
|---|---|
| fields | **Inferred.** name, observed types with percentages, presence %, sample size, and a note saying it is a sample (ADR-045) |
| indexes | name, key spec, unique, sparse, partial filter, TTL seconds, hidden, size, usage count from `$indexStats` |
| validation | the `$jsonSchema` validator, validationLevel, validationAction |
| sharding | shard key, chunk counts per shard, balancer state — omitted when not sharded |
| statistics | document count, avg document size, storage size, index sizes, capped, WiredTiger cache figures |

Sections that do not apply are omitted, not returned empty.

## 8. Explain

`explain('executionStats')` maps into the existing `QueryPlan` model: each stage
becomes a node, `nReturned`, `docsExamined`, `keysExamined`,
`executionTimeMillisEstimate` and `works` become its metrics, and rejected plans
render as a collapsed sibling list.

Red-flag rules, written the way ADR-024 requires — what was observed, in
numbers, and what it usually means:

- `COLLSCAN` on a collection above a size threshold, reporting how many
  documents were examined to return how many.
- `docsExamined ≫ nReturned` (default 10×): the index is not selective, or
  there is none.
- An in-memory `SORT` stage, with the bytes sorted and the 100 MB limit named.
- `$lookup` executing a nested loop without an index on the foreign field.
- A plan whose winning plan changed between two runs of the same query — the
  plan-diff view already built in P6-T3 covers it.

**`explain` with `executionStats` runs the query.** Write operations are
therefore explained in `queryPlanner` mode only, and the destructive guards
apply to an explain-analyze exactly as they do to executing it.

## 9. Monitoring and health

`readActivity` from `$currentOp`: opid, namespace, operation, running seconds,
client, appName, waiting-for-lock, and the plan summary. `stopBackend` maps to
`killOp`. Nothing polls by default; the manual/5-second-opt-in rule from ADR-025
applies unchanged.

`readHealth` findings, read-only with suggested commands, never auto-applied:

- Indexes with zero accesses since the last restart (`$indexStats`), with the
  caveat about restart time stated in the finding.
- Redundant indexes — one whose key spec is a prefix of another's.
- Collections with no index other than `_id` and a document count above a
  threshold.
- Unbounded growth signals: storage size ≫ data size (fragmentation), capped
  collection near its cap, oplog window shorter than a configurable target.
- Connection saturation, WiredTiger read/write ticket exhaustion, cache eviction
  pressure, from `serverStatus`.
- TTL index candidates: a Date field present on ~100% of documents in a
  collection that only ever grows. Stated as a question, not an instruction.

## 10. Import, export, notebooks

- **Import**: CSV → collection through `bulkLoad`, `insertMany` with
  `ordered: false` in batches, with the same coerce-before-writing sample and
  error report as Postgres (ADR-030). Type mapping is chosen per column and
  previewed; numbers destined for `Decimal128` never pass through a JS number.
  JSON / NDJSON import as well, which is the format people actually have.
- **Export**: JSON, Extended JSON (canonical and relaxed), NDJSON, CSV. CSV of
  nested documents flattens with dotted paths and states the rule in the export
  dialog, because a silently lossy CSV is worse than a refused one.
- **Notebooks**: `.pittabook` gains a language id per notebook (ADR-029's
  one-notebook-one-database rule is unchanged); a MongoDB notebook serializes to
  a runnable `.mongodb.js` script.

## 11. Safety

Everything in `05-SECURITY.md` applies. The engine-specific additions:

- **`deleteMany`/`updateMany` with `{}` or a missing filter** is the analogue of
  `DELETE` without `WHERE` — blocked by `pitta.query.blockUnqualifiedDml`
  (default on), overridable only by an explicit typed confirmation.
- **`drop`, `dropDatabase`, `dropIndex`, `dropIndexes`, `renameCollection`** are
  destructive.
- **`$out` and `$merge` make an aggregation a write.** An aggregation pipeline
  reads as harmless and can replace an entire collection. The classifier walks
  the pipeline for these stages and classifies the command by what it found, not
  by the method name.
- **Server-side JavaScript** — `$where`, `$function`, `$accumulator`,
  `mapReduce` — is refused unless `pitta.mongodb.allowServerSideJs` is turned on,
  and is always classified as an admin-level operation.
- **Values are BSON, never string-concatenated.** Grid filters, cell editors and
  parameter prompts build BSON values from typed input; there is no code path
  that renders user input into command text. That is S3.1 for this engine, and
  the eslint rule that enforces it extends to `buildSelect`/`buildEdits` here.
- **Read-only profiles** are enforced client-side by refusing any command the
  classifier calls a write or admin operation, and the connection form
  recommends a read-only database user, since the server cannot enforce it for
  us. The tree badge says "client-side only" so nobody mistakes it for a
  server-side guarantee.

## 12. Testing

- `docker-compose.test.yml` gains MongoDB 6, 7 and 8 services, one of them a
  single-node **replica set** so transactions and change streams are covered.
- `test/fixtures/mongo-seed.js`: a deliberately nasty corpus — documents with
  disjoint key sets, every BSON type including Decimal128 at full precision and
  Int64 at max, deep nesting, arrays of subdocuments, a field that is a string
  in half the documents and a number in the other half, a field present in 1% of
  documents, keys needing quoting (dots, `$`, unicode), a 16 MB document, a
  100k-document collection for paging, a 1M-document collection for the
  benchmark.
- The conformance kit's `EngineFixture` for MongoDB; the four non-relational
  assertions from §13 of `10-ENGINE-MODEL.md` are exercised here first.
- Property tests: the sampled column union is stable for a given sample;
  round-tripping every BSON type through the grid's wire encoding is lossless;
  missing stays missing.

---

## 13. What is built

`packages/driver-mongodb`, registered alongside PostgreSQL, SQLite and Redis.

**Working.** Connecting (standalone, replica set, sharded, SRV; SCRAM, x.509
and AWS IAM; TLS) with the topology probed at connect so transactions and
all-or-nothing edits are claimed only where they exist. The tree - databases,
collections, views, indexes, and *columns sampled from the documents*. The
document grid, with the sampled column union, one level of dotted flattening,
BSON types where Decimal128 and Int64 stay exact, and `MISSING` rendered apart
from `NULL`. Editing by `_id` through previewed `updateOne` / `insertOne` /
`deleteOne`. The structure view. `explain` into the shared plan model.
`$currentOp` monitoring with `killOp`, and a health report from `$indexStats`,
`serverStatus` and the index shapes. The guards, including the empty-filter
check and the `$out`/`$merge` pipeline walk.

And the shell parser: `db.orders.find({...}).sort({...}).limit(50)` and the
constructor literals, parsed with acorn and converted to BSON without ever being
executed. The tests that matter most are the refusals - `require("fs")`,
`process.env`, a bare variable, a loop, a computed key - each of which the
obvious implementation would have passed by doing the thing being refused.

**Not built yet.** The `.mongodb.js` editor language, so commands are issued by
panels rather than typed into a file, and with it completion, hover and
diagnostics from the sampled schema. Tree paging for a database with thousands
of collections. `readSymbols`. The sharding section. The Mongo-specific
red-flag rules on top of the plan. The seeded integration fixture and the
conformance `EngineFixture`. Positional array paths when editing. Change
streams behind the notifications panel.

Task-level status is in `07-TASKS.md` under Phase 12.

