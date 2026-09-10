# Troubleshooting

Start here: **Pitta: Show Logs**, with `pitta.logLevel` set to `debug`. Every
connection attempt, statement and error goes through that channel, credentials
redacted.

## It will not connect

### "works in psql / mysql / mongosh, not in Pitta"

Nine times in ten this is [where Pitta is running from](./remote). Over
Remote-SSH, WSL, a dev container or a Codespace, the connection is made **from
the remote machine**, so `localhost` means the remote's localhost. Check VS
Code's bottom-left status bar for the window's remote, then read the
[translation table](./remote#the-translation-table).

### Timeout, or "connection refused"

- The server is not listening on TCP, or not on that address. PostgreSQL needs
  `listen_addresses` to include something other than `localhost` for a
  non-loopback client; SQL Server needs the TCP protocol enabled, not just
  shared memory.
- A firewall or security group is in the way. Managed providers deny by default:
  the allowlist has to contain the address that is actually connecting, which
  under Remote-SSH is the remote's egress address, not your laptop's.
- The port is right for the wrong thing. Supabase's pooler, RDS Proxy and
  PgBouncer all listen on ports that are not the database's own.

### TLS errors

`self signed certificate in certificate chain` or `unable to verify the first
certificate` means verification is on — which is the default and correct — and
the CA is not one your system trusts.

Point the **CA certificate** field at the provider's bundle rather than turning
verification off. Each provider's file is named in [the recipes](/recipes/).

Turning verification off is possible, takes a deliberate acknowledgement, and
badges the connection **insecure TLS** for as long as it exists. That badge is
the point.

On SQL Server, TLS is two switches rather than one: encryption on, and whether
the server's certificate is trusted. A dev container with a self-signed
certificate needs the second one relaxed; a production server should need
neither.

### Authentication failed

- Check which secret Pitta is resolving. A profile using `{ "kind": "env" }`
  reads the environment of the **extension host** — under Remote-SSH that is the
  remote's environment, which is a different set of variables from your shell's.
- `.pgpass` is matched on host, port, database and user, all four. A wildcard
  line is `*`.
- PostgreSQL `scram-sha-256` against a role whose password was set before the
  server moved to SCRAM will fail until the password is set again.
- MongoDB: the `authSource` is not always the database you are opening. Atlas
  users usually authenticate against `admin`.

### SSH tunnel problems

- **Host key prompt on a machine that "already knows" the key.** `known_hosts`
  is read on the machine Pitta runs on. From a fresh remote or a rebuilt
  container, it has never seen the bastion.
- **Tunnel refused with a message about topology.** Deliberate. A Redis Cluster,
  a Redis Sentinel set, or a MongoDB SRV / seed-list connection discovers other
  node addresses after it connects, and a single forwarded port cannot serve
  addresses that only resolve on the bastion's side. Half-honouring the tunnel
  would connect to the seed and then bypass the tunnel for everything else. Use
  a VPN or a bastion-side proxy.
- **Agent authentication fails.** `SSH_AUTH_SOCK` has to be set in the extension
  host's environment. It usually is locally and usually is not inside a
  container.

## It connects, then something is wrong

### The tree is empty, or missing objects

- `pitta.explorer.showSystemObjects` is `false`, so `pg_catalog` and
  `information_schema` are hidden on purpose.
- The connected role may not have `USAGE` on the schema. Pitta shows what the
  catalog will admit to for that role.
- A level with more than `pitta.explorer.pageSize` objects ends in **Show
  more** — the rest are not missing, they are the next page.
- Stale after a migration someone else ran? **Refresh** on the node, or set
  `pitta.metadataCacheTtlSeconds` lower. DDL that Pitta itself runs invalidates
  the cache eagerly; DDL run elsewhere cannot.

### Editing is disabled on a table

The grid says why in that spot. It needs a way to name the row: a primary key, a
unique constraint, or an opt-in physical row id (`ctid`, `rowid`). A view or a
key-less table on an engine with no row-id support has none of the three.

### The row count looks wrong

`pitta.explorer.rowCountMode` defaults to `estimate`, which reads the catalog's
estimate and is free but stale between analyses. Set it to `exact` for a real
`COUNT(*)`, and expect a full scan.

### A number lost its trailing digits

It should not have. `numeric` and `int8` are strings and `bigint` end to end,
and an eslint rule fails the build on a `Number()` in that path. If you can
reproduce it, that is a **bug worth reporting** with the column type and the
value — it is the class of defect this project cares most about.

### A `NULL` and an empty cell look the same

They are not the same and should not render the same: `NULL` is a styled token.
On a schemaless engine a *missing* field is a third, distinct token. If two of
them render alike, report it.

### A query is slow that is fast elsewhere

- Compare with **Explain** rather than with a stopwatch. Pitta reads the plan
  from the server and flags the node worth looking at.
- The grid asks for one page. A client that takes eight seconds to return
  everything and a client that takes 200 ms to return the first 500 rows are not
  measuring the same thing.
- `pitta.query.streamResults` set to `false` reads up to
  `pitta.maxRowsInMemory` before showing anything.

### "Result truncated"

`pitta.maxRowsInMemory` was reached. That is a memory guard, not a limit on what
the server will give you: **export** the result instead, which streams to disk
and has no such ceiling.

## Statements and guards

### "Refused: UPDATE/DELETE without WHERE"

`pitta.query.blockUnqualifiedDml` is on, on every connection. Add a `WHERE`, or
turn it off knowingly.

### It asks me to type the connection name

The connection is tagged `prod` and the statement is classified destructive. That
confirmation is not configurable. If the classification looks wrong, the
statement text and the driver's classification are both in the debug log — a
false positive is worth reporting.

### A Redis command is refused outright

`KEYS` and `MONITOR` are refused rather than confirmed, because one blocks the
server and the other slows it for every client.
`pitta.redis.allowKeysCommand` and `pitta.redis.allowMonitor` exist; `MONITOR`
stays refused on production regardless.

### An unfamiliar command asks for confirmation on production

Unknown fails closed. A command Pitta cannot classify on a `prod` connection is
treated as destructive on purpose. If your engine publishes metadata that would
classify it, that is a driver improvement worth an issue.

## Language features

### No completion or diagnostics

- The file has to be bound to a connection — check the status bar, or add a
  `-- @pitta connection:` directive.
- `pitta.editor.completion` and `pitta.editor.diagnostics` may be off.
- Completion comes from the metadata cache; a schema created seconds ago appears
  after a refresh.
- On MongoDB, field suggestions come from a *sample* of documents and say so. A
  field only present in rare documents may not be sampled.

### The formatter did nothing

It runs on files bound to a Pitta connection. Formatting is per language, so a
`.redis` file formats by that driver's rules, not by SQL's.

## Reporting a bug

Include the Pitta version, VS Code version and OS, the engine and server
version, whether the window is local or remote, and the debug log around the
failure. The [bug template](https://github.com/shresthadeepesh/pitta-db/issues/new?template=bug_report.yml)
asks for exactly those.

For anything with a security impact, do **not** open a public issue — see
[SECURITY.md](https://github.com/shresthadeepesh/pitta-db/blob/main/SECURITY.md).
