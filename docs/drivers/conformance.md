# The conformance kit

`packages/core/test/driverConformance.ts` is the suite every driver must pass.

**A driver is called *supported* only when this runs green against a real server
in CI.** There are no aspirational drivers, and "it mostly works" is not a state
this project has a word for.

## The rule that shapes it

Every check is gated on a **capability flag**, never on the driver's identity.
The kit describes the contract; an engine that cannot do something declares so
and is not asked to.

> If a check here ever needs to know which engine it is talking to, the contract
> is wrong.

That is a real instruction, not a slogan. Finding a case where the kit would
need to branch on `driver.id` is a finding about the abstraction, and it gets
filed as one.

The kit also writes **no statement of its own**. It asks your fixture to create
a container and put records in it, and asks your *adapter* to build everything
else. That is what lets a document store and a key-value store run the same
assertions as PostgreSQL rather than being handed SQL they cannot parse.

## Wiring it up

A relational engine describes a dialect and gets a fixture for free:

```ts
import { runDriverConformance, sqlEngineFixture } from '../../core/test/driverConformance.js'
import { acmeDriver } from '../src/index.js'

runDriverConformance({
  name: 'acme',
  adapter: acmeDriver,
  open: () => connectForTest(),
  fixture: sqlEngineFixture(acmeDriver, ACME_DIALECT),
  available: Boolean(process.env.ACME_URL),
})
```

`available: false` skips the suite rather than failing it, so a contributor
without that server running still gets a green local run — and CI, where the
server *is* running, does not.

## Writing an `EngineFixture`

Anything not relational writes the fixture directly. It is the whole
engine-specific half of the kit:

| Member | What it is |
| --- | --- |
| `ref` | The container, as your driver names it |
| `fields` | Field metadata, as `buildSelect`/`buildDml` take it |
| `keyField` | The field an edit addresses a record by |
| `labelField` | A short text field the round-trip checks read back |
| `seed` | Records `create` writes, so paging has something to find |
| `create` / `drop` / `read` | Make, remove, and read the container the engine's own way |
| `run?` | Runs a statement your adapter built. Defaults to `session.queryAll(text, params)`, which is right wherever the statement text *is* the wire form. Override it if your command document rides in `params`. |
| `ping` | The simplest possible round trip |
| `failing` | Something the engine refuses, for the error-shape check |
| `nullAndEmpty?` | One row of exactly `[null, '']`, where the engine has both |
| `largeInteger?` | An integer at or near the 64-bit limit, and its exact string |
| `exactDecimal?` | A value the engine represents exactly and JavaScript cannot |
| `echo?` | Returns the value it was given, for parameter binding |
| `awkwardIdentifier?` | An identifier needing quoting, created by `create` |
| `heterogeneous?` | Records with fields the seeded ones lack (schemaless engines) |
| `unknownCommand?` | A command your classifier cannot place at all |
| `failingEdit?` | An edit that must fail on apply, for the partial-apply report |

The optional members are the honest ones: an engine with no exact decimal type
omits `exactDecimal` and the check does not run. Omitting one you *do* have is
the only way to pass a check your driver does not satisfy — and you would be
doing it in your own package, in a file a reviewer is looking at.

## What it checks

**Session.** Server information is reported. `ping` answers. Rows come back as
positional arrays with field metadata. A command tag is reported. A failure
surfaces as a `PittaError` with a code, rather than as whatever the client
library threw.

**Values.** Null and empty string stay distinct. A 64-bit integer round-trips as
an exact string. An exact decimal round-trips exactly. A bound parameter comes
back as itself.

**Paging and streaming.** `fetch()` pages. `rows()` iterates. Neither buffers
the whole result to satisfy the other.

**Transactions.** A rollback leaves no trace — gated on
`supportsTransactions`, so an engine without them is not asked to pretend.

**Identifiers.** `quoteIdent` handles an identifier that needs quoting and
escapes an embedded quote character.

**Statement building.** `buildSelect` produces something that runs. It rejects a
column that is not in the field list. `buildDml` produces edits that run and are
visible afterwards, and refuses an update with no key columns.

**Introspection.** A root level is declared, every declared child kind has a
definition, and every supported level runs without error against the fixture
schema.

**Capability honesty.** This is the section that catches the interesting bugs:

- Schemas appear in the introspection plan only if `supportsSchemas`.
- A row-id column exists only if `supportsRowIdFallback`.
- `generateDdl` and `diffSchema` are present only if their flags are.
- Generated placeholders match the declared `parameterStyle`.
- At least one producible `resultShape` is declared.
- The declared language's extensions are usable as file suffixes.
- Paging works the way the paging flags say it does.

**Multi-model.** Four checks only a non-relational engine can fail:

1. **Stable document projection.** The same columns in the same order across two
   reads, unioned across every sampled record rather than taken from whichever
   one came first. A projection that reshuffles between reads is a grid whose
   columns move under the cursor.
2. **Missing survives the round trip as missing.** At least one cell is absent
   rather than null, and a record that *does* carry the field with a null value
   still reads as null. The two stay tellable apart end to end (ADR-039).
3. **An unknown command is refused on `prod`.** Nothing can say what it does, so
   production asks — by making the user type the connection name (ADR-040).
4. **A non-atomic batch reports exactly which edits were applied.** The promise
   made by `supportsAtomicEdits: false`: the batch stops, earlier edits stand,
   and the caller knows which those were (ADR-041). One edit is not always one
   statement, and the report tracks that.

## The echo driver

`test/echo-driver` is a deliberately non-relational engine — a different
language, imperative introspection, document results, no transactions — that the
kit runs against on **every commit**, with no server needed.

It exists so that a contract change which quietly assumes SQL fails immediately,
in a unit test, rather than in the next real driver somebody writes. If you are
changing `core`, that is the test that tells you whether the change was as
generic as you thought.

## Running it

```bash
pnpm run test                # unit tests, including SQLite and the echo driver
pnpm run db:up               # every engine, seeded, in Docker
pnpm run test:integration    # the kit against real servers
pnpm run db:down
```

`docker-compose.test.yml` runs PostgreSQL 13/15/17, MySQL 8, MariaDB 11, SQL
Server 2022, MongoDB (standalone and a replica set), and Redis (6.2, 7, Stack,
and a cluster). Add your engine there and wire the suite into CI in the same PR
as the driver.
