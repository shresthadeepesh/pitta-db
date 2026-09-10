# Amazon RDS and Aurora

Works for RDS and Aurora PostgreSQL, MySQL and SQL Server. The differences are
the port and the driver.

## Reachability first

An RDS instance is in a VPC. It is reachable from something inside that VPC, or
from an address you have allowed into its security group. So before anything
else, decide which machine is connecting:

- **A VPC bastion**, with VS Code attached over Remote-SSH. Pitta then runs on
  the bastion, the endpoint resolves privately, and no tunnel is needed. This is
  the simplest arrangement and the one to reach for.
- **Your laptop, through a bastion**, using [Pitta's SSH tunnel](./ssh).
- **A publicly accessible instance**, with your address in the security group.
  Fine for a scratch database; think twice for anything else.

Under Remote-SSH the address in the security group must be the **remote's**
egress address, not your laptop's.

## TLS

RDS presents a certificate signed by an Amazon CA that your system does not
trust by default. Do not turn verification off; point at the bundle.

```bash
curl -o ~/.certs/rds-global-bundle.pem \
  https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem
```

There are per-region bundles too; the global one covers every region and is
simpler to distribute.

## The profile

| Field | Value |
| --- | --- |
| Host | `orders.abc123.eu-west-1.rds.amazonaws.com` — the writer endpoint, or the reader endpoint for a read-only profile |
| Port | 5432 · MySQL 3306 · SQL Server 1433 |
| Database | your database name — **not** `postgres` on Aurora unless that is really it |
| User | the master user, or better, a scoped one |
| SSL mode | `verify-full` |
| CA certificate | `~/.certs/rds-global-bundle.pem` |
| Environment | `prod`, if it is |
| Read-only | tick it for a reader-endpoint profile |

`verify-full` also checks the hostname, so connect through the endpoint name
rather than through an IP address.

## Aurora reader endpoints

Make two profiles: the cluster (writer) endpoint tagged `prod`, and the reader
endpoint tagged `prod` **and** marked read-only. The reader profile then refuses
writes in Pitta as well as at the server, and the tree shows plainly which one
you are in.

## IAM authentication

RDS IAM tokens are generated per connection and expire after 15 minutes, so they
cannot be stored. Use `{ "kind": "prompt" }` and paste a freshly generated token:

```bash
aws rds generate-db-auth-token \
  --hostname orders.abc123.eu-west-1.rds.amazonaws.com \
  --port 5432 --region eu-west-1 --username analyst
```

The token is used as the password. TLS is mandatory for IAM authentication,
which `verify-full` already satisfies.

## RDS Proxy

Connect to the proxy's endpoint on the database's usual port, with the proxy's
own certificate chain — the same Amazon bundle covers it. The proxy multiplexes
connections, so session-scoped state (temporary tables, `SET` that outlives a
statement, advisory locks) may not be pinned to your session. Prefer the
instance endpoint for interactive work and leave the proxy to your application.

## Things that look like bugs

- **Timeout with no error.** Almost always the security group. A rejected TCP
  connection times out rather than refusing.
- **`no pg_hba.conf entry … SSL off`.** The instance requires TLS
  (`rds.force_ssl`) and the profile has it disabled.
- **Certificate verification fails after years of working.** Amazon rotates its
  CAs; re-download the bundle.
