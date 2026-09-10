# MongoDB and Atlas

## Atlas

Atlas hands you an SRV URI. Paste it into the host field and Pitta fills the
form from it.

| Field | Value |
| --- | --- |
| Scheme | `mongodb+srv:// (Atlas)` |
| Host | `cluster0.abcde.mongodb.net` — no port; SRV resolves the host list from DNS |
| Database | the database to open, e.g. `orders` |
| Username | the database user, not your Atlas account |
| Auth source | `admin` — the usual answer for an Atlas user, and the setting that most often causes "authentication failed" |
| TLS | on, implied by SRV |
| Environment | `prod` if it is |

Add your address to the project's **Network Access** list. Under Remote-SSH,
that is the remote's egress address, not your laptop's.

An SRV URI implies TLS and cannot be tunnelled — see below.

## A replica set by seed list

| Field | Value |
| --- | --- |
| Scheme | `mongodb://` |
| Host + Port | the first member |
| Additional hosts | the others, as `host:port` |
| Replica set | `rs0` |
| Read preference | `primary` for editing; `secondaryPreferred` for a reporting profile |

Pitta probes the topology at connect and refines the session's capabilities from
what it finds. A **standalone** server has no transactions, so the grid's apply
dialog says the batch cannot be rolled back and reports which edits landed,
rather than promising an atomicity that deployment does not provide.

## A single local container

| Field | Value |
| --- | --- |
| Scheme | `mongodb://` |
| Host | `localhost`, port `27017` |
| Database | `test` |
| TLS | off |
| Direct connection | on, if the container advertises a hostname you cannot resolve |

**Direct connection** tells the driver to talk to exactly this host and not to
follow the topology it is told about. It is the fix for a containerised replica
set that advertises internal names.

## Authentication mechanisms

SCRAM is the default and needs nothing said. x509 uses the client certificate
and key from the TLS section, with no username. AWS IAM authentication is
supported for Atlas.

Kerberos and LDAP are **not** available: they need native modules, and Pitta
ships one platform-neutral VSIX rather than a build per platform. The same
choice excludes client-side field-level encryption.

## Tunnels

::: warning An SRV or seed-list connection refuses an SSH tunnel
The driver discovers the other members after it connects, and those addresses
only resolve on the bastion's side. One forwarded port cannot serve them, and
honouring the tunnel for the seed and then bypassing it for the rest would look
like it worked. A **standalone** server tunnels normally.

Use a VPN, or attach VS Code to a machine inside the network.
See [the SSH recipe](./ssh).
:::

## What you will see

**Fields are inferred from a sample.** A collection has no declared schema, so
the tree, the grid's columns and the completion index all come from sampling
documents — the sample size is on the profile. Every suggestion says where it
came from. A field present only in rare documents may not appear until you widen
the sample.

**Missing is not null.** A document that lacks a field shows a distinct token,
not `NULL`, and clearing a cell asks which you meant: set it to null, or
`$unset` it.

**Types stay exact.** `Decimal128` is a string end to end, `Int64` is a
`bigint`, and an `ObjectId` exports as an `ObjectId` rather than as `{}`.

**Sampling reads your data.** The inference and the completion index read real
documents. Both stay in the extension host and obey the metadata cache TTL, and
neither is sent anywhere.

## Guards worth knowing

- `deleteMany({})` and `updateMany({})` are treated as DML with no `WHERE` and
  are blocked by `pitta.query.blockUnqualifiedDml`.
- An aggregation containing `$out` or `$merge` is classified as a write, found by
  walking the pipeline rather than by trusting the method name.
- `.mongodb.js` files are **parsed, never evaluated**. No `eval`, no `vm`, no
  `new Function`.
- Server-side JavaScript — `$where`, `$function`, `$accumulator`, `mapReduce` —
  is refused unless explicitly enabled and is always an admin operation.
- `readOnly` on a MongoDB profile is **client-side only** and says so. The
  server-side equivalent is a user granted only `read`.

## Things that look like bugs

- **Authentication failed with the right password.** Auth source. Atlas users
  authenticate against `admin`, not against the database you are opening.
- **`getaddrinfo ENOTFOUND` on an SRV host.** SRV needs DNS `SRV` and `TXT`
  lookups, which some corporate resolvers and some container DNS setups drop.
- **Connects, then times out on every operation.** The seed resolved but the
  advertised member hostnames did not. Turn **Direct connection** on, or fix the
  advertised names.
