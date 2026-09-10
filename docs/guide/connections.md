# Connections

## Where a profile lives

A connection profile has two halves: the description, which is ordinary JSON,
and the secret, which is not.

| Part | Stored in | Safe to commit |
| --- | --- | --- |
| Personal profiles | VS Code global state | n/a — not a file you share |
| Shared profiles | `.vscode/pitta.connections.json` in the workspace | **yes** |
| Every password, passphrase and key password | OS keychain, via `vscode.SecretStorage` | never written to a file at all |

The shared file is validated against a published JSON Schema that **rejects a
literal string** in any password field. A profile that contains a password is
not accepted-with-a-warning; it is refused with an error naming the field. That
is what makes the file safe to commit: not a convention, a schema.

Add `$schema` for completion and inline validation as you edit it:

```json
{
  "$schema": "https://raw.githubusercontent.com/shresthadeepesh/pitta-db/main/packages/extension/schemas/pitta.connections.schema.json",
  "connections": [
    {
      "name": "orders-staging",
      "driver": "postgres",
      "environment": "staging",
      "connection": {
        "host": "db.staging.internal",
        "port": 5432,
        "database": "orders",
        "user": "app_ro",
        "password": { "kind": "keychain" }
      },
      "ssl": { "mode": "verify-full" },
      "readOnly": true
    }
  ]
}
```

Everyone on the team gets the connection; everyone supplies their own
credential.

## Supplying the secret

`password` is a **reference**, never a value. The kinds:

| Reference | What happens | Good for |
| --- | --- | --- |
| `{ "kind": "keychain" }` | Read from the OS keychain at connect time. Pitta prompts once and stores it. | The default. |
| `{ "kind": "env", "name": "PGPASSWORD" }` | Read from the environment of the extension host at connect time. | CI, dev containers, anything already injecting secrets. |
| `{ "kind": "pgpass" }` | Matched out of `~/.pgpass` by host, port, database and user. | An existing PostgreSQL setup you do not want to duplicate. |
| `{ "kind": "prompt" }` | Asked every time. Never persisted anywhere. | Break-glass production access. |

A PostgreSQL profile can also come from `pg_service.conf` — put the service name
in the connection and the rest resolves from the file.

Exporting or sharing a profile rewrites every secret reference to
`{ "kind": "prompt" }`, so the exported copy cannot carry one out even by
accident.

## Environments

`dev`, `staging` and `prod` change behaviour, not just colour:

| | dev | staging | prod |
| --- | :-: | :-: | :-: |
| Coloured in the tree and status bar | — | — | ✓ |
| Destructive statement needs the connection name typed | — | — | ✓ |
| Destructive statement asks for a plain confirmation | ✓ | ✓ | (typed instead) |
| Recorded in query history | ✓ | ✓ | — |
| An unclassifiable command is treated as destructive | — | — | ✓ |

`pitta.query.confirmDestructive` decides which environments confirm; the typed
confirmation on `prod` is not configurable away.

## Read-only connections

Tick **Read-only** on the profile and every write is refused — DML and DDL
alike, in query mode and in the grid.

Where the engine has a real read-only session, Pitta sets it *and* enforces
client-side. Where it does not, the badge says **client-side only**, because a
guarantee the server is not making must never be presented as one. In that case
the form recommends what actually enforces it: a read-only database user, or a
Redis ACL.

## TLS

For any non-loopback host the form defaults to full verification
(`verify-full` on PostgreSQL, and the equivalent on every other engine).
Downgrading is possible and deliberate: it takes an explicit per-connection
acknowledgement, and the connection is then badged **insecure TLS** everywhere
it appears, for as long as it exists.

If your provider needs a CA bundle — Amazon RDS, Google Cloud SQL and Azure all
do for full verification — point the **CA certificate** field at it. Each
provider's file is named in [the recipes](/recipes/).

## SSH tunnels

Every engine gets the same nine SSH fields, because they describe the bastion
rather than the database: host, port, user, and one of ssh-agent, a private key
with an optional passphrase, or a password. A jump host is supported.

Host keys are checked against `~/.ssh/known_hosts`. An unknown key prompts with
its fingerprint and waits for you. It is never auto-accepted, and a key that
does not match a known one stops the connection rather than warning about it.

::: warning Topologies that discover their own nodes
A single forwarded port cannot serve addresses that only resolve on the far side
of the bastion. So a tunnel is **refused**, with the reason, for Redis Cluster,
Redis Sentinel, and a MongoDB SRV or seed-list connection that will be told
about other hosts once it connects. Half-honouring the tunnel would connect to
the seed and then quietly bypass it for every node after that.

Use a VPN, or a bastion-side proxy, for those. [More detail](/recipes/ssh).
:::

## Binding a file to a connection

The status bar shows which connection an open query file runs against. Click it
to change, and the choice is remembered per file.

For a file that is committed and should always run somewhere specific, put a
directive at the top instead — it travels with the file and beats the status-bar
choice:

```sql
-- @pitta connection: orders-staging
-- @pitta database: analytics

select * from orders limit 10;
```

The directive is written in whichever comment syntax the file's language uses —
`--`, `#`, or `//`.

A notebook binds as a whole rather than per cell, so cells in one notebook
cannot silently run against different servers.

## Connection URIs

Paste a URI into the host field and it is parsed across the form. Each driver
parses its own, so `postgres://`, `mysql://`, `mongodb+srv://` and `redis://`
all work, including the query parameters that carry TLS options.

A password in a pasted URI is moved straight into the keychain and removed from
the field. It does not survive in the profile.
