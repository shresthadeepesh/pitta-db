# Azure Database and Azure SQL

## Azure Database for PostgreSQL (Flexible Server)

| Field | Value |
| --- | --- |
| Host | `orders.postgres.database.azure.com` |
| Port | `5432` |
| Database | your database |
| User | `analyst` — Flexible Server takes the plain user name. The old `user@servername` form is Single Server, which is retired |
| SSL mode | `verify-full` |
| CA certificate | usually unnecessary — Azure's certificates chain to the DigiCert roots your system already trusts |

Add the connecting address to the server's firewall rules. Under Remote-SSH that
is the remote's egress address.

A **private access** (VNet-integrated) server is not reachable from outside the
VNet at all: connect from a VM in the VNet over Remote-SSH, or through
[a bastion](./ssh).

## Azure Database for MySQL

The same, on port 3306, with the MySQL driver. Flexible Server likewise takes
the plain user name.

## Azure SQL Database and Managed Instance

| Field | Value |
| --- | --- |
| Host | `orders.database.windows.net` |
| Port | `1433` |
| Database | the database name — Azure SQL has no cross-database queries, so this one matters |
| User | `analyst` |
| Encrypt | **on** |
| Trust server certificate | **off** |

### The two TLS switches

SQL Server does not have one TLS setting, it has two, and they are frequently
set to the wrong pair:

- **Encrypt** — whether the connection is encrypted at all.
- **Trust server certificate** — whether to skip verifying the certificate.

`Encrypt on` + `Trust off` is verified encryption, and is what Azure SQL should
always use. `Encrypt on` + `Trust on` is encrypted but unauthenticated: it is
what a local dev container with a self-signed certificate needs, and it is never
what a production server needs. Pitta badges a connection with `Trust on` as
insecure TLS, on purpose.

### Entra ID (Azure AD) authentication

Access tokens expire, so store nothing: use `{ "kind": "prompt" }` and paste a
fresh one.

```bash
az account get-access-token --resource https://database.windows.net/ --query accessToken -o tsv
```

### Serverless tiers pause

A serverless Azure SQL database that has auto-paused takes 30–60 seconds to
resume, and the first connection attempt usually times out before it does. Raise
the profile's connect timeout, or connect twice.

### Managed Instance

Same shape, but the endpoint is private and often on port 3342 for the public
endpoint. Connect from inside the VNet, or through
[a bastion](./ssh).

## Things that look like bugs

- **`Cannot open server … requested by the login`.** The firewall rule, not the
  password. Azure returns a login error for a blocked address.
- **`The certificate chain was issued by an authority that is not trusted`.**
  Trust server certificate is off — correct — and something is intercepting TLS,
  or you are connecting to a local server with a self-signed certificate rather
  than to Azure.
- **Login works in SSMS, fails in Pitta.** SSMS defaults to trusting the server
  certificate. Pitta does not. That is the difference, and SSMS's default is the
  wrong one.
