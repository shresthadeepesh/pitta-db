# 05 — Security & Safety Requirements

These are hard requirements, not aspirations. Each maps to a test that lives
with the code it guards - `packages/core/test/guards.test.ts` and
`redact.test.ts`, `packages/extension/test/secrets.test.ts`,
`packages/ssh/test/knownHosts.test.ts`, each driver's `tls.test.ts`, and
`packages/driver-mongodb/test/security.test.ts`.

## S1. Secrets
- **S1.1** Credentials are stored *only* via `vscode.SecretStorage` (OS keychain). Writing a credential to `settings.json`, any workspace file, `globalState`, or a log is a release blocker.
- **S1.2** `.vscode/pitta.connections.json` is validated against a JSON Schema that **rejects a literal string** in any password/passphrase field. Offending files are refused with a clear error, not silently accepted.
- **S1.3** Webviews never receive credentials. The connection form posts a draft with a `SecretRef` placeholder; resolution and testing happen in the extension host.
- **S1.4** `ResolvedProfile` is never `JSON.stringify`-ed into logs, telemetry, or error reports. Logger has a redaction pass keyed on known secret field names *and* on the resolved values themselves.
- **S1.5** Export/share of a profile strips all secrets and emits `{ kind: 'prompt' }` refs.

## S2. Transport
- **S2.1** For any non-loopback host the connection form defaults to `sslmode=verify-full` and warns visibly if the user downgrades.
- **S2.2** `rejectUnauthorized: false` requires an explicit per-connection acknowledgement, and the connection is badged "insecure TLS" in the tree.
- **S2.3** SSH host keys are verified against `~/.ssh/known_hosts`; an unknown key prompts with the fingerprint. Never auto-accept.

## S3. Injection surface
- **S3.1** Every value the user types into a grid filter, cell editor, or parameter prompt goes out as a **bind parameter**. String interpolation of user values into SQL is banned; enforced by an eslint rule against template literals in `buildSelect`/`buildDml` paths.
- **S3.2** Identifiers (table/column names from the catalog) are the only interpolated fragments, and only through `quoteIdent()`, which escapes embedded quotes.
- **S3.3 [MM]** The rule is engine-independent, and stronger on the engines that
  do not use text at all: MongoDB filters and updates are built as BSON values
  from typed input, and Redis commands are argv arrays. There is no formatting
  step for user input to escape from, and the eslint rule extends to
  `buildSelect`/`buildEdits` in every driver.
- **S3.4 [MM]** MongoDB query text is parsed to an AST and converted to BSON. It
  is never executed as JavaScript — no `eval`, no `vm`, no `new Function` — so a
  snippet pasted from a ticket cannot reach the extension host, the file system,
  or the user's other credentials (ADR-042). Server-side JavaScript (`$where`,
  `$function`, `$accumulator`, `mapReduce`) is refused unless explicitly enabled
  and is always classified as an admin operation.

## S4. Destructive-operation guards
- **S4.1** `DROP`, `TRUNCATE`, `ALTER … DROP`, and `DELETE`/`UPDATE` without a `WHERE` clause are classified as destructive by the statement analyzer (real parse, not regex).
- **S4.2** On a `prod`-tagged connection, destructive statements need a typed confirmation (type the connection name). On dev, a single confirm, configurable to off.
- **S4.3** `pitta.query.blockUnqualifiedDml` (default true) refuses unqualified `UPDATE`/`DELETE` outright on any connection.
- **S4.4** `readOnly` profiles enforce read-only **both** server-side (`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`) and client-side.
- **S4.5** Row edits verify affected-row counts and roll back on mismatch (see 04 §6).
- **S4.6 [MM]** Classification is the driver's, from the engine's own metadata
  where it publishes any — Redis `COMMAND INFO` flags, MongoDB's operation verb
  plus an empty-filter test — combined with the shared heuristic by ADR-027's
  rule: destructive if either says so, and neither can downgrade the other.
- **S4.7 [MM]** An **unclassifiable** command on a `prod`-tagged connection is
  treated as destructive and needs the typed confirmation. Unknown fails closed
  where there is no trustworthy heuristic to fall back to (ADR-040).
- **S4.8 [MM]** `deleteMany({})` / `updateMany({})` are the analogue of DML with
  no `WHERE` and are covered by `pitta.query.blockUnqualifiedDml`. An aggregation
  containing `$out` or `$merge` is classified as a write by walking the pipeline,
  not by trusting the method name.
- **S4.9 [MM]** Redis: `KEYS` and `MONITOR` are refused rather than confirmed
  (O(N) server block; server-wide command stream). `FLUSHALL`, `FLUSHDB`,
  `SWAPDB`, `CONFIG SET`, `SHUTDOWN`, `MIGRATE`, `REPLICAOF`, `CLUSTER RESET`,
  `ACL SETUSER` and `EVAL` require the typed confirmation on prod.
- **S4.10 [MM]** Where an engine has no server-side read-only session, `readOnly`
  is enforced client-side by refusing anything classified `write` or `admin`, the
  badge reads "client-side only", and the connection form recommends a read-only
  database user or ACL. A guarantee the server is not making is never presented
  as one.
- **S4.11 [MM]** Where a batch cannot be applied atomically, the apply dialog
  says so and the result reports which edits were applied. A rollback promise is
  never carried across from an engine that has one to an engine that does not
  (ADR-041).

## S5. Webview hardening
- **S5.1** Strict CSP, nonce'd scripts, `localResourceRoots` limited to the extension's `media/` dir. No remote script/style/font/image loads.
- **S5.2** All `postMessage` payloads validated with `zod` on receipt in both directions. Unknown message → dropped + logged.
- **S5.3** Cell values are rendered as **text nodes**. No `innerHTML`, no `dangerouslySetInnerHTML` anywhere — a row of data must never be able to execute. Markdown/HTML preview of a cell, if added, renders in a sandboxed sub-frame with its own CSP.

## S6. Third-party code
- **S6.1** Dependency allowlist; every new runtime dep needs a note in `09-DECISIONS.md`.
- **S6.2** `pnpm audit` + Dependabot/Renovate gate CI. No `postinstall` scripts in runtime deps.
- **S6.3** Prefer pure-JS deps so the VSIX stays platform-neutral. Native modules would require per-platform VSIX builds — avoided (node-postgres is pure JS; `ssh2` crypto bindings are optional and fall back to JS).
- **S6.4 [MM]** The same rule picks the non-relational clients: `mongodb` (with
  `bson`'s JS path) and `ioredis`, with the optional native packages —
  `mongodb-client-encryption`, `kerberos`, `@mongodb-js/zstd`, `snappy` —
  excluded from the bundle and the features needing them not claimed (ADR-046).

## S7. Privacy
- **S7.1** Telemetry off by default, opt-in, respects `telemetry.telemetryLevel`. Documented event list in the README.
- **S7.2** No SQL text, no schema names, no hostnames, no row data ever leaves the machine. Telemetry, if enabled, carries only counters and error *classes*.
- **S7.3** Query history is local-only; `prod` excluded by default.
- **S7.4 [MM]** Sampling is reading. The MongoDB schema inference and the Redis
  key sample read real user data to build the tree and the completion index;
  both stay in the extension host, both obey the metadata cache's TTL and the
  same on-disk rules as any other cached metadata, and neither is ever included
  in telemetry.
