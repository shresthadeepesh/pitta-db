# The data grid

Click a table in the tree, or run **Pitta: Open Data**, and the grid opens. On
MongoDB it opens on a collection; on Redis it opens on a key, in the view its
type deserves.

## Reading

**Paging.** Rows come from a server-side cursor where the engine has one, in
pages of `pitta.defaultFetchSize` (500 by default), fetched as you scroll. A
million-row table opens as fast as a small one because Pitta never asked for a
million rows. Where an engine has no cursor, the generated statement falls back
to a limit and an offset, and the grid says which it is using.

**The SQL is always visible.** Whatever Pitta ran to fill the grid — including
the sort, the filter, and the key it identified rows by — is shown. Nothing is
hidden behind the view.

**Sort and filter run on the server.** They apply to the whole table, not to the
page you happen to have. Click a header to sort; use the filter row for
per-column operators (`=`, `<>`, `>`, `like`, `in`, `is null`, and — since the
contract stopped assuming SQL — `exists`, `not exists` and `regex` where the
engine supports them).

**Columns** can be hidden, pinned, reordered and resized, and the arrangement is
remembered per table.

## Values stay exact

- `numeric` and `decimal` are strings, end to end. They are displayed exactly,
  compared as strings, and edited as strings. They never pass through a
  JavaScript number, because that is where the trailing digits go.
- `int8` / `bigint` is a `bigint` or a string. Never silently truncated.
- `NULL` is a styled token, distinct from an empty string and from zero, and
  `IS NULL` is a separate filter operator rather than a value you type.
- **A missing field is not null.** On a schemaless engine the grid shows a
  distinct token for a field this document simply does not have, and clearing a
  cell asks which you meant: set it to null, or remove the field.
- `timestamptz` carries the session time zone, shows its offset, and can be
  toggled to UTC.
- An unknown type is displayed as its raw text rather than throwing. Something is
  always shown.

## Editing

Double-click a cell to edit it. Each type gets a real editor rather than a text
box: a tri-state boolean, a date/time picker that understands the column's time
zone, an enum dropdown, a JSON editor that validates, array chips, a foreign-key
picker that looks up the referenced row, and upload/download for binary columns.

Edits are **staged**. Nothing is sent while you type. When you apply:

1. You get the exact statements Pitta will run, including which key identifies
   each row.
2. They are applied in **one transaction** where the engine has one.
3. Affected row counts are verified. A statement that matched a different number
   of rows than expected rolls the whole thing back.

Where an engine cannot apply a batch atomically — a standalone MongoDB, a Redis
command list crossing cluster slots — the dialog says so in those words, and the
result reports which edits were applied and which were not. A rollback promise
is never carried across from an engine that has one to an engine that does not.

**Insert**, **duplicate** and **delete row** work the same way: staged, previewed,
applied together.

### Identifying a row

Editing needs to name the row being changed:

1. A primary key, if there is one.
2. A unique constraint, if there is not.
3. A physical row id — `ctid` on PostgreSQL, `rowid` on SQLite — as an opt-in
   fallback, with the caveat stated: it is stable only until the row moves.

If none of those exists — a view, a table with no key and no row-id support —
editing is disabled and the grid tells you *why*, rather than presenting a
control that fails on apply.

## Structure

The **Structure** tab is the object as the catalog describes it: columns,
indexes, constraints, triggers, policies, partitions and statistics on a
relational table; inferred fields, indexes, validation rules, sharding and stats
on a MongoDB collection.

**Show DDL** generates the object's definition. On engines whose catalog carries
the source text it is the server's own; where it does not, Pitta composes a
`CREATE TABLE` from the catalog rather than guessing.

## Getting data out

**Copy** the selection as TSV, CSV, JSON, Markdown, or SQL `INSERT` statements.

**Export** the whole result — CSV, JSON, JSONL, XLSX, or SQL inserts — streamed
to disk with progress and a cancel button. The result is never fully
materialized in memory, so exporting a table larger than RAM is an ordinary
thing to do.

On MongoDB, **Pitta: Export Documents…** writes Extended JSON, so an `ObjectId`
comes back as an `ObjectId` rather than as `{}`.

## Getting data in

**Pitta: Import CSV…** on a table maps columns, previews the type coercion for
every column, and reports what would fail before anything is written. Where the
engine has a bulk path — PostgreSQL `COPY`, MySQL `LOAD DATA LOCAL INFILE` — it
is used.

**Pitta: Import Documents…** on a MongoDB collection reads a JSON array or
NDJSON; the format is detected from the file rather than asked for.

Imported values obey the same exactness rules as everything else: a `numeric`
column is not routed through a float on the way in.

## Redis

A Redis key opens in the view its type deserves — string, hash, list, set,
sorted set, stream with its consumer groups, or a JSON document — and **TTL is a
first-class, editable field** rather than something to remember a command for.
**Pitta: Set Expiry…** sets or clears it; clearing is `PERSIST`, not an expiry
of zero.

The keyspace tree is built with `SCAN` in bounded pages. `KEYS` is refused by
default (`pitta.redis.allowKeysCommand`) because it walks the whole keyspace and
blocks the server while it does.
