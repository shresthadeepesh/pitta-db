# Google Cloud SQL

Three ways in, in increasing order of how much you have to set up.

## 1. The Cloud SQL Auth Proxy (recommended)

The proxy authenticates with your Google credentials, encrypts the connection
itself, and listens on a local port. Pitta then connects to what looks like a
plain local database.

```bash
cloud-sql-proxy --port 5432 my-project:europe-west1:orders
```

| Field | Value |
| --- | --- |
| Host | `localhost` |
| Port | `5432` |
| Database | your database |
| User | the Cloud SQL user |
| SSL mode | `disable` |
| Environment | whatever it really is — `prod` if the *instance* is production |

`disable` is right here: the proxy is doing the TLS, and the hop Pitta makes is
loopback. Do not confuse "the socket is plaintext" with "the connection is
plaintext"; the proxy's own connection to Cloud SQL is mutually authenticated
and encrypted.

::: warning Where does the proxy run?
On the machine VS Code's workspace is on. Under Remote-SSH, start the proxy on
the remote, not on your laptop — otherwise `localhost:5432` on the remote is
nothing at all. See [Remote development](/guide/remote).
:::

Tag the profile by the *instance's* environment. A proxy to production is
production, however local the port looks.

## 2. IAM database authentication through the proxy

Run the proxy with `--auto-iam-authn`, and use your IAM principal as the user —
for a service account, the email with `.gserviceaccount.com` stripped. The
password field is then unused; the proxy supplies the token.

## 3. A direct connection with a public IP

Only if the proxy is genuinely not an option. Authorize the connecting address
in the instance's authorized networks — under Remote-SSH that is the remote's
egress address — and download the server CA from the instance's **Connections →
Security** page.

| Field | Value |
| --- | --- |
| Host | the instance's public IP |
| Port | 5432 · MySQL 3306 · SQL Server 1433 |
| SSL mode | `verify-ca` |
| CA certificate | `~/.certs/cloudsql-server-ca.pem` |

`verify-ca` rather than `verify-full`: you are connecting to an IP address, and
full verification checks the hostname against the certificate. If the instance
requires client certificates, add the client certificate and key alongside.

Turning on **Require SSL** for the instance is worth doing regardless. It stops
a plaintext connection existing at all rather than relying on every client to
choose well.

## Private IP

If the instance has a private IP, connect from something in the same VPC — a VM
you attach to over Remote-SSH is the tidiest — or through
[an SSH bastion](./ssh).

## Things that look like bugs

- **`connection refused` on localhost.** The proxy is not running, or is running
  on a different machine from the one Pitta is on.
- **Proxy exits immediately.** Check its own output: usually credentials, or the
  Cloud SQL Admin API not being enabled on the project.
- **IAM user fails to authenticate.** The IAM user has to exist *in the
  instance* as a database user as well as in IAM. Both halves are needed.
