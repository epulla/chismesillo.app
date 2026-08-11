# Contributing

Thanks for helping improve Chismesillo.

## Contribution terms

By submitting a contribution, you agree that:

- You have the right to submit the contribution.
- Your contribution is provided under the PolyForm Noncommercial License 1.0.0.
- You grant the project owner a perpetual, irrevocable, worldwide, royalty-free license
  to use, reproduce, modify, distribute, and sublicense your contribution as part of this
  project, including under commercial licenses granted by the project owner.
- Commercial use of this project still requires explicit written permission from the
  project owner.

If you cannot agree to these terms, please do not submit the contribution.

## Development

Use Node.js 22.13 or later and pnpm 11:

```bash
pnpm install
pnpm dev
```

`pnpm dev` daemonizes the Astro development server. Manage it with
`pnpm exec astro dev stop`, `pnpm exec astro dev status`, or
`pnpm exec astro dev logs`.

Before opening a pull request, run the same gate as CI:

```bash
pnpm format:check && pnpm check && pnpm test && pnpm build
```

The existing `pnpm check` hint in `store.ts` is not an error.

## Pull requests

- Keep changes focused and leave unrelated cleanup for another pull request.
- Use lowercase [Conventional Commits](https://www.conventionalcommits.org/) subjects,
  such as `fix:`, `feat:`, `docs:`, or `chore:`. Explain why in the commit body when it
  is not obvious.
- Open the pull request with `gh` and leave it for human review.

Read [AGENTS.md](AGENTS.md) for architecture, project conventions, and known gotchas.
