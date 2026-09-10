# Redis, Sentinel and Cluster

## Standalone

| Field | Value |
| --- | --- |
| Mode | `Standalone` |
| Host | `localhost`, port `6379` |
| Database | `0` — a numeric index, not a name |
| Username | leave empty, or `default` on Redis 6+ with ACLs |
| Password | the ACL password, or the `requirepass` value |
| TLS | off locally; `verify-full` for anything managed |

## Sentinel

| Field | Value |
| --- | --- |
| Mode | `Sentinel` |
| Nodes | the **sentinel** addresses as `host:port`, one per entry |
| Master name | `mymaster`, or whatever your sentinels call it |
| Database | the numeric index |

The client asks a sentinel where the master is and connects to the answer, so
the addresses the sentinels return must be reachable from the machine Pitta is
on.

## Cluster

| Field | Value |
| --- | --- |
| Mode | `Cluster` |
| Nodes | seed nodes as `host:port` — any two or three, the rest are discovered |
| Database | not shown: cluster mode has only database 0 |

Pitta handles the cluster shape rather than hiding it: a command that would span
slots is split per node where that is meaningful and **refused with the fix**
where it is not. `DBSIZE` and the keyspace scan run across the nodes.

## Managed Redis

| Provider | Notes |
| --- | --- |
| ElastiCache | In-VPC. Connect from a VM over Remote-SSH. Cluster mode enabled → `Cluster`. In-transit encryption on → TLS `verify-full`. |
| Azure Cache for Redis | Port **6380** for TLS; 6379 is non-TLS and usually disabled. Password is the access key. |
| Redis Cloud | Host and port from the console, TLS on, `default` user unless you made an ACL. |
| Upstash | TLS required. The REST API is a different product — use the Redis protocol endpoint. |

## Tunnels

::: warning Sentinel and Cluster refuse an SSH tunnel
Both discover node addresses after connecting, and those addresses only resolve
on the bastion's side. One forwarded port cannot serve them. **Standalone**
tunnels normally.

Use a VPN, or attach VS Code to a machine inside the network.
See [the SSH recipe](./ssh).
:::

## Browsing a large keyspace

The tree is built with `SCAN` in bounded pages, never `KEYS`, and prefix folders
come from a sample rather than from a full enumeration. Pointing Pitta at a
million-key instance is not supposed to be something the server notices — the
project's own acceptance test for this checks `SLOWLOG` and `INFO commandstats`
afterwards.

`keySeparator` (default `:`) decides how keys fold into folders. `scanCount`
tunes how much each `SCAN` asks for.

Keys are deliberately **not** offered in completion. A keyspace cannot be listed
cheaply, which is the same reason the tree pages.

## Values and TTL

Each type opens in the view it deserves: string, hash, list, set, sorted set,
stream with its consumer groups, and RedisJSON documents where the module is
loaded.

**TTL is a first-class, editable field.** **Pitta: Set Expiry…** sets or clears
it, and clearing is `PERSIST` rather than an expiry of zero.

## Guards

The command list and its flags come from the connected server's own
`COMMAND INFO` / `COMMAND DOCS`, so a module command this build has never heard
of is still classified, still completes and still hovers.

- **`KEYS` is refused**, not confirmed: it walks the entire keyspace and blocks
  the server while it does. `pitta.redis.allowKeysCommand` exists if you insist.
- **`MONITOR` is refused** by default and always on production: it makes the
  server report every command it runs to this client and measurably slows it for
  everyone. When allowed, it time-boxes itself
  (`pitta.redis.monitorSeconds`, default 10).
- `FLUSHALL`, `FLUSHDB`, `SWAPDB`, `CONFIG SET`, `SHUTDOWN`, `MIGRATE`,
  `REPLICAOF`, `CLUSTER RESET`, `ACL SETUSER` and `EVAL` need the typed
  confirmation on a `prod` connection.
- An **unknown** command on production is treated as destructive. Unknown fails
  closed.
- Edits are previewed as a command list and applied in `MULTI`/`EXEC` where the
  slots allow. Where they do not, the dialog says there is no rollback, in those
  words.
- `readOnly` is enforced in the client and the badge says **client-side only**.
  The server-side equivalent is an ACL: `ACL SETUSER pitta on >pw ~* +@read`.

## Pub/Sub

**Pitta: Subscribe to Channels** streams messages into a panel, including
keyspace notifications. The keyspace patterns are offered only when
`notify-keyspace-events` is actually configured to emit them, rather than listed
and silently empty.
