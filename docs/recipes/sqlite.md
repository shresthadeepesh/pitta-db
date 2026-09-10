# SQLite

| Field | Value |
| --- | --- |
| Name | anything |
| Database file | the path to a `.sqlite` / `.db` file, or `:memory:` |
| Environment | `dev`, usually |
| Read-only | tick it to open a file you only want to look at |

There is no host, port or password: SQLite is a file, and the connection form
shows the fields that exist rather than greying out the ones that do not.

`:memory:` gives a scratch database that is never written to disk — useful for
trying something out, and gone when you disconnect.

The engine is `node-sqlite3-wasm`, compiled to WebAssembly and shipped inside
the VSIX. Nothing to install, and one build works on every platform.

## What is different

SQLite exists in Pitta partly to prove that capability flags work: the UI hides
what this engine cannot do instead of offering a control that fails.

| | |
| --- | --- |
| Schemas | none — the tree goes straight from the connection to tables |
| Multiple databases | one file per connection |
| Server-side cursors | none; results are read in full within the memory guard |
| Query cancellation | none — the command is hidden rather than offered and useless |
| `EXPLAIN` plan view | not offered |
| Transactional DDL | yes |
| Schema diff and migration | not offered |
| `LISTEN` / pub-sub | none |
| SSH tunnel | not applicable |

If any of those appear enabled and then fail, that is a capability-gating bug and
worth reporting.

## Row identity

SQLite tables have `rowid` unless declared `WITHOUT ROWID`, so a table with no
primary key is still editable through the row-id fallback — Pitta says when it
is using it. A `WITHOUT ROWID` table with no primary key cannot be edited, and
the grid says so rather than failing on apply.

## Types

SQLite has storage classes rather than declared types, and a column will hold
whatever you put in it. Pitta reads the declared type for the affinity and the
editor, and shows the value's actual storage class. A `DECIMAL` column declared
in a SQLite schema is stored as text or as a float depending on what was
inserted; Pitta shows what is really there rather than what the declaration
implies.

## Reading a file over Remote-SSH

The path is resolved on the machine VS Code's workspace is on. A file on your
laptop is not reachable from a Remote-SSH window; copy it across, or open a
local window for that connection. See [Remote development](/guide/remote).

## Locking

SQLite takes a write lock on the file. Another process holding one — an
application, another editor — will make writes fail with `SQLITE_BUSY`. That is
the file's own concurrency model rather than something Pitta can queue around.
