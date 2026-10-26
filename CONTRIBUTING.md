# Contributing

Every change starts on a dedicated branch and reaches `main` through a GitHub pull request. This applies to application code, documentation, tooling and agent-authored changes.

## Branch and PR workflow

1. Start from the current `main`, then create a branch such as `feat/f02-map`, `fix/api-health` or `chore/contribution-workflow` before editing files.
2. Make the change and commit with a Conventional Commit message. Keep hooks enabled.
3. Push the task branch: `git push -u origin <branch>`.
4. Open a PR against `main`. Give the PR a Conventional Commit title, describe the behavior and validation, and wait for the checks and review.
5. Merge the PR on GitHub. Prefer squash merge with the validated PR title as the squash commit title. Leave merging to the user unless they explicitly request it.
6. Update local `main` with a fast-forward pull after the GitHub merge. Begin the next change on a new branch.

Direct commits and direct pushes to `main` are blocked by local hooks. Local merges into `main` are outside this workflow. Existing history is retained.

## Conventional Commits

Use `type(scope): description`; the scope is optional. Examples:

```text
feat(map): add street basemap
fix(api): handle unavailable address provider
chore(tooling): enforce contribution workflow
docs: explain local startup
```

Types come from `@commitlint/config-conventional`: `build`, `chore`, `ci`, `docs`, `feat`, `fix`, `perf`, `refactor`, `revert`, `style` and `test`. Mark a breaking change with `!` after the type/scope or a `BREAKING CHANGE:` footer. Both individual PR commits and the PR title are validated.

## Local checks

Run `npm ci` with the Node and npm versions in the root README. The prepare lifecycle installs Husky hooks automatically.

- `pre-commit`: rejects `main` and detached HEAD, runs lint-staged to format staged files with Prettier, then runs workspace typechecking and the full unit/integration suite through Nx.
- `commit-msg`: validates the proposed commit message with commitlint.
- `pre-merge-commit`: blocks local merge commits; merge PRs on GitHub.
- `pre-push`: rejects any push targeting `refs/heads/main`, including a feature-branch refspec targeting `main`.

Prettier formats staged files and lint-staged stages the results while preserving unstaged changes. Generated files, vendored agent skills and original standalone prototypes are excluded through `.prettierignore`. `npm run format` formats changed files; `npm run format:check` checks them. Formatting uses the repository's existing double quotes, two-space indentation and trailing commas, with LF line endings. Git attributes keep hook scripts portable on Windows and Linux.

The GitHub PR workflow validates commit messages and the PR title, checks changed file formatting, runs typecheck, lint, tests and production builds, and exercises Chromium against both development servers. CI and container installs skip local hook installation; production-only installs do not require Husky.

## GitHub protection

Local hooks can be bypassed by other clients, so enforce the same workflow on GitHub's `main` branch:

- Require a pull request before merging and apply the rule to administrators.
- Require the `Conventional Commits` and `Quality` status checks, with the branch up to date before merging.
- Block force pushes and branch deletion.
- Use squash merging with the PR title as the default commit title.

These are repository settings, not effects of committing this file or the workflow. They require an existing GitHub remote and repository administration access. Until configured on GitHub, the local hooks and PR workflow provide the checks but server-side enforcement is not active.

References: [Conventional Commits](https://www.conventionalcommits.org/en/v1.0.0/), [Husky](https://typicode.github.io/husky/), [lint-staged](https://github.com/lint-staged/lint-staged), [commitlint](https://commitlint.js.org/), and [GitHub protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches).
