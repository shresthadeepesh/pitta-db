# Stored routines

Procedures and functions are objects you **edit, run and read the output of** —
not text you copy out of a DDL view, paste into a scratch buffer and paste back.

## Editing

**Edit Routine** on a function or procedure in the explorer opens its definition
as a real editor document: syntax, folding, find, a dirty marker, `Ctrl+S`. What
you save is a replacement, and it goes through the same guards as any other
write — a routine on a production connection is confirmed exactly as a `DELETE`
there would be, and a read-only connection refuses.

**Compare Routine with Server** puts the definition as it stands on the server
beside the one in your editor, which is how you see what a colleague changed
under you before you overwrite it.

What each engine does when you save:

| Engine | How it replaces | If the new definition fails to compile |
| --- | --- | --- |
| PostgreSQL | `CREATE OR REPLACE` | Nothing happened — DDL is transactional |
| SQL Server | `DROP` then `CREATE`, in one transaction | Nothing happened — the drop rolls back |
| MySQL / MariaDB | `DROP` then `CREATE`, with nothing holding them together | Pitta puts the old definition back, and says so if it cannot |

MySQL is the one to know about: it has no `CREATE OR REPLACE` for a routine and
cannot roll DDL back, so Pitta asks before it starts and keeps the old text to
restore. If the restore fails too, the editor still holds the old definition —
do not close it.

::: warning The overload trap
`CREATE OR REPLACE FUNCTION` on PostgreSQL only replaces a function with the
**same argument types**. Change one and the server happily creates a *second*
function beside the first, reports success, and every existing call keeps
reaching the old one. Pitta checks the routine after saving, says so when this
has happened, and offers to drop the old overload.
:::

A failure on save is put on the line of the **body** the server complained
about, not at the top of the file. PostgreSQL and SQL Server both report one;
MySQL reports none, and Pitta shows the message without inventing a line.

## Running

**Run Routine** — from the explorer, or from the routine's own editor tab — asks
for the arguments first, in the same form the [parameter
prompt](./query-mode.md#parameters) uses. It knows the arguments from the
catalog, so each one arrives with its declared name and type, `OUT` parameters
are not asked for, and an argument with a default is marked optional.

The call itself is built by the driver, because the same idea is three different
statements:

| Engine | Procedure | Function |
| --- | --- | --- |
| PostgreSQL | `CALL s.p($1, NULL)` | `SELECT s.f($1)`, or `SELECT * FROM s.f($1)` when it returns a set |
| SQL Server | `EXEC s.p @a = @1, @b = @out OUTPUT` plus the select that reads `@out` back | `SELECT s.f(@1)`, or `SELECT * FROM s.f(@1)` for a table-valued one |
| MySQL | `CALL s.p(?, @out)` then `SELECT @out` | `SELECT s.f(?)` |

Values are **bound as parameters**, never pasted into the statement. Results,
cancellation, history and the row grid are the same as any other run.

## Watching one run

A procedure that takes a minute is the reason this exists. While it runs, every
message the server sends arrives in the results panel **as it is sent**:

- PostgreSQL — `RAISE NOTICE`, `RAISE WARNING`, and the rest
- SQL Server — `PRINT`, and `RAISERROR … WITH NOWAIT`
- MySQL / MariaDB — warnings, including `SIGNAL SQLSTATE '01000' SET MESSAGE_TEXT = '…'`

That last one is worth knowing about: MySQL has no notice channel at all, so a
`SIGNAL` is the only way a procedure can report progress, and it is only visible
because Pitta asks for the warnings immediately — the next statement clears
them.

When a statement fails inside a routine, the engine's own stack is shown under
**Where**: which routine, and which line of its body, innermost first. That is
usually enough to open the routine and go straight to the line.

::: tip Not a step debugger
There are no breakpoints here yet. What there is: the definition in a real
editor, the call built for you, every message as it happens, and failures
pointed at a line.
:::
