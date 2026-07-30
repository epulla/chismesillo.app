---
name: repo-conventions
description: Mechanics of contributing to this repo that are not discoverable from the code — where agent skills live and how skills-lock.json works, running pnpm when it is not on PATH, which tests a change will trip and what each one is guarding, and the checklists for adding a DOM id, a locale string, a model or a language. Use before adding or editing a skill, before adding an id/string/model/language, when a test fails for a reason unrelated to what you changed, or when preparing a commit or PR.
license: MIT
metadata:
  author: chismesillo
  version: "1.0"
---

# Repo conventions

`AGENTS.md` is the canonical description of the architecture and the gotchas, and it
is always loaded. **Read it first; this file deliberately does not repeat it.** What
follows is the mechanical stuff you otherwise have to reverse-engineer from
`git ls-files`.

## Agent skills live in two places, only one of which is real

```
.agents/skills/<name>/SKILL.md      <- canonical, tracked
.claude/skills/<name>  -> symlink   <- tracked, how Claude Code finds it
```

`.claude/skills/*` are **tracked symlinks** into `.agents/skills/`. The layout was
flipped deliberately (`refactor: make .agents canonical for skills`), so do not
"fix" it back.

Adding a skill:

```bash
mkdir -p .agents/skills/<name>
$EDITOR .agents/skills/<name>/SKILL.md
ln -s ../../.agents/skills/<name> .claude/skills/<name>
```

A skill without the symlink will not be discovered. A skill placed directly in
`.claude/skills/` as a real directory breaks the pattern and confuses the next
person.

### skills-lock.json is only for vendored skills

It records skills fetched from elsewhere, with a `source` and a `computedHash`.
**Hand-written local skills do not go in it** — 7 of the 17 skills on disk already
have no entry (`brand`, `design`, `slides`, `ui-styling`, …). Adding one would
fabricate provenance for something with no upstream and give the sync tool a hash to
reconcile against a source that does not exist.

### Skill content is not formatted or linted

`.prettierignore` covers `.agents/` and `.claude/`, so `pnpm format` will not touch
skill markdown — but they *are* committed. Keep them tidy by hand.

## Running the tooling

`pnpm` is frequently not on `PATH` in this environment even though the repo pins it.
Use corepack:

```bash
corepack pnpm test          # instead of `pnpm test`
```

The gate, identical to what CI runs on Node 22.13.0 **and** 24:

```bash
corepack pnpm format:check && corepack pnpm check && corepack pnpm test && corepack pnpm build
```

`pnpm check` reporting `1 hint` is the pre-existing `store.ts` "may be converted to
an async function" note. It is not an error and is not yours to fix.

## Tests you will trip without touching them

These enforce cross-file agreement, so an innocent-looking edit fails a spec in a
file you never opened. Each is listed with what actually fixes it.

| Failing spec | Cause | Fix |
|---|---|---|
| `domIds.test.ts` | new `id="..."` in any `.astro` | add it to `DOM_IDS` in `domIds.ts` |
| `domIds.test.ts` | an id declared in two components | ids must be unique across all markup |
| `ui.test.ts` "identical key sets" | string added to `en` only | add the same key to `es` |
| `ui.test.ts` "placeholders consistent" | `{n}` in one locale, missing in the other | match the placeholders |
| `theme.test.ts` | colour changed in `global.css` or `theme.ts` | change both; the test re-derives contrast |
| `securityHeaders.test.ts` | COOP/COEP edited in one place | `astro.config.mjs`, `public/_headers`, `vercel.json` must agree |
| `app.test.ts` | new eager `el()` lookup that throws | the fixture builds every `DOM_ID` as a `<div>` — new code must tolerate that |

`app.test.ts` deserves care: it builds every id as a plain `<div>` except the model
select. Anything `init()` calls must therefore **no-op rather than throw** when it
gets an element of the wrong type, or the whole page's listeners silently never
attach. See `enhanceLanguageSelect`, which returns `false` instead of throwing.

## Checklists

**Adding a DOM id** — declare it in the `.astro` component, add it to `DOM_IDS`,
reference it from `app.ts` only as `DOM_IDS.x`, never a string literal. Anchor
targets that are only addressed by `href` go in the allowlist inside
`domIds.test.ts` instead.

**Adding a user-facing string** — add to `en` *and* `es` in `src/i18n/ui.ts`. If the
browser reads it at runtime, its top-level section must be in `CLIENT_SECTIONS`, or
`t('foo.bar')` returns the key path verbatim instead of throwing.

**Adding a model** — `MODELS` in `models.ts` needs `melBins` (80, or 128 for
large-v3 derivatives) and a `wasmSize` of `null` when `requiresWebGPU` is true;
`models.test.ts` asserts those agree. Add `models.<key>` to both locales. Check real
file sizes before picking a dtype — see the `transformers-js-memory` skill.

**Adding a language** — every entry in `languages.ts` needs at least one alias, since
the UI ships in Spanish and the search index would otherwise be English-only.

**Adding a component** — `src/pages/index.astro` and `src/pages/es/index.astro` must
stay structurally identical. Edit both.

## Dependencies

Runtime deps are pinned exactly, no `^`. Two advisories are ignored in **two** files
that must stay in sync — `osv-scanner.toml` and the `auditConfig.ignoreGhsas` block
in `pnpm-workspace.yaml` — both for transitive Node-only dependencies of
transformers.js that never reach the browser bundle. `pnpm-workspace.yaml` also
disables the `onnxruntime-node` build and exempts `astro@7.1.4` from the
release-age gate.

A separate `security-audit` workflow runs `pnpm audit` plus `osv-scanner` on every
PR and weekly, so a new advisory can fail CI on a branch that changed nothing.

## Commits and PRs

Conventional Commits, lowercase subject, optional scope: `fix(models):`, `feat(config):`,
`docs:`, `ci:`, `chore:`, `refactor:`. Bodies explain **why**, matching the comment
philosophy in `AGENTS.md` — the git history here is unusually explanatory and is
worth keeping that way.

Branch, push, open a PR with `gh`, and leave it for human review. In a PR that
touches inference, state plainly what was **not** verified: nothing in this repo can
run real inference — no WebGPU, no model download, no WebCodecs in Node — so changes
to `transcriber.worker.ts` are typechecked, not executed. Say so rather than implying
the suite covers them.
