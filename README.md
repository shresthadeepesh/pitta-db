# Pitta — Database Client

A database client that lives in VS Code. Browse and edit data in a grid, or
write SQL with real completion and diagnostics.

PostgreSQL, MySQL/MariaDB, SQL Server, SQLite, MongoDB, and Redis.

**[Install from the Marketplace](https://marketplace.visualstudio.com/items?itemName=DipeshShrestha.pitta-db)**
· **[Documentation](https://shresthadeepesh.github.io/pitta-db/)**

---

## This repository

This is where Pitta is discussed and documented. The extension's source is
developed privately; what lives here is everything you need as a user:

- **[Issues](https://github.com/shresthadeepesh/pitta-db/issues)** — bugs,
  feature requests, and requests for an engine Pitta does not speak yet.
- **[Discussions](https://github.com/shresthadeepesh/pitta-db/discussions)** —
  questions, and anything not yet a concrete report.
- **[docs/](docs/)** — the guide, a connection recipe per hosting provider, the
  driver contract, the security requirements, and the design record. Rendered
  at [shresthadeepesh.github.io/pitta-db](https://shresthadeepesh.github.io/pitta-db/).

Security problems go through
[private reporting](https://github.com/shresthadeepesh/pitta-db/security/advisories/new),
never a public issue. See [SECURITY.md](SECURITY.md).

## Reporting a bug well

Pitta's output channel (**View → Output → Pitta**) is redacted — no passwords,
no row values — and pasting it into an issue is usually the difference between
a fix and a conversation. A screenshot is not redacted, so check one before
attaching it.

Say which engine and which server version, and whether the connection went
through an SSH tunnel or Remote-SSH: most of what looks engine-specific turns
out to be about how the connection was made.
