# Automatic releases

The `Automatic release` workflow starts when the CI of a push to `main` ends
successfully. It checks the repository, the workflow and the approved SHA before
preparing any change.

The process creates a `release/vX.Y.Z-<sha>` branch with changes only to
`package.json` and `CHANGELOG.md` and opens a PR. The publication reuses the
approved CI of the source and checks the exact content of the release commit
before the normal merge. Then it creates an annotated tag and publishes the
notes in the GitHub Release. It does not publish to npm or deploy.

## Code organization

`automatic-release.ts` reads the mode and the context, validates the artifact
and coordinates the steps. `prepare-release.ts` prepares the branch and the PR
and checks the commits involved. `publish-release.ts` integrates the release,
checks the merge and publishes the tag and the notes. `repository.ts` gathers
the state queries and the repository protections; `context.ts` keeps the context
of the run and its outputs.

The types shared by those steps live in `types.ts`; the private types stay in
the module that uses them. The import tree of the jobs with write permission
still uses only native modules, without installing dependencies. The tests run
the same entry as the workflow and check that import tree.

## Versioning

| Commit                                                             | Increment                     |
| ------------------------------------------------------------------ | ----------------------------- |
| `feat`                                                             | Minor                         |
| `fix`, `perf`, `revert`                                            | Patch                         |
| `chore(deps)`, `chore(deps-dev)`, `build(deps)`, `build(deps-dev)` | Patch                         |
| `!` in the header, `BREAKING CHANGE:` or `BREAKING-CHANGE:`        | Major                         |
| Other types, without a breaking change                             | Do not create a release alone |

`BREAKING CHANGE:` and `BREAKING-CHANGE:` count at the start of any line of the
body outside code blocks, even without the blank line that commitlint requires
before the footer; commits created outside the hook can leave it out.

The first release starts from `0.0.0` and creates `1.0.0`. After that, the
version of `package.json` must match the last stable tag reachable from the
commit. When there is more than one kind of change, the largest increment wins.

Notes filled in by hand under `## Unreleased` are kept. When that section is
empty, the notes are generated from the commits, grouped in `Added`, `Changed`
and `Fixed`. The Vite+ Oxfmt formats the generated files in the plan job, the
only one that installs dependencies.

## Enabling on GitHub

In Settings > Actions > General > Workflow permissions, turn on "Allow GitHub
Actions to create and approve pull requests". The workflow has three jobs:

| Job       | Permissions                                                                | What runs                                                    |
| --------- | -------------------------------------------------------------------------- | ------------------------------------------------------------ |
| `plan`    | `actions: read`, `contents: read`                                          | Installs the dependencies, computes the plan and formats     |
| `prepare` | `actions: read`, `contents: write`, `pull-requests: write`                 | Creates the branch and the PR and closes stale release PRs   |
| `publish` | `actions: read`, `checks: write`, `contents: write`, `pull-requests: read` | Attests, integrates, creates the tag and publishes the notes |

Only `plan` runs `vp install` and imports Vite+. It hands over the
`release-plan` artifact with the formatted `package.json` and `CHANGELOG.md`.
The jobs with write permission prepare only the toolchain through the
`setup-project` action (`install-dependencies: false`), download the artifact
with a digest check and run `bun --no-install`, without third-party packages in
the process that receives the `GH_TOKEN`. Before any write, the script computes
the plan again with Git and native code and refuses the artifact if the
structure or the source differ, if `package.json` changes anything besides the
version or if the changelog differs from the plan in anything besides
whitespace. The version and the tag come from the recomputed plan, and the
notes, from the version section of the checked changelog. The merge requires
`contents: write`; `publish` only reads PRs. The workflow does not approve its
own PR or ignore protection rules.

The `.github/main-ruleset.json` ruleset protects `main`: it requires a PR, a
normal merge, resolved conversations and the `CI required` check from GitHub
Actions, with the branch up to date before the merge. It blocks deletion and
force pushes, without bypass actors, administrators included. It does not
require human approval, to allow the automatic release and individual work in
the repository.

The `.github/release-tags-ruleset.json` ruleset protects the `v*` tags against
updates and deletion, also without bypass actors. Creation stays open so the
automation can publish new tags; an existing tag with another SHA makes the
release fail instead of being overwritten.

The JSON files are the versioned contract of the remote configuration. Changing
them in Git does not update GitHub automatically; changes must be applied to the
rulesets through the API or the repository interface.

PRs created by `GITHUB_TOKEN` do not depend on a new PR event for validation.
The `publish` job reads the source CI again and requires the release commit to
be its direct child. It accepts only the two expected files, with their types
and permissions kept. `package.json` must keep every field of the source, except
the computed version; the changelog must match the content generated by the
plan. Changes to dependencies, scripts, other files or the expected content
prevent the publication.

After those checks, `publish`, with `checks: write`, records `CI required` on
the exact SHA of the release. The result identifies the metadata validation and
points to the approved CI of the source. The release does not repeat coverage,
tooling or E2E. The specific tests of the automation run in Bun in the pre-push
and in CI when there are relevant changes; the publication does not repeat them.

The `publish` job exposes `tag` and `version` as outputs for a later job in the
same workflow, such as a deploy or a package publication, because the tag
created with `GITHUB_TOKEN` does not trigger other workflows; the outputs are
empty when the merge is postponed.

The script checks the active rules of `main` before creating any release
artifact and repeats the check right before the merge. If the strict CI
requirement is missing, the preparation stops without creating a commit, branch
or PR. The Node, Bun and Vite+ versions come from `package.json`; only the
`plan` job installs the dependencies, with a frozen lockfile.

The three jobs check out the tip of `main`, and the script checks that it
contains the source SHA and the code that is running. The checkout does not keep
the token: the Git commands that reach the remote authenticate through the `gh`
helper with the `GH_TOKEN` of the step, which allows using the automation in a
private repository.

New PRs can cancel their previous CI. Pushes do not cancel the running workflow,
keeping the deploy. The release accepts only the `main` branch in the
`workflow_run` trigger. Eligible runs share a concurrency group; ineligible ones
use groups exclusive to each run and do not replace a pending release. Between
eligible releases, the most recent one replaces the previous pending one,
keeping the run already in progress.

## Vercel integration

The Vercel project receives production deploys through the `deploy` job of the
CI. In this instance, it is the `boilerplate-solidjs` project, in the
`verton-toffanettos-projects` scope; a copy of the boilerplate uses its own
project. The job depends on `check`, which requires the production E2E to
succeed, and runs only on a push to `main`. The PR CI validates the code without
publishing to Vercel.

On the push to `main`, the production E2E job uses the Vercel CLI version pinned
in `VERCEL_CLI_VERSION`, in the `env` of the
[CI workflow](../../.github/workflows/ci.yml), the same in `pull`, `build` and
`deploy`. To update it, replace that value with a stable version published on
npm and check the production E2E and the deploy of the push to `main`. The job
loads the Vercel settings and runs `vercel build --prod` once. The
`VERCEL_TOKEN` secret only reaches the `pull`, `build` and `deploy` steps; the
inspection and the packaging of the output run without it. The Vercel
documentation passes the token to `vercel build` too, so the build keeps it.
Playwright tests that output without building again, receiving only the public
`VITE_*` variables of the `.vercel/.env.production.local` file downloaded by
`vercel pull`, without the backend credentials. The job packages only
`.vercel/output` in a tar, keeping permissions and links, and compares the
content and the file listing after the tests before uploading it to GitHub
Actions. The `Package deployment artifact` step refuses links that leave the
output and functions with `filePathMap`, because those references would require
publishing files outside the tested artifact. The current Nitro generates the
function with its dependencies inside the output.

The `deploy` job runs under the `vercel-production` concurrency group. Before
any preparation, it reads the head of `main` through the API and only publishes
if it is still the SHA validated by the run; an older run that ends after a
newer one records the reason in the summary and does not publish. A failure in
that read fails the job. Then it checks out the same SHA, prepares the toolchain
of `package.json` without installing dependencies and downloads the artifact of
the same CI run. The integrity check of the download fails if the digest
differs. The name includes the SHA, and the upload replaces only the artifact
with that name in the current run, which allows re-running failed jobs. The
retention is one day; after it expires, run again the job that generates and
tests the build. Environment files and `.vercel/project.json` stay out of the
tar.

After every check passes, the deploy publishes that output with
`vercel deploy --prebuilt --prod`, without another build. PRs do not use Vercel
credentials and keep the local test builds. The `build` script calls the local
Vite+ CLI with Bun explicitly; to run it, use `vp run build`.

GitHub needs these settings in Settings > Secrets and variables > Actions:

| Kind     | Name                | Purpose                                   |
| -------- | ------------------- | ----------------------------------------- |
| Secret   | `VERCEL_TOKEN`      | Authorize pull, build and deploy          |
| Variable | `VERCEL_ORG_ID`     | Identify the team of the personal account |
| Variable | `VERCEL_PROJECT_ID` | Identify the target project               |

In this instance, the IDs and the `VERCEL_TOKEN` secret are registered on
GitHub, and the `github-boilerplate-solidjs-ci` credential is restricted to the
`boilerplate-solidjs` project, without expiration. In a copy, create in
[Vercel Tokens](https://vercel.com/account/tokens) a token restricted to the
project itself. The value lives only in the repository secret, without being
added to the environment files.

The Git link was also disconnected in the remote project. `vercel.json` turns
off the deploys triggered by the Git integration with
`git.deploymentEnabled: false`. That keeps the requirement of publishing through
the CI even if the repository is connected to Vercel again.

The build uses Bun and keeps `ENABLE_EXPERIMENTAL_COREPACK=0` in the environment
of the `vercel build` step of the CI. Corepack does not manage Bun, and the
value in the step stops old settings downloaded by `vercel pull` from turning
Corepack back on in the CLI. The project does not use a remote build: a manual
`vercel deploy` without `--prebuilt` would need the same variable in the project
settings on Vercel. Also keep `LEFTHOOK=0` in the deploy. The `HOST`, `PORT` and
`BASE_URL_TEST` variables belong to the local run and to the tests. The current
contract in `env.ts` requires no application secrets.

The release automation uses the automatic GitHub token. It only starts after the
whole CI passes, the deploy included. The versioning merge made by
`GITHUB_TOKEN` does not trigger a second CI: the release publishes the tag and
the notes, without a second deploy for the change to `package.json` and
`CHANGELOG.md`.

## Recovery

In the Actions tab, run `Automatic release` by hand, on the `main` branch,
passing in `source_run_id` the ID of the push CI that originated the release. A
new run reuses the existing branch and PR, validates the commit again and
resumes after the merge or the tag creation, if needed. Existing tags with
another SHA and releases with diverging notes cause an error; they are not
overwritten.

A release already integrated can resume the publication even if the protection
of `main` changed after the merge, because that resumption does not change the
branch. The identity of the PR, the validation of the prepared content and the
equality of the parents and the tree of the merge with the validated result are
still required.

If the version of `package.json` is ahead of the last stable tag, recover the
original run before starting another release. Do not merge a blocked release PR
by hand: a different base or changes in the merge prevent the automatic
resumption. In that case, review the validated SHA and the state of the
publication before fixing the metadata; do not create a tag at the current tip
of `main` just to make the versions match.

After confirming the publication, the automation deletes the release branch only
if it still points to the validated SHA. The deletion uses an atomic SHA
comparison; a concurrent update prevents the cleanup. If the branch was already
deleted, the recovery uses the merged PR and does not create the branch again.
The PR and the tag stay.

If `main` moves forward before the merge, the run ends without an error and
records the reason in the summary: the CI of the new commit starts another
release, which includes the pending changes. When the move shows up in
`prepare`, it closes the PR of this source. When it shows up in `publish`, which
only reads PRs, the merge is skipped and the PR stays open until the next
preparation. Every preparation checks the 100 most recent open PRs to `main` and
closes the release PRs opened by the automation whose source is a strict
ancestor of the current source; with more open PRs, the summary warns that the
oldest ones were left out. Human PRs, other branches and newer sources are not
touched. The branches stay for inspection; there is no automatic deletion of
branches abandoned before the merge.

If `main` moves forward between the last check and the merge call, the
up-to-date branch requirement of the ruleset blocks the integration on GitHub.
The script keeps the later check of the parents and the tree before creating the
tag as an extra defense. The remote protection must stay active during the
release.

If someone closes the release PR without merging it, reopen the same PR before
running again with the same `source_run_id`. The automation respects the manual
closing.

## Local and CI validation

```sh
vp run test
vp run test:release
vp run typecheck:node
```

`vp run test:release` runs only `tooling/release` in Bun, with isolation between
files and a 60-second timeout. The suite with subprocesses keeps the 30-second
limit per test. The command runs on every pre-push and is part of
`vp run validate`. `vp run test:tooling` keeps the other modules on Node.

In CI, a step of the `Quality` job compares the commits and decides whether to
run that suite. PRs use the common ancestor of the base with the tested SHA;
pushes compare `before` with that SHA. Unavailable history, an invalid SHA or a
comparison error make the tests run. Renames are treated as a deletion and an
addition to keep the source and target paths in the selection.

The filter in `shouldTestRelease/index.ts` covers `tooling/release/`,
`tooling/fmt.ts`, `.commitlintrc`, `package.json`, `bun.lock`, `bunfig.toml`,
`vite.config.ts`, `tsconfig.json`, `tsconfig.node.json`, the CI and release
workflows and the local actions in `.github/actions/`. When adding a local
dependency of the automation, update that list and the tests of the filter.
Changes only to the application or to guides outside the release folder do not
run the suite in CI.

The selection does not skip the workflow or the `Quality` job. `CI required`
requires every job to succeed, except when the push to `main` reuses the PR
validation, according to the
[development guide](../../docs/development.md#reusing-the-pr-validation-on-main).
The manual recovery also keeps the real checks of source, commit and
publication; it does not repeat the tests.

The integration tests replace `git` and `gh` with synthetic executables and
isolate the `PATH` of the subprocesses. The synthetic Git refuses fetch and push
without the `gh` credential helper. They generate the artifact with the script
of the `plan` job and run the jobs with write permission with
`bun --no-install`, tampered artifacts included. A static test checks that the
entry of those jobs only reaches `node:` modules and that the workflow keeps the
permissions and the installation separate. No tool validates the syntax of the
workflows locally; GitHub validates it when loading the file. They do not use
real credentials or create remote releases. The fixtures live in the temporary
folder of the system, and the suite discards them when it ends. If an
interrupted run leaves leftovers, use `trash`.
