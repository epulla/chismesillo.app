---
name: dependabot-pr-reconciliation
description: Inspect, merge, or close Dependabot PRs after a base-branch change. Use when "merge dependabot PRs", "dependabot conflicts", "clean up dependency PRs", "superseded dependency PR", or several dependency PRs fail CI at once.
---

# Dependabot PR Reconciliation

Decide what to do with open Dependabot PRs: merge the green ones, rebase the
stale ones, and close only the genuinely superseded ones. **Do not assume the
PRs are superseded** — first find out *why* they are failing.

## Package Manager

Use **pnpm only** for package metadata, installs, audits, and version lookups.
Do not use `npm`, `npx`, or `yarn` in this repo.

## When to Use

- Several open Dependabot PRs at once.
- All (or most) PRs fail CI — possibly for the **same** reason.
- The base branch was just bumped (e.g. a combined audit fix), or is itself broken.
- PRs have gone conflicting/unstable after the base moved.

## Inspect

```bash
gh pr list --state open --json number,title,mergeable,mergeStateStatus,statusCheckRollup,url
gh pr view <n> --json number,files,commits,statusCheckRollup,mergeStateStatus,mergeable
```

## 1. Triage the failure cause FIRST

Before applying any version logic, read an actual failing run:

```bash
gh run view <run-id> --log-failed
```

Then classify:

- **Base-branch break** — every PR fails the *same* check for a reason
  unrelated to the bump (e.g. a pre-existing typecheck/build/test failure on the
  base branch). The dependency bump is innocent. → **Fix the base branch first**,
  then rebase the PRs (see step 3). Do **not** close these as superseded.
- **Bump-related failure** — the failure is caused by the dependency change
  itself (breaking API, peer-dep conflict). → apply the Decision Rule below.
- **Stale base** — the PR just needs to re-run against newer base. → rebase (step 3).

## 2. Decision Rule (only once base is green & failure is bump-related)

- Base version **≥** PR version → **superseded** → close.
- PR version **>** base, checks green, `mergeable: MERGEABLE` → merge.
- `CONFLICTING` / `DIRTY` **and** superseded → close. Never force-merge.

### Verify base is green before closing as superseded

Confirm the superseding commit passed both workflows:

```bash
gh run list --commit <sha> --json status,conclusion,workflowName
```

### Close superseded

```bash
gh pr close <n> --comment "Superseded by <sha>; updates dep beyond this version, passes CI + Security Audit on main."
```

## 3. Rebase to revalidate

After fixing the base (or when the base simply moved), rerun each PR's CI
against the updated base:

```bash
gh pr comment <n> --body "@dependabot rebase"
```

(Or close/reopen to retrigger.) Then re-list and merge the now-green PRs in
dependency order (devDeps and leaf deps first, runtime deps last).

If Dependabot rebase is unavailable (for example its infra cannot reach a
registry), apply the same bump directly on the updated base using pnpm, verify,
commit, push, then close the PR as superseded by the main-branch commit:

```bash
pnpm --filter <workspace-pkg> add <dep>@<version>
pnpm --filter <workspace-pkg> add -D <dep>@<version>
pnpm install
pnpm typecheck
```

Only run the command that matches the dependency type. For root devDependencies,
edit the root manifest or run pnpm from the workspace root.

## Notes

- Dependabot may auto-close some PRs on its own after the base bump.
- A failed `gh pr reopen` on an already-closed Dependabot PR is not blocking;
  leave a superseded note with `gh pr comment`.
- Sequential squash-merges can drift `pnpm-lock.yaml` and make later PRs
  conflicting. Rebase them, or apply the bump directly if rebase is unavailable.
- Re-run `gh pr list --state open` afterward to confirm the intended state.

## Red Flags

- **Assuming PRs are superseded without reading a failing run** — they may all be
  failing on a base-branch break the bump didn't cause.
- Closing innocent PRs as "superseded" when the real fix is on the base branch.
- Force-merging a conflicting PR.
- Assuming `@dependabot rebase` worked without checking that CI reran.
- Merging while a required check is red.
- Closing PRs before verifying the base SHA is green.

