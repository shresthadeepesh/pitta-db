# Query mode

Query mode is not SQL mode. The same commands, shortcuts, history, saved queries
and notebooks work for a MongoDB shell file and a Redis command file; each
engine splits and formats its own language, and the UI says "statement" or
"command" depending on which one you are in.

## Running

**Pitta: New Query** opens a file in the bound connection's language — `.sql`,
`.mongodb.js`, or `.redis`. Pick the connection from the status bar, or pin it
[with a directive](./connections#binding-a-file-to-a-connection).

| Action | Shortcut |
| --- | --- |
| Run the statement under the cursor | `Ctrl+Enter` / `Cmd+Enter` |
| Run the selection | `Ctrl+Shift+Enter` / `Cmd+Shift+Enter` |
| Run every statement in the file | `Ctrl+Alt+Enter` / `Cmd+Alt+Enter` |
| Cancel the running query | `Ctrl+Shift+C` / `Cmd+Shift+C` |

A CodeLens above each statement offers **Run** and **Explain** without leaving
the keyboard behind.

Running a file gives one result tab per statement, with its own timing and
command tag. Notices, warnings and `RAISE` output stream in **while the
statement is still running** rather than arriving with the result.

**Statement splitting is the driver's.** PostgreSQL dollar-quoting, `E''`
strings, nested comments and `psql` meta-commands are handled by the PostgreSQL
grammar rather than by a regex; a Redis command ends at a newline *outside*
quotes, so a value containing one stays a single command.

## Cancellation

`Ctrl+Shift+C` asks the **server** to stop: a PostgreSQL cancel request on a
second connection, a MySQL `KILL QUERY`, a SQL Server attention packet, a
MongoDB `killOp` against the labelled operation. It does not abandon the socket
and leave the query burning CPU on the server, which is what "cancel" means in
several other clients.

Engines that cannot cancel say so through a capability flag, and the command is
hidden rather than offered and useless.

## Parameters

Run a statement with placeholders in it and Pitta asks for the values first, in
a form that shows the statement above the boxes:

| You write | Where it works |
| --- | --- |
| `$1`, `$2` | PostgreSQL |
| `?` | MySQL / MariaDB, SQLite |
| `@name` | SQL Server |
| `:name` | every SQL engine — Pitta's own spelling, rewritten to the engine's |

Each value carries a type — text, number, boolean or null — because an engine
that infers a type from the parameter cannot tell `0` from `'0'`, and only you
know which the column wants. Null is a type rather than a magic word, so `NULL`
stays usable as text. The last value you gave a placeholder is filled in again
next run.

A name used twice is asked once; a `?` used twice is two values, because that is
what the engine will bind. In a batch, only the statements that have
placeholders get values. A T-SQL `DECLARE @rows` is a local variable the batch
fills in itself, so it is not asked for, and neither is `@@ROWCOUNT`.

The value is **bound**, never spliced into the text. A `':literal'` inside a
string and a `::text` cast are left alone. This is what stops a query from
turning into an injection because of what someone typed at a prompt.

Turn the prompt off with `pitta.query.promptForParameters` if you would rather
send placeholders as written — the server will reject them.

## Errors

An error arrives with the engine's own code — `SQLSTATE` on PostgreSQL — and,
where the server reports a position, a squiggle mapped back onto the exact
character in your editor rather than a character offset you have to count to.

## Language intelligence

For SQL, this is driven by the real PostgreSQL grammar compiled to WebAssembly —
the same parser the server uses. `SELECT 'DROP TABLE users'` is a string, and a
`WHERE` inside a subquery is not mistaken for the statement's own.

- **Completion** of schemas, tables, columns, functions and keywords, served
  from the metadata cache. Alias-aware: `select o.` after `from orders o` offers
  that table's columns. Enum values are offered inside a comparison against an
  enum column. Keywords complete before you have chosen a connection.
- **Hover** for a column's type, nullability, default and comment; for a table,
  its row estimate and column list.
- **Go to definition** on a table opens its DDL as a virtual document.
  **Find references** searches the `.sql` files in your workspace.
- **Diagnostics** as you type: syntax errors from the grammar, plus unknown
  tables and columns, ambiguous column references, and obvious type mismatches
  checked against the live catalog. `pitta.editor.diagnostics` chooses `off`,
  `syntax`, or `semantic`.
- **Formatting** with `Shift+Alt+F`, a selection with format-selection, or on
  save with `pitta.editor.formatOnSave`. `pitta.editor.keywordCase` and
  `pitta.editor.maxLineLength` control the output.

### The other dialects

MongoDB and Redis get the same three features from their own drivers rather than
from a SQL parser pretending:

- **MongoDB shell** (`.mongodb.js`): collections after `db.`, operations after a
  collection, that collection's own fields inside a filter, and query operators
  and pipeline stages after `$`. Fields come from a sample of documents and every
  suggestion says so — a collection has no declared schema to read.

  Commands are **parsed, never evaluated**. The file goes to an AST, allowlisted
  call shapes are converted to BSON, and nothing in it runs as JavaScript. A
  snippet pasted from a ticket cannot reach the extension host, the file system,
  or your other credentials.

- **Redis** (`.redis`): the command list comes from the connected server's own
  `COMMAND DOCS`, so a module command this build has never heard of still
  completes and still hovers. Keys are deliberately *not* suggested — a keyspace
  cannot be listed cheaply, which is the same reason the tree scans in pages.

## Plans

**Explain** on a statement renders `EXPLAIN` (or `EXPLAIN ANALYZE`) as an
interactive tree with cost, time and row counts, and flags the nodes worth
looking at with the reason: an estimate far from the actual, a sequential scan
judged against the table's real size, a key lookup that ran too many times, an
implicit conversion that quietly disabled an index, or the server's own operator
warnings. Two plans can be diffed.

::: warning EXPLAIN ANALYZE is not a read
It runs the statement. Pitta classifies it as whatever it will actually do, so
`explain analyze delete from orders` hits the destructive guard exactly as the
`delete` would.
:::

## History

Every executed statement is recorded locally, with its connection, duration and
status. Search it, filter by connection or by outcome, and re-run from it.

`prod` connections are excluded by default
(`pitta.history.excludeEnvironments`), and the whole thing can be turned off
with `pitta.history.enabled`. The store is a local JSONL file; nothing leaves
the machine.

## Saved queries

**Pitta: Save Query** writes a plain `.sql` file into your workspace under
`pitta.savedQueries.folder` (`.pitta/queries` by default). They appear in the
Saved Queries view, and because they are ordinary files in your repository they
are reviewed, versioned and diffed like any other code.

Running one asks for its placeholders through the same form as any other run
(see [Parameters](#parameters)); the view lists a query's parameters beside its
name so you can see what it will ask for before you run it.

## Notebooks

**Pitta: New SQL Notebook** creates a `.pittabook.sql` file: cells of query and
markdown with their outputs, and one connection for the whole notebook rather
than per cell.

It serializes to a **runnable script** — what you commit is readable in a diff
and works without Pitta installed. **Export Notebook to SQL** writes the plain
version out.

## Subscriptions

**Pitta: Subscribe to Channels** streams messages into a panel: PostgreSQL
`LISTEN`/`NOTIFY`, or Redis pub/sub including keyspace-notification patterns.
The keyspace patterns are offered only when the server is actually configured to
emit them, rather than listed and silent.
