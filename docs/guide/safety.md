# Safety and guards

Pitta is meant to be safe to point at production. The guards below are on by
default, and each one exists because the alternative has cost somebody a table.

They read **masked** statement text — comments and string literals blanked out
first — so `select 'drop table users'` is a string, and a `WHERE` inside a
subquery is not mistaken for the outer statement's own.

## What is classified as destructive

`DROP`, `TRUNCATE`, `ALTER … DROP`, and `UPDATE`/`DELETE` with no `WHERE`. On
PostgreSQL this comes from a real parse rather than a pattern match.

On the non-relational engines the classification is the **driver's**, taken from
the engine's own metadata where it publishes any — Redis `COMMAND INFO` flags,
MongoDB's operation verb plus a test for an empty filter — and combined with the
shared heuristic by a fixed rule: **destructive if either says so, and neither
can downgrade the other.**

Engine-specific cases worth knowing:

- `deleteMany({})` and `updateMany({})` are the analogue of DML with no `WHERE`,
  and are covered by the same block.
- An aggregation containing `$out` or `$merge` is a write. Pitta walks the
  pipeline to find out rather than trusting the method name.
- Redis `KEYS` and `MONITOR` are **refused**, not confirmed — one blocks the
  server walking the keyspace, the other streams every command the server runs
  to this client. `pitta.redis.allowKeysCommand` and `pitta.redis.allowMonitor`
  exist for when you have decided otherwise; `MONITOR` is refused on production
  whatever they are set to, and time-boxes itself.
- `FLUSHALL`, `FLUSHDB`, `SWAPDB`, `CONFIG SET`, `SHUTDOWN`, `MIGRATE`,
  `REPLICAOF`, `CLUSTER RESET`, `ACL SETUSER` and `EVAL` need the typed
  confirmation on production.
- On SQL Server, `EXEC`, `SELECT … INTO`, `BULK INSERT`, `RESTORE`, `BACKUP`,
  `DBCC` and `KILL` are classified by the driver, because the shared heuristic
  reads them as harmless.

## Unknown fails closed

A command Pitta **cannot classify at all** on a `prod` connection is treated as
destructive and needs the typed confirmation. Where there is no trustworthy
heuristic to fall back to, guessing "probably fine" is the wrong default.

## The confirmations

| Environment | Destructive statement |
| --- | --- |
| `prod` | Type the connection name back. Not configurable away. |
| `staging`, `dev` | A single confirmation, quoting the statement. Configurable with `pitta.query.confirmDestructive`. |

A modal that only needs a click gets dismissed reflexively, which is why
production asks you to type something.

## Unqualified DML

`pitta.query.blockUnqualifiedDml` (default `true`) refuses an `UPDATE` or
`DELETE` with no `WHERE` clause on **any** connection, production or not. This
is a block rather than a confirmation: add a `WHERE`, or turn the setting off
deliberately.

## Read-only connections

Every write is refused, DML and DDL alike.

Where the engine has a server-side read-only session, Pitta sets it *and*
enforces client-side. Where it does not, the badge reads **client-side only**
and the connection form recommends what actually enforces it — a read-only
database user, or a Redis ACL. A guarantee the server is not making is never
presented as one.

## Row edits

Staged, previewed as the exact statements including the key that identifies each
row, applied in one transaction, and verified against the affected row counts. A
mismatch rolls the batch back.

Where an engine cannot do that atomically, the dialog says so and the result
reports which edits were applied. See
[the data grid](./data-grid#editing).

## Injection

Every value you type — a grid filter, a cell editor, a parameter prompt, an
imported CSV field — leaves as a **bind parameter**. String interpolation of a
user value into a statement is banned, and an eslint rule fails the build on it.

Identifiers read from the catalog are the only interpolated fragments, and only
through `quoteIdent()`, which escapes embedded quotes.

On the engines that do not use text at all the rule is stronger by construction:
MongoDB filters and updates are built as BSON from typed input, and Redis
commands are argv arrays. There is no formatting step for user input to escape
from.

## MongoDB query files never execute

A `.mongodb.js` file is parsed to an AST and converted to BSON. No `eval`, no
`vm`, no `new Function`. Server-side JavaScript — `$where`, `$function`,
`$accumulator`, `mapReduce` — is refused unless you explicitly enable it, and is
always classified as an admin operation.

## Secrets

Credentials are stored only through `vscode.SecretStorage`, which is the OS
keychain. Writing one to `settings.json`, to a workspace file, to global state,
or to a log line is treated as a release blocker rather than a bug.

The webview never receives a credential: the connection form posts a draft
carrying a *reference*, and resolution happens in the extension host. The
logger has a redaction pass keyed both on known secret field names and on the
resolved values themselves, so a secret cannot reach a log by travelling inside
some other object.

## Transport

Non-loopback connections default to full TLS verification. Turning verification
off takes an explicit per-connection acknowledgement and badges the connection
**insecure TLS** for as long as it exists.

SSH host keys are verified against `~/.ssh/known_hosts`; an unknown key prompts
with its fingerprint and is never auto-accepted.

## Untrusted workspaces

In a workspace you have not trusted, VS Code ignores the workspace's values for
the guard settings and uses yours. A repository cannot ship a `settings.json`
that turns the confirmations off — the restriction is enforced by VS Code, not
by Pitta.

## Privacy

Query history is local and excludes `prod` by default. No SQL text, schema
names, hostnames or row data leaves the machine.

The MongoDB schema inference and the Redis key sample do read your real data to
build the tree and the completion index. Both stay in the extension host, both
obey the metadata cache TTL and the same on-disk rules as any other cached
metadata, and neither is ever sent anywhere.

## Turning things off

Every guard is a setting, listed in [Settings](./settings), except the typed
production confirmation. Turn one off knowingly; the defaults are what makes a
`prod` tag mean something.
