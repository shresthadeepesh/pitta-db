# Neon

| Field | Value |
| --- | --- |
| Host | `ep-cool-name-123456.eu-central-1.aws.neon.tech` |
| Port | `5432` |
| Database | `neondb`, or your own |
| User | `neondb_owner`, or your own |
| Password | from the Neon console |
| SSL mode | `verify-full` — Neon **requires** TLS and will refuse a plaintext connection |
| Environment | by branch: `prod` for main, `dev` for a development branch |

The connection string in the console is a URI; paste it into the host field and
Pitta splits it across the form, moving the password straight into the keychain.

## Branches are separate connections

Each Neon branch has its own endpoint host. Make one profile per branch you work
with, and tag them differently — that is what makes the production branch turn
red and ask for a typed confirmation while a dev branch does not.

## Pooled versus direct endpoints

Neon's pooled endpoint has `-pooler` in the host name and is PgBouncer in
transaction mode. It does not support prepared statements, session state or
cursors, and Pitta pages the grid with a cursor.

**Use the direct (non-pooled) endpoint.** The pooled one is for your
application's connection storm, not for an interactive client.

## Scale-to-zero

A Neon compute that has scaled to zero takes a few hundred milliseconds to a few
seconds to wake. The first query after an idle period is slow and occasionally
times out; raise the profile's connect timeout if it bites.

Pitta holds a pool open while a connection is open, which keeps the compute
awake and consumes compute time. Disconnect the profile when you are done, if
that matters to your bill.

## `endpoint` in options

If you are connecting through a host name that does not carry the endpoint ID —
some proxies, some older setups — Neon needs the endpoint passed as an option
instead. Put it in the profile's connection options as
`endpoint=ep-cool-name-123456`. With the normal endpoint host name this is not
needed.
