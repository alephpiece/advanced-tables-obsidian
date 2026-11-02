# Formatter extension

The published `@tgrosinger/md-advanced-tables` package does not expose a way to
size delimiter bars independently of source cell padding. The adjacent pnpm
patch adds an optional `Options.delimiterContent` projection to its normal
formatter and TypeScript declaration. The formatter measures the projection's
longest line with its existing Unicode width rules and minimum delimiter width.
When the projection is absent, or when weak formatting is selected, the
original behavior applies.

This hook runs in the shared formatter so commands, navigation, formulas and
bulk formatting use the same table model and cursor offsets. Display text
parsing lives in `src/visible-text.ts`; the dependency patch contains no
Obsidian-specific parsing.

`pnpm install --frozen-lockfile` applies the patch through
`pnpm-workspace.yaml` and the lockfile. When upgrading the dependency, port the
hook with `pnpm patch` / `pnpm patch-commit`, then run `pnpm test` and
`pnpm build`. The test runner bundles the actual patched dependency rather
than a replacement formatter.
