# Docker and Compose

## A local container

Started with a published port:

```bash
docker run --name pg -e POSTGRES_PASSWORD=secret -p 5432:5432 -d postgres:17
```

| Field | Value |
| --- | --- |
| Host | `localhost` |
| Port | `5432` — the **published** (left-hand) port |
| Database | `postgres` |
| User | `postgres` |
| SSL mode | `disable` — a loopback container has no certificate, and Pitta does not insist on one for loopback |
| Environment | `dev` |

If you published on a different host port (`-p 5433:5432`), that is the port
Pitta wants. The right-hand number is inside the container and means nothing
from outside it.

## Compose, from the host

```yaml
services:
  db:
    image: postgres:17
    environment: { POSTGRES_PASSWORD: secret }
    ports: ['5432:5432']
```

`localhost:5432`, as above. Two projects both publishing 5432 will collide;
publish one on 5433 and connect to that.

## Compose, from inside a dev container

This is the one that catches people. If VS Code is attached to a container in
the same Compose project, the database is reachable **by service name on its
internal port**:

| Field | Value |
| --- | --- |
| Host | `db` — the service name |
| Port | `5432` — the **container's own** port, not the published one |

The published mapping exists for the host. Your dev container is not the host;
it is a peer on the Compose network.

A complete setup:

```yaml
# .devcontainer/docker-compose.yml
services:
  app:
    image: mcr.microsoft.com/devcontainers/typescript-node:22
    volumes: ['..:/workspace:cached']
    command: sleep infinity
    depends_on: [db]

  db:
    image: postgres:17
    environment:
      POSTGRES_PASSWORD: secret
      POSTGRES_DB: app
    volumes: ['pgdata:/var/lib/postgresql/data']

volumes:
  pgdata:
```

```json
// .devcontainer/devcontainer.json
{
  "name": "app",
  "dockerComposeFile": "docker-compose.yml",
  "service": "app",
  "workspaceFolder": "/workspace",
  "customizations": {
    "vscode": {
      "extensions": ["DipeshShrestha.pitta-db"]
    }
  }
}
```

```json
// .vscode/pitta.connections.json — committed, no secret in it
{
  "$schema": "https://raw.githubusercontent.com/shresthadeepesh/pitta-db/main/packages/extension/schemas/pitta.connections.schema.json",
  "connections": [
    {
      "name": "app (dev container)",
      "driver": "postgres",
      "environment": "dev",
      "connection": {
        "host": "db",
        "port": 5432,
        "database": "app",
        "user": "postgres",
        "password": { "kind": "env", "name": "POSTGRES_PASSWORD" }
      },
      "ssl": { "mode": "disable" }
    }
  ]
}
```

The `env` secret reference reads the extension host's environment — which inside
a dev container is the container's, so Compose has already supplied it and
nobody has to type a password at all.

## Reaching your laptop from inside a container

`host.docker.internal`. On Docker Desktop it works out of the box; on Linux add:

```yaml
extra_hosts: ['host.docker.internal:host-gateway']
```

## Other engines, same shape

| Engine | Image | Port | Notes |
| --- | --- | --- | --- |
| MySQL | `mysql:8` | 3306 | `MYSQL_ROOT_PASSWORD` |
| MariaDB | `mariadb:11` | 3306 | |
| SQL Server | `mcr.microsoft.com/mssql/server:2022-latest` | 1433 | `ACCEPT_EULA=Y`, `MSSQL_SA_PASSWORD`. Self-signed certificate: encryption on, **trust the server certificate** — see [Azure SQL](./azure) for what those two switches mean. |
| MongoDB | `mongo:7` | 27017 | A single container is standalone, so there are no transactions and the grid's apply dialog will say so. Add `--replSet` for a one-node replica set if you want them. |
| Redis | `redis:7` | 6379 | Mode `standalone`. |

This repository's own `docker-compose.test.yml` runs all of them, seeded, if you
want something to point Pitta at while reading these docs:

```bash
pnpm run db:up
```
