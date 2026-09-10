# Through an SSH bastion

Pitta opens the tunnel itself. You do not need a separate `ssh -L` running, and
you should not point the profile at a port you forwarded by hand — Pitta's
tunnel is lifecycle-managed with the connection and closes with it.

## Before you reach for it

If VS Code is **already attached to the bastion** over Remote-SSH, you do not
need a tunnel. Pitta is running on the bastion, so the database's private
hostname resolves directly. Adding a tunnel there would open a second SSH
connection from the bastion to somewhere else.

The tunnel is for the case where the machine VS Code is on can reach the
*bastion* but not the database.

## The fields

Nine of them, identical for every engine, because they describe the bastion
rather than the database.

| Field | Value |
| --- | --- |
| Use SSH tunnel | on |
| SSH host | `bastion.example.com` |
| SSH port | `22` |
| SSH user | `ubuntu` |
| SSH auth | `ssh-agent`, `Private key`, or `Password` |
| Private key | path, for the key option |
| Key passphrase | goes to the keychain |

And the database fields are then filled in **as the bastion sees them**:

| Field | Value |
| --- | --- |
| Host | `orders.internal` — resolved on the bastion |
| Port | `5432` — the database's real port |

Not `localhost`, and not a local forwarded port. Pitta forwards to
`host:port` from the bastion's side.

## Host keys

The bastion's key is verified against `~/.ssh/known_hosts` **on the machine
Pitta is running on**. An unknown key prompts with its fingerprint and waits.
It is never auto-accepted, and a key that does not match a known one stops the
connection rather than warning about it.

From a fresh remote or a rebuilt container this means a prompt for a key your
laptop has known for years. That is correct: it is a different machine's trust
store.

## ssh-agent

The agent option needs `SSH_AUTH_SOCK` set in the **extension host's**
environment. Locally that is usually inherited. Inside a container it usually is
not, unless you forwarded the agent in.

Remote-SSH forwards your agent to the remote if `ForwardAgent yes` is set for
that host, which makes the agent option work from a remote window too.

## Jump hosts

A jump host is supported: the tunnel is established through it to the bastion,
and from there to the database. Configure it on the profile rather than in
`~/.ssh/config` — Pitta uses its own SSH implementation and does not read the
`ProxyJump` directives in that file.

## Topologies that refuse a tunnel

::: warning This is deliberate, not a limitation to work around
A tunnel is **refused**, with the reason, for:

- **Redis Cluster** — the client is told about every node and connects to all of
  them.
- **Redis Sentinel** — the client is told the master's address by the sentinel
  and connects to it.
- **MongoDB with an SRV URI or a seed list** — the driver discovers the replica
  set members and connects to them.

In each case the addresses the client is handed only resolve on the bastion's
side of the tunnel. One forwarded port cannot serve them. Honouring the tunnel
for the seed and then bypassing it for every node after that would look like it
worked and would not be.

Use a VPN, a bastion-side proxy, or attach VS Code to a machine inside the
network with Remote-SSH.
:::

A **standalone** MongoDB and a **standalone** Redis both tunnel normally; it is
the self-discovering topologies that cannot.

## Things that look like bugs

- **`All configured authentication methods failed`** with the agent option:
  `SSH_AUTH_SOCK` is not visible to the extension host.
- **Connects, then the database times out.** The tunnel is up and the database
  host or port is wrong *as seen from the bastion*. Check it with
  `ssh bastion 'nc -z orders.internal 5432'`.
- **Works from the terminal, not from Pitta.** Your terminal is reading
  `~/.ssh/config`; Pitta is not. Put the host, port, user and key on the profile
  explicitly.
