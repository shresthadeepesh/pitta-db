# 12 — Redis Engine

Driver package `packages/driver-redis`, engine id `redis`, built on the pure-JS
`ioredis` client (ADR-046). Phase 13, after MongoDB — the contract work is
shared, and Redis is the engine that stresses it hardest.

Target: Redis 6.2 → 8.x and Valkey, standalone / sentinel / cluster, plus
optional detection of the JSON and Time Series modules. Redis is not a database
in the shape the rest of this product assumes, and most of the interesting
decisions below come from that.

---

## 1. What Redis is not

- **No schema, no tables, no rows.** A database is a flat keyspace. The tree's
  folder structure is something Pitta *invents* from key names (ADR-044).
- **No cheap enumeration.** `KEYS *` blocks the server for the duration of a
  full keyspace walk. On a production instance with ten million keys that is an
  outage. Every listing is `SCAN`-based, cursor-paged, bounded.
- **No rollback.** `MULTI`/`EXEC` is atomic in the sense that nothing else runs
  in between, but a command that fails at execution time does not undo the ones
  before it. `supportsAtomicEdits: false`, and the apply dialog says so in
  words (ADR-041).
- **No server-side read-only session.** Enforcement is client-side plus a
  recommendation to use an ACL user, and the UI says which it is.
- **No query planner.** `supportsExplain: false`. There is nothing to visualize
  and a fake plan tree would be worse than an absent tab.
- **No count that is both exact and free.** `DBSIZE` is exact for a database;
  the number of keys under a prefix is only ever an estimate from a sample.

## 2. Capabilities

```ts
supportsCatalogs: true          // db0..dbN — but see cluster, below
supportsSchemas: false
schemaless: true
distinguishesMissing: false     // a field is present or the key is not there
objectKinds: ['catalog','keyspace','keyPrefix','key','stream','consumerGroup','serverNode','folder']

supportsCursors: false          // SCAN is a cursor, but not a server-held one
supportsCursorPaging: true
supportsOffsetPaging: false     // LRANGE is indexable; SCAN is not. See §6.
supportsServerSideSort: false   // ZSET reads come back ordered; nothing else does
supportsServerSideFilter: true  // SCAN MATCH, and only glob patterns
supportsMultiStatement: true
supportsNamedParameters: false
supportsQueryCancel: true       // CLIENT UNPAUSE / CLIENT KILL of our own second connection
supportsTransactions: true      // MULTI/EXEC
supportsAtomicEdits: false      // ...without rollback
supportsSavepoints: false
isolationLevels: []

supportsExplain: false
supportsNotifications: true     // pub/sub and keyspace notifications
supportsArrays: false
supportsJson: <session>         // true when the JSON module is loaded
supportsRowIdFallback: false
supportsDdlGeneration: false
supportsSchemaDiff: false
supportsReadOnlySessions: false // client-side only, said out loud
supportsSessionMonitor: true    // CLIENT LIST / CLIENT KILL
supportsHealthReport: true      // INFO, SLOWLOG, MEMORY
supportsBulkLoad: true          // pipelined
supportsTtl: true               // first-class: TTL is a column and an editor
supportsSecondaryIndexes: false
resultShapes: ['rows','keyValue','message','none']
parameterStyle: 'none'
identifierCase: 'exact'
```

## 3. Connecting

| Group | Fields |
|---|---|
| general | name, group, color, environment, read-only |
| connection | mode (`standalone` / `sentinel` / `cluster`), host, port, database index (0–15, hidden in cluster mode), URI paste (`redis://`, `rediss://`) |
| sentinel | sentinel nodes (tags), master name, sentinel username/password (`SecretRef`) |
| cluster | seed nodes (tags), `enableReadyCheck`, replica reads (`READONLY`) |
| auth | username (ACL, Redis ≥ 6), password (`SecretRef`) |
| tls | enabled, CA, client cert, client key, key passphrase (`SecretRef`), servername (SNI), rejectUnauthorized |
| ssh | the existing `ssh2` tunnel, unchanged |
| advanced | connectTimeout, commandTimeout, keepAlive, client name (default `pitta/<version>`), scan count, key separator |

At connect Pitta runs `CLIENT SETNAME pitta/<version>`, so its own connections
are identifiable in the monitor and killable without guesswork, and reads
`COMMAND INFO`/`COMMAND DOCS`, `INFO server`, `INFO keyspace` and — when
permitted — `CONFIG GET databases`.

**`CONFIG` is often disabled** on managed Redis. When it is, the database count
comes from `INFO keyspace` (which only reports non-empty databases) and the tree
says so rather than showing a wrong number of databases. Cluster mode has one
logical database and the database level is replaced by a **Nodes** level.

## 4. The tree

```
Connection (env-colored)
├─ db0  (keys: 1,284,301)              ← DBSIZE, exact and free
│  ├─ session:                         ← prefix folder, from a bounded sample
│  │  ├─ session:abc123      [hash · ttl 3m 12s]
│  │  └─ … Load more
│  ├─ cache:user:            [12,4xx keys, estimated]
│  └─ (keys with no separator)
├─ db1 …
├─ Channels                            pub/sub channels seen (PUBSUB CHANNELS)
└─ Server
   ├─ Info                             INFO, by section
   ├─ Clients                          CLIENT LIST
   ├─ Slowlog                          SLOWLOG GET
   └─ Nodes / Replication              cluster or replication topology
```

Prefix folders come from a **bounded SCAN sample** (default 5 000 keys,
`pitta.redis.sampleKeys`), split on `pitta.redis.keySeparator` (default `:`).
Counts shown on a folder are estimates and are labelled as estimates. Expanding
a folder runs a real `SCAN MATCH prefix:*` and pages with the cursor. See
ADR-044.

`KEYS` is never issued. `pitta.redis.allowKeysCommand` exists, defaults false,
and even when enabled is classified as a dangerous command and confirmed on
production.

## 5. Command mode

**Language id `redis`, files `.redis`.** One command per line, the syntax people
type into `redis-cli`:

```
GET session:abc123
HGETALL user:42
SCAN 0 MATCH cache:* COUNT 100
ZRANGE leaderboard 0 9 WITHSCORES
```

Splitting is per line, with quoting rules matching `redis-cli` (double and
single quotes, `\xNN` escapes) so a value containing spaces survives. Comments
start with `#`. A failure stops the batch (ADR-015).

Completion is command names with their arity and summary from `COMMAND DOCS` —
the server's own documentation, so it matches the server actually connected to,
modules included — plus key names from the sampled keyspace and field names for
a hash under the cursor. Hover shows the command's summary, complexity, ACL
categories and flags. This is the same principle as ADR-026: the engine's own
metadata beats a bundled table that drifts.

Results render by reply type: a bulk string as `keyValue`, an array as `rows`,
a map reply as field/value rows, `OK`/`PONG` as `message`.

## 6. Browsing a key

Opening a key opens the data view. What the grid shows depends on the key's
type, and `buildSelect` compiles the `GridQuery` into the right command:

| Type | Columns | Paging | Edits |
|---|---|---|---|
| string | value | none (one value; detail pane for large ones) | `SET` |
| hash | field, value | `HSCAN` cursor | `HSET`, `HDEL` |
| list | index, value | `LRANGE` window — the one type with real offsets | `LSET`, `LINSERT`, `LREM` |
| set | member | `SSCAN` cursor | `SADD`, `SREM` |
| zset | member, score | `ZRANGE` window, ordered | `ZADD`, `ZREM` |
| stream | id, field, value | `XRANGE` by id | `XADD`, `XDEL` (+ consumer groups as children) |
| JSON (module) | path, value | JSON tree in the detail pane | `JSON.SET`, `JSON.DEL` |

**Paging a scan costs what it costs.** `LRANGE` and `ZRANGE` take index ranges,
so paging them is exact. The other containers are cursors, and a cursor cannot
be resumed from a number: page 5 of a hash means reading pages 1 to 4 and
discarding them. That is written into the command as a `SKIP` suffix the client
strips and honours, so the command bar shows what the server was actually asked
to do rather than a page number that looks free (ADR-049).

Above every key view: its type, encoding (`OBJECT ENCODING`), memory usage
(`MEMORY USAGE`, sampled), and its **TTL as an editable field** — `EXPIRE`,
`PEXPIREAT` and `PERSIST` are one-click, guarded on production like any other
write. TTL is not an afterthought here; it is often the most important thing
about a key.

Scores are decimals and stay strings on the wire (ADR-004). Stream ids stay
strings. Binary-safe values that are not valid UTF-8 render as hex with the
detail pane's hex view, and are never mangled into replacement characters.

`buildEdits` output is previewed exactly as generated SQL is:

```
HSET user:42 email "new@example.com"
HDEL user:42 legacy_flag
EXPIRE user:42 3600
```

Applied inside `MULTI`/`EXEC` when the keys allow it, with the dialog stating
that there is no rollback (ADR-041). In cluster mode a batch touching more than
one slot cannot be a single transaction, and the dialog says that instead.

## 7. Pub/Sub

The LISTEN/NOTIFY subscriber panel (P6-T6) generalizes: a driver with
`supportsNotifications` supplies `Session.listen(channel)`. Redis implements it
over `SUBSCRIBE` / `PSUBSCRIBE` on a dedicated connection, and adds **keyspace
notifications** (`__keyevent@0__:*`) as a preset — watching keys expire or be
evicted live is one of the few genuinely diagnostic things a Redis client can
offer. Enabling `notify-keyspace-events` requires `CONFIG SET`; Pitta shows the
required setting and does not change it silently.

`MONITOR` is deliberately **not** wired to a panel by default. It streams every
command the server executes and measurably degrades it. It is available behind
`pitta.redis.allowMonitor`, off by default, time-boxed to 60 seconds with a
visible countdown, and refused outright on a `prod` profile.

## 8. Monitoring and health

`readActivity` from `CLIENT LIST`: id, address, name, age, idle, current
command, database, subscription counts, memory used. `stopBackend` maps to
`CLIENT KILL ID`, and Pitta refuses to kill its own connections without an
extra confirmation.

`readHealth` findings from `INFO`, `SLOWLOG`, `MEMORY STATS` and a sampled key
walk:

- **Memory**: `used_memory` against `maxmemory`, fragmentation ratio, eviction
  policy, `evicted_keys` rate. An instance with `maxmemory: 0` and no eviction
  policy is a finding on its own — it will be OOM-killed rather than evict.
- **Persistence**: `rdb_last_bgsave_status`, `aof_last_write_status`, time since
  last successful save, AOF rewrite in progress.
- **Replication**: link status, offset lag per replica, `master_link_down_since`.
- **Latency**: `SLOWLOG` entries with their commands and durations, blocked
  clients, `latencystats` percentiles where available.
- **Keyspace hygiene** (sampled, opt-in, states its sample size): the proportion
  of keys with no TTL in a cache-shaped workload, and the largest keys found by
  `MEMORY USAGE` over the sample — the "one 400 MB hash" problem that nothing
  else in the tree would show.

Nothing polls by default (ADR-025).

## 9. Safety

Redis is the engine where the guards earn their place, because the destructive
commands are short, unqualified, and instantaneous.

- **Classification comes from the server.** `COMMAND INFO` flags every command
  `readonly`, `write`, `admin`, `dangerous`, `blocking`, `noscript`, `denyoom`.
  Pitta reads that table at connect and classifies from it, so a module command
  the client has never heard of is still classified correctly (ADR-040).
- **Always destructive**: `FLUSHALL`, `FLUSHDB`, `SWAPDB`, `SHUTDOWN`,
  `CONFIG SET`, `CONFIG RESETSTAT`, `DEBUG`, `SCRIPT FLUSH`, `FUNCTION FLUSH`,
  `MIGRATE`, `REPLICAOF`, `SLAVEOF`, `FAILOVER`, `CLUSTER RESET`,
  `CLIENT KILL`, `ACL SETUSER`/`DELUSER`. Plus `RENAME` onto an existing key,
  and `DEL`/`UNLINK` with more than one key.
- **Always refused, not merely confirmed**: `KEYS` (unless the setting is on),
  and `MONITOR` on production.
- **`EVAL` / `EVALSHA` / `FCALL`** run arbitrary Lua. Classified as a write and
  an admin operation unless the script declares itself `no-writes`, and always
  confirmed on production.
- **Unknown commands fail closed on production** — the rule from §10 of
  `10-ENGINE-MODEL.md`, and Redis is why it exists.
- **Read-only profiles** refuse anything the flag table calls `write` or
  `admin`, and the badge reads "client-side only". The connection form
  recommends an ACL user restricted with `+@read`, which is the only real
  enforcement.
- **Values are sent as arguments, never spliced into a command string.** `ioredis`
  takes argv arrays; there is no formatting step for user input to escape from.
  That is S3.1 for this engine, and it is structurally stronger than it is for
  SQL.

## 10. Testing

- `docker-compose.test.yml` gains Redis 6.2, 7.x and 8.x, plus one
  `redis-stack` service for the JSON module and one three-node cluster.
- `test/fixtures/redis-seed.txt`: keys of every type; a key with binary
  non-UTF-8 content; a key with a 5 MB value; a hash with 100 000 fields for
  `HSCAN` paging; a zset with float scores that must not lose precision; keys
  with separators at several depths, keys with no separator, keys with unicode
  and spaces; TTLs at second and millisecond precision; a stream with consumer
  groups and pending entries; 1M keys for the tree benchmark.
- Conformance kit `EngineFixture` for Redis. The assertions Redis specifically
  proves: that a `supportsAtomicEdits: false` engine reports exactly which edits
  were applied when a batch fails; that no code path issues `KEYS`; that a
  `prod` profile refuses an unknown command; that the tree never loads more than
  `treePageSize` keys per request regardless of keyspace size.

---

## 11. What is built

The driver package is `packages/driver-redis`, registered alongside PostgreSQL
and SQLite, and it needed two changes to core rather than none: imperative
paged introspection (ADR-037), and the honest non-atomic apply path (ADR-041).
Both were Phase 11 items that Redis is the reason for.

**Working.** Connecting (standalone, sentinel, cluster; ACL auth; TLS), pasting
a `redis://` or `rediss://` URI to fill the form, the
keyspace tree with SCAN-derived prefix folders, browsing and editing every
container type through the ordinary data view, the structure view for a key,
the client monitor, the health report, and the guards - refusals, the
client-side read-only enforcement, server-flag classification, and unknown
failing closed on production. Unit-tested against a scripted server, with an
integration suite that seeds a real one and skips when none is reachable.

**Not built yet.** The `.redis` editor language and its runner, so commands are
issued by panels rather than typed into a file. The pub/sub panel, though
`Session.listen` is implemented under it. The TTL editor action, though the
command builder and the display exist. The settings that would relax `KEYS` and
`MONITOR`: both are refused unconditionally today, which is the safe end of that
decision but not the documented one. The SSH tunnel. The cluster node level.
The sampled big-key report.

Task-level status is in `07-TASKS.md` under Phase 13.

