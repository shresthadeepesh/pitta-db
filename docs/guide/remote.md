# Remote-SSH, WSL and dev containers

::: danger Read this before debugging a connection
**Pitta connects from the machine VS Code's workspace is on, not from your
laptop.** Over Remote-SSH that is the remote host. In WSL it is the Linux
distribution. In a dev container or a Codespace it is the container.

`localhost` therefore means *that* machine. This is the single most common
reason a connection that works in `psql` fails in Pitta, and it is not a bug.
:::

## Why

Pitta declares `"extensionKind": ["workspace"]`, so VS Code installs and runs it
on the remote side (ADR-003). That is deliberate and is almost always what you
want:

- The database is usually reachable from the remote and not from your laptop —
  a private subnet, a VPC, a container network.
- Saved queries, notebooks and SQLite files are in the workspace, which is also
  on the remote.
- Nothing has to be tunnelled twice.

It has one consequence you have to hold in your head: **every host name in a
profile is resolved on the remote.**

## Install it on the remote

An extension with `extensionKind: workspace` is not shared from your local
install. In the Extensions view, a remote window shows a **Install in
SSH: hostname** / **Install in WSL** / **Install in Dev Container** button.
Press it. The connections you added locally are in *local* global state and do
not travel; the workspace file `.vscode/pitta.connections.json` does, because it
is part of the workspace.

## The translation table

| You want to reach | Local VS Code | Remote-SSH window | WSL window | Dev container |
| --- | --- | --- | --- | --- |
| A database on your laptop | `localhost` | the laptop is not reachable by name — forward a port, or use a VPN | `host.docker.internal`, or the Windows host IP from `/etc/resolv.conf` | `host.docker.internal` |
| A database on the remote host | forward a port, or use Pitta's SSH tunnel | `localhost` | n/a | n/a |
| A database in a sibling Compose service | `localhost:<published port>` | `localhost:<published port>` | `localhost:<published port>` | **the service name**, e.g. `postgres:5432` |
| A managed database in the same VPC as the remote | not reachable | its private hostname | n/a | its private hostname |

## Remote-SSH

If VS Code is already on the machine that can reach the database, use a plain
connection with the database's own hostname. You do **not** also need Pitta's
SSH tunnel — that would open a second SSH connection from the remote to
somewhere else.

Pitta's SSH tunnel is for the case where the database sits behind a *further*
bastion that the workspace machine can reach but not connect through directly.
See [the SSH recipe](/recipes/ssh).

`~/.ssh/known_hosts` is read on the machine Pitta runs on — the remote — so the
first tunnel from a fresh remote prompts you to accept a fingerprint even though
your laptop has known that key for years.

## WSL

A database running in the WSL distribution is `localhost`. A database running on
the Windows host is not: use `host.docker.internal` if Docker Desktop's WSL
integration is on, or read the host address out of `/etc/resolv.conf`.

A Windows-side SQL Server also has to be listening on TCP and permitting the
connection through the Windows firewall. Named-pipe and shared-memory protocols
do not cross into WSL.

## Dev containers and Compose

Inside a dev container, a database defined as another service in the same
Compose file is reachable **by service name on its internal port** — `postgres:5432`,
not `localhost:5433`. The published port mapping is for the host, and the
container is not the host.

`host.docker.internal` reaches the machine running Docker, which is how you get
back out to something on your laptop. On Linux it needs an explicit
`extra_hosts: ["host.docker.internal:host-gateway"]`.

Add Pitta to `devcontainer.json` so a rebuilt container comes back with it:

```json
{
  "customizations": {
    "vscode": {
      "extensions": ["DipeshShrestha.pitta-db"]
    }
  }
}
```

Full working example in [the Docker recipe](/recipes/docker).

## GitHub Codespaces

The same rules as a dev container, plus: the Codespace is in GitHub's network.
A database behind your company VPN is not reachable from it, and a managed
database's firewall will not have the Codespace's egress address on its
allowlist. Either connect through a bastion you have allowed, or use a local
window for that connection.

## vscode.dev and github.dev

Pitta does not run there. There is no Node extension host in the browser, and a
database client in a browser tab would need a WebSocket proxy you run
yourself — a different product (ADR-003). The extension declares limited virtual
workspace support so VS Code says so rather than half-loading.

## Working out where you actually are

VS Code's own status bar, bottom left, names the window's remote —
`SSH: hostname`, `WSL: Ubuntu`, `Dev Container: …`, or nothing at all when the
window is local. That is the machine your connections are made from.

To confirm what Pitta actually tried, run **Pitta: Show Logs** with
`pitta.logLevel` set to `debug`: each connection attempt logs its host and port,
credentials redacted. If that says `localhost` and you meant your laptop, this
page is the answer.
