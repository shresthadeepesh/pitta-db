# Connection recipes

A working connection for the places people actually run databases, including the
setting each one gets wrong by default.

Two rules apply to all of them:

1. **Host names resolve on the machine VS Code's workspace is on.** Under
   Remote-SSH, WSL or a dev container that is not your laptop. Read
   [Remote development](/guide/remote) first if a connection that works
   elsewhere fails here.
2. **TLS verification is on by default and should stay on.** Most managed
   providers need their CA bundle pointed at, not verification turned off. Each
   recipe names the file.

| Recipe | Engines |
| --- | --- |
| [Docker and Compose](./docker) | all |
| [Amazon RDS and Aurora](./rds) | PostgreSQL, MySQL, SQL Server |
| [Google Cloud SQL](./cloud-sql) | PostgreSQL, MySQL, SQL Server |
| [Azure Database and Azure SQL](./azure) | PostgreSQL, MySQL, SQL Server |
| [Supabase](./supabase) | PostgreSQL |
| [Neon](./neon) | PostgreSQL |
| [Through an SSH bastion](./ssh) | all except SQLite |
| [MongoDB and Atlas](./mongodb) | MongoDB |
| [Redis, Sentinel and Cluster](./redis) | Redis |
| [SQLite](./sqlite) | SQLite |

## Sharing a connection with your team

Put the non-secret half in `.vscode/pitta.connections.json` and commit it.
Everyone gets the connection; everyone supplies their own credential, because
the file format is schema-validated to be **incapable** of holding one.

```json
{
  "$schema": "https://raw.githubusercontent.com/shresthadeepesh/pitta-db/main/packages/extension/schemas/pitta.connections.schema.json",
  "connections": [
    {
      "name": "orders-prod",
      "driver": "postgres",
      "environment": "prod",
      "readOnly": true,
      "connection": {
        "host": "orders.cluster-abc123.eu-west-1.rds.amazonaws.com",
        "port": 5432,
        "database": "orders",
        "user": "analyst",
        "password": { "kind": "keychain" }
      },
      "ssl": { "mode": "verify-full", "ca": "~/.certs/rds-eu-west-1-bundle.pem" }
    }
  ]
}
```

Tag production `prod` in the shared file. That is how everyone gets the typed
confirmation rather than only the person who remembered.

Paths in a profile are taken literally — there is no `${workspaceFolder}`
substitution — so a shared file should point at a path everyone has, such as one
under `~`, or each person can override the CA on their own copy.

More on the format: [Connections](/guide/connections).
