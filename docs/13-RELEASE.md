# 13 — Release & Publishing

Phase 10. The pipeline is built and verified in CI; what remains at each release
is an account, two tokens, and a decision.

## 1. One-time setup

### Publisher accounts

**Visual Studio Marketplace.** Create a publisher at
<https://marketplace.visualstudio.com/manage>, signed in with a Microsoft
account. The publisher id must match `publisher` in
`packages/extension/package.json` — currently `DipeshShrestha`. Changing it later
means a new extension identity and losing every install, so it is worth being
sure now.

**Open VSX.** Sign in at <https://open-vsx.org> with GitHub, agree to the
publisher agreement, and create a namespace with the same name. Open VSX will
not accept a publish into a namespace nobody has claimed.

### Tokens

**`VSCE_PAT`** — an Azure DevOps personal access token for the organization
backing the publisher, scoped to **Marketplace → Manage**, with **All accessible
organizations** selected. A token scoped to one organization fails with an
unhelpful authentication error.

**`OVSX_PAT`** — from the Open VSX profile page.

Both go in the GitHub repository under **Settings → Secrets and variables →
Actions**, as secrets of the **`marketplace`** environment, not as repository
secrets. The environment is what makes a publish require a reviewer.

### The environment gate

Create an environment named `marketplace` (**Settings → Environments**) and add
yourself as a required reviewer. `.github/workflows/release.yml` targets it, so a
tag alone never publishes: the job waits for an approval.

## 2. Cutting a release

```bash
# 1. Bump the version in packages/extension/package.json.
#    An ODD minor is a pre-release; an EVEN minor is stable. This is the
#    convention VS Code itself documents, and release.yml reads it.

# 2. Update packages/extension/CHANGELOG.md.

# 3. Commit on main, then tag it.
git commit -am "chore(release): prepare 0.2.0"
pnpm release:tag

# 4. Push the tag. This is the publish.
git push origin main v0.2.0
```

`pnpm release:tag` reads the version out of the manifest, so the tag and the
manifest cannot disagree - which is the check `release.yml` refuses on. It
copies that version's changelog section into an annotated tag, so `git show
v0.2.0` says what shipped without asking a marketplace, and it refuses to tag a
dirty tree, a version with no changelog entry, or a name that already points
somewhere else. It never pushes: pushing is what publishes.

Tagging a release already made - one from before the tag was part of this -
takes the commit that bumped the manifest:

```bash
pnpm release:tag --at <commit>   # reads that commit's own manifest and changelog
```

::: warning A pushed tag is a publish
`release.yml` fires on `v*`. Pushing a backfilled tag for an old version starts
a real release of that version, so historical tags are worth keeping local
unless you actually want to republish one.
:::

The workflow then:

1. **verify** — `pnpm run verify`, `pnpm run build`, `pnpm run test:bench`,
   against the exact commit being released. A tag that skips verification is a
   tag nobody can trust.
2. **package** — checks the tag matches the manifest version and refuses if they
   disagree, builds the VSIX, and asserts what is inside it: the extension
   bundle, both WASM runtimes, the snippets, the walkthrough pages, and *nothing*
   from `src/` or `node_modules/`.
3. **publish** — waits for approval, then Marketplace, Open VSX, and a GitHub
   release with the VSIX attached.

`workflow_dispatch` runs the same thing without a tag, choosing the channel by
hand.

### What the VSIX check is for

The webview build empties `packages/extension/media` on every run, so a
hand-written file placed there vanishes from the VSIX while everything still
builds and every test passes. The content assertions in `release.yml` and in
`test/unit/manifest.test.ts` are what catch it.

## 2a. The two repositories

The extension is developed privately; everything a user needs is public, in
[shresthadeepesh/pitta-db](https://github.com/shresthadeepesh/pitta-db).

That split is not a preference. Someone who installs Pitta from the Marketplace
cannot open an issue on a private repository, cannot read a `tree/main/docs`
link, and cannot load a screenshot that `vsce` rewrote to `raw.githubusercontent`.
GitHub Pages does not serve a private repository at all without a paid plan,
which is why the docs site failed to deploy for as long as it was wired here.

What lives where:

| | Private (`pitta-db-extension`) | Public (`pitta-db`) |
| --- | --- | --- |
| Source, tests, releases | ✓ | |
| `docs/` as written | ✓ | synced copy, on every push to main |
| Documentation site | built as a link check | built and served at [shresthadeepesh.github.io/pitta-db](https://shresthadeepesh.github.io/pitta-db/) |
| Issues, Discussions | for internal use | what the listing points at |
| Demo clips for the listing | | `resources/demo/` |

The manifest's `repository`, `bugs`, `homepage` and `qna` all name the public
repository, so all four Marketplace links resolve for someone who has no access
to the source. README screenshots use absolute URLs into it for the same
reason: `vsce` resolves a relative path against `repository`, which would point
at a path that does not exist there.

`docs.yml` in this repository builds the site (a dead link fails the build) and
then pushes `docs/` to the public repository, where its own workflow publishes
Pages. That sync needs a **`PUBLIC_REPO_TOKEN`** secret with `contents: write`
on `shresthadeepesh/pitta-db`; without it the job warns and the site keeps
serving its last synced copy rather than failing the build.

## 3. The listing

Both marketplaces render `packages/extension/README.md`. `vsce` rewrites relative
image links to absolute `raw.githubusercontent.com` URLs using the `repository`
field, so demo assets must be **committed** but need not be **shipped** —
`resources/demo/**` is in `.vscodeignore` for that reason.

Listing fields live in `packages/extension/package.json`:

| Field | Why it is what it is |
| --- | --- |
| `displayName`, `description` | The search result. The description names the six engines because that is what people search for. |
| `categories` | Data Science, Programming Languages, Notebooks, Visualization, Formatters. There is no Database category. |
| `keywords` | The leading entries rank highest; engines first, then the words that describe the tool. |
| `icon`, `galleryBanner` | `resources/icon.png` on the dark banner. |
| `pricing` | `Free`. |
| `qna` | Points at GitHub Discussions rather than the Marketplace's own Q&A, which nobody watches. |
| `preview` | `true` until 1.0. Shows the Preview badge. |
| `capabilities` | Untrusted-workspace and virtual-workspace support, both `limited` and both honest about what does not work. |

### Before the first publish

- [ ] Publisher created on both marketplaces, ids matching the manifest
- [ ] `VSCE_PAT` and `OVSX_PAT` in the `marketplace` environment
- [ ] `marketplace` environment has a required reviewer
- [ ] GitHub **private vulnerability reporting** enabled (Settings → Code
      security), since `SECURITY.md` points people at it
- [ ] Discussions enabled, since `qna` and the issue-template chooser point there
- [ ] Demo clips recorded (below) and the `<img>` block in
      `packages/extension/README.md` uncommented
- [ ] `pnpm run package` inspected locally: install the VSIX in a clean profile
      and connect to something in under 30 seconds, guided only by the README

## 4. Demo clips

Clips are the listing's real copy — most people scroll the images and read
nothing. Six of them, recorded from a database that exists for this purpose.

**Set up first.** `pnpm run db:up` starts the servers; `pnpm run demo:seed`
loads `demo/seed.sql` into the Postgres 17 one. That schema is a shop —
customers, products, orders, order items, a view, and an `archive_orders`
procedure that reports progress with `RAISE NOTICE` — with twenty thousand
orders, one index and not two, so the planner has a real choice to make and the
grid has something to scroll. Do **not** record against the integration
fixture: it contains `no_pk` and a column called `"select"` on purpose, which
is what makes it a good test and a terrible thing to film.

**Rules for all of them.** 1280×800 window, dark theme, editor font at 16px so
it reads at listing size. No real hostnames, no real data. Under 8 seconds
each; if it does not fit, the clip is doing too much. No cursor teleporting:
move, pause, click. Start on a clean editor, end on the result, no trailing
idle frames.

| File | Scene |
| --- | --- |
| `connect.gif` | Add Connection → fill host/database/user → **Test Connection** → green → save → the tree expands to a table. Shows: the form is per-engine, secrets go to the keychain, it works before you have typed any SQL. |
| `grid.gif` | Open Data on `shop.order` → filter `status` → edit a cell → **Apply** shows the exact `UPDATE` with its key → confirm → the row updates. Shows: the SQL is never hidden, edits are staged. |
| `query.gif` | Type `select … from ord` → completion offers the table → alias-aware column completion → run → results, timing → cancel a slow one. Shows: real intelligence, real cancellation. |
| `plan.gif` | **Explain** on the `order`/`customer` join → the plan diagram → hover the flagged scan and read the reason. Shows: the plan view is a diagnosis, not a dump. |
| `erd.gif` | **Show Schema Diagram** on `shop` → the FK graph lays out → drag a table → filter to neighbours. Shows: the schema tooling exists. |
| `routine.gif` | **Edit Routine** on `archive_orders` → change the body → save → **Run Routine** → the argument form → notices arriving *while* it runs. Shows: the procedure workflow nobody else has in the editor. |

**Converting.** Record with any screen recorder, then:

```bash
pnpm run demo:clip -- recordings/query.mov
```

That writes two files from one recording, because the two places that show them
cannot share a format: `packages/extension/resources/demo/query.gif` for the
Marketplace, which renders Markdown and will not play a video, and
`docs/public/demo/query.mp4` for the docs site, which will — and which would
otherwise make every reader download a GIF five to ten times the size. It fails
rather than warns when the GIF is over 2 MB: a heavy clip on a listing is a
blank space for anyone on a slow connection, and it renders fine on the machine
that made it.

The GIFs are committed here and excluded from the VSIX (`.vscodeignore`), and
`docs.yml` mirrors them to the public repository, which is where
`raw.githubusercontent` can actually read them from.

## 5. Pre-release channel

An odd minor version publishes to the Marketplace pre-release channel. Users who
opt in get it; everyone else stays on the last even minor. Open VSX has no
pre-release channel, so the same artifact is published there and the odd minor is
the only signal.

Keep the two channels' version lines apart: `0.3.x` pre-release, `0.4.0` the
stable release of that work.

## 6. Open questions

- **Signed VSIX.** `vsce` supports signing; it needs a certificate and a
  decision about where the key lives. Not blocking a first publish.
- **`semantic-release`.** P10-T5 asks for it. The version is currently bumped by
  hand and the tag/manifest check in `release.yml` catches the mistake that
  makes. Worth doing once the release cadence is regular enough to be annoying.
- **Telemetry.** `pitta.telemetry.enabled` exists, defaults to false, and has no
  implementation and no transport behind it. S7.1 asks for an opt-in flow and a
  documented event list; there is currently no backend to send anything to.
  Either build the transport or drop the setting — leaving a setting that
  promises collection that does not happen is the one option that is wrong.
