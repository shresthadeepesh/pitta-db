---
layout: home

hero:
  name: Pitta
  text: A database client that lives in VS Code
  tagline: Browse and edit your data in a grid, or write a query. Both are first-class, and you never leave the editor.
  image:
    src: /logo.png
    alt: Pitta
  actions:
    - theme: brand
      text: Get started
      link: /guide/getting-started
    - theme: alt
      text: Connection recipes
      link: /recipes/
    - theme: alt
      text: Write a driver
      link: /drivers/authoring

features:
  - title: Six engines, one client
    details: PostgreSQL, MySQL/MariaDB, SQL Server, SQLite, MongoDB and Redis run on the same core, the same grid and the same guards. A driver is only called supported once it passes the conformance kit against a real server.
  - title: Values stay exact
    details: numeric and int8 never pass through a JavaScript number — not on read, not on write, not on import. NULL and a missing field stay distinguishable all the way to the grid.
  - title: Safe to point at production
    details: Tag a connection prod and destructive statements need the connection name typed back. Unqualified UPDATE and DELETE are refused by default, and read-only means read-only.
  - title: Secrets in the keychain
    details: Passwords go to OS storage through VS Code's SecretStorage. The shareable connection file format cannot hold a password, so a committed profile is safe by construction.
  - title: Real streaming
    details: Rows arrive from a server-side cursor with backpressure, so a million-row table opens as fast as a small one and exports stream to disk instead of into memory.
  - title: Cancellation that cancels
    details: Cancel asks the server to stop — a PostgreSQL cancel request, a MongoDB killOp, a SQL Server attention packet — rather than abandoning the socket and leaving the query running.
---

## What is in here

**[Guide](/guide/getting-started)** — installing, connecting, the grid, query
mode, the safety guards, and what changes when VS Code is running against a
remote machine.

**[Recipes](/recipes/)** — a working connection for Docker, RDS, Cloud SQL,
Azure, Supabase, Neon, an SSH bastion, Atlas, Redis Cluster, and SQLite,
including the setting each provider gets wrong by default.

**[Writing a driver](/drivers/authoring)** — adding an engine is a new package
and no edit to core. CI enforces that, and this guide is what it enforces
against.

**[Design record](/00-OVERVIEW)** — the specification, the architecture, the
driver contract, the security requirements and every architecture decision,
published because a contributor needs the reasoning more than the summary.
