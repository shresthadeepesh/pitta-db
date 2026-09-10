# Getting started

## Install

Search **Pitta** in the Extensions view, or from a terminal:

```bash
code --install-extension DipeshShrestha.pitta-db
```

Pitta is also on [Open VSX](https://open-vsx.org/extension/DipeshShrestha/pitta-db)
for VSCodium, Cursor, Windsurf and Gitpod.

Requires VS Code 1.90 or newer. There are no native modules and no separate
runtime to install: one VSIX works on every platform, and the SQLite and
PostgreSQL-grammar engines are WebAssembly shipped inside it.

::: tip Running against a remote?
Pitta runs in the **workspace** extension host, so under Remote-SSH, WSL or a
dev container the database connection is made *from the remote machine*. Install
it on the remote, and read [Remote development](./remote) before debugging a
connection that "works in psql".
:::

## Add a connection

1. Click the Pitta icon in the activity bar, then **+** — or run
   **Pitta: Add Connection** from the command palette.
2. Pick the engine. The form redraws itself from that driver's own field list,
   so a MongoDB profile asks for a replica set and a Redis profile asks for a
   mode rather than for a database name that does not exist.
3. Fill in the connection. If you already have a URI, paste it into the host
   field — it is parsed and split across the form.
4. **Test Connection** before saving. It resolves the secret, opens a real
   session, reads the server version, and closes it.

The password goes to your OS keychain through VS Code's `SecretStorage`. It is
never written to `settings.json`, a workspace file, or a log line, and it is
never sent to the connection form itself — the form holds a reference, and the
resolution happens in the extension host.

See [Connections](./connections) for where a profile is stored, how to share one
with a team, and every way a secret can be supplied.

## Tag the environment

Every connection is `dev`, `staging` or `prod`. This is not decoration:

- A `prod` connection is coloured everywhere it appears — the tree, the status
  bar, the results panel.
- Destructive statements on `prod` require you to type the connection name back.
  A dialog you can dismiss with a click gets dismissed reflexively.
- `prod` is excluded from query history by default.

Set it now rather than later. [Safety and guards](./safety) is the full list of
what changes.

## Browse

Expand the connection → database → schema → table. The tree is lazy and paged:
levels load as you open them, and a level with more objects than
`pitta.explorer.pageSize` ends in a **Show more** entry rather than handing VS
Code fifty thousand items.

Click a table, or run **Open Data**, to get the grid. See
[The data grid](./data-grid).

## Or write a query

**Pitta: New Query** opens a file in the connected engine's own language —
`.sql`, `.mongodb.js`, or `.redis`. The status bar at the bottom right shows
which connection and database it runs against; click it to change.

Run the statement under the cursor with `Ctrl+Enter` / `Cmd+Enter`.

| Action | Shortcut |
| --- | --- |
| Run the statement under the cursor | `Ctrl+Enter` / `Cmd+Enter` |
| Run the selection | `Ctrl+Shift+Enter` / `Cmd+Shift+Enter` |
| Run every statement in the file | `Ctrl+Alt+Enter` / `Cmd+Alt+Enter` |
| Cancel the running query | `Ctrl+Shift+C` / `Cmd+Shift+C` |

See [Query mode](./query-mode).

## Where to go next

- [Connections](./connections) — profiles, secrets, sharing, environments.
- [Connection recipes](/recipes/) — a working setup per hosting provider.
- [The data grid](./data-grid) — filtering, editing, the DML preview.
- [Query mode](./query-mode) — completion, notebooks, history, saved queries.
- [Safety and guards](./safety) — what Pitta refuses, and how to change it.
- [Troubleshooting](./troubleshooting) — when it does not connect.
