# Security Policy

Pitta holds database credentials and runs statements against production
servers. Both of those make it worth attacking, and both are why the security
requirements are written down as testable statements in
[`docs/05-SECURITY.md`](docs/05-SECURITY.md) rather than as intentions.

## Reporting a vulnerability

**Do not open a public issue.**

Report privately through GitHub:
[**Report a vulnerability**](https://github.com/shresthadeepesh/pitta-db/security/advisories/new)
— repository → **Security** → **Advisories** → **Report a vulnerability**. This
opens a private advisory that only the maintainers can see, and it is the
preferred channel because a fix, a CVE, and a credit can all be handled in the
same place.

Please include:

- The version of Pitta (`Pitta: Show Logs` prints it) and of VS Code.
- Which engine and driver, if it is engine-specific.
- What an attacker gets — read a credential, run a statement the guards should
  have stopped, execute code in the extension host, and so on.
- Steps to reproduce, or a minimal profile/query that triggers it. A short
  reproduction is worth more than a long description.

**What to expect:** an acknowledgement within 3 working days, an assessment
within 10, and a fix released before the advisory is published. If we disagree
that something is a vulnerability we will say so and why, rather than letting
the report go quiet. Please give us 90 days before public disclosure, or less
if the issue is already being exploited — tell us and we will move.

This is a small project. There is no bug bounty. Credit in the advisory and the
changelog is offered unless you would rather stay anonymous.

## Supported versions

| Version | Supported |
| --- | --- |
| Latest release on the Marketplace / Open VSX | ✅ |
| Latest pre-release | ✅ |
| Anything older | ❌ — upgrade first |

Fixes ship in a new release rather than as patches to old ones. Pitta is
pre-1.0 and auto-updates through the Marketplace, so "upgrade" is the whole
remediation path.

## In scope

Anything that breaks one of the requirements in
[`docs/05-SECURITY.md`](docs/05-SECURITY.md). The ones most worth your time:

- **Credential exposure (S1).** A password reaching `settings.json`, a workspace
  file, `globalState`, a log line, a webview, an error report, or a crash dump.
  Any of these is a release blocker, not a bug.
- **Transport downgrade (S2).** TLS verification silently skipped, an SSH host
  key auto-accepted, a `known_hosts` mismatch that does not stop the connection.
- **Injection (S3).** A grid filter, cell edit, parameter prompt, or imported
  CSV value that reaches the server as statement text rather than as a bind
  parameter. On MongoDB specifically: anything in a `.mongodb.js` file that
  actually *executes* as JavaScript in the extension host — the file is parsed
  to an AST and converted to BSON and must never be evaluated (ADR-042).
- **Guard bypass (S4).** A destructive statement that skips the typed
  production confirmation, an unqualified `UPDATE`/`DELETE` that gets through
  `blockUnqualifiedDml`, a write on a `readOnly` connection, or a command whose
  classification can be manipulated by how it is written.
- **Webview escape (S5).** Cell content that executes — a value that becomes
  markup rather than a text node, a CSP bypass, an unvalidated `postMessage`
  crossing the host boundary.
- **Supply chain (S6).** A dependency with a `postinstall` script, or a bundled
  package that is not what the lockfile says it is.
- **Privacy (S7).** Anything that sends SQL text, schema names, hostnames, or
  row data off the machine. Pitta ships with no telemetry transport at all, so
  a network call carrying user data is a bug by construction.

## Out of scope

- What your database user can already do. Pitta does not add privileges; a
  `DROP TABLE` that succeeds because the connected role may drop tables is the
  role's problem, and the guards are a seatbelt rather than an authorization
  layer.
- Vulnerabilities in a database server, in VS Code itself, or in a driver's
  upstream client library — report those upstream. If Pitta's *use* of one is
  what makes it exploitable, that is in scope and worth reporting here.
- An attacker who already has code execution as your user. They have your
  keychain; nothing an extension does changes that.
- Missing hardening with no exploit path. Still welcome as a normal issue.
- Social engineering, physical access, and denial of service against your own
  server by running an expensive query.

## What Pitta does by default

Stated here so a report can point at the gap between this and reality:

- Credentials live only in the OS keychain via `vscode.SecretStorage`. The
  shareable connection file format is schema-validated to **reject** a literal
  password, so a committed profile cannot contain one.
- Non-loopback connections default to full TLS verification, and downgrading is
  a per-connection acknowledgement that badges the connection insecure.
- SSH host keys are checked against `~/.ssh/known_hosts` and an unknown key
  prompts with its fingerprint. Never auto-accepted.
- Every user-entered value is bound as a parameter. Only catalog identifiers are
  interpolated, and only through `quoteIdent()`.
- Webviews run under a strict nonce'd CSP with no remote loads, every message
  is `zod`-validated in both directions, and cell values are rendered as text
  nodes — there is no `innerHTML` in the codebase.
- No telemetry is collected or transmitted. Query history is local and excludes
  `prod` connections by default.

Each of those is covered by a test that lives with the code it guards —
`packages/core/test/guards.test.ts` and `redact.test.ts`,
`packages/extension/test/secrets.test.ts`, `packages/ssh/test/knownHosts.test.ts`,
each driver's `tls.test.ts`, and `packages/driver-mongodb/test/security.test.ts`.
If you find one that passes its test and is still wrong, the test is the bug and
we want to know.
