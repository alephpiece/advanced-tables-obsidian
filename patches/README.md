# Formatter extension

The published `@tgrosinger/md-advanced-tables` package measures Markdown source
when sizing columns and padding cells. The adjacent pnpm patch adds an optional
`TextWidthOptions.displayText` projection to its shared width calculation and
TypeScript declaration. Column widths, delimiter bars and alignment padding
all use the projection's longest line, with the existing Unicode width rules
and minimum delimiter width. When the projection is absent, the original
behavior applies. The plugin supplies it only for normal formatting.

This hook measures text without changing cell contents. Commands, navigation,
formulas and bulk formatting retain the same table model, and cursor tracking
continues to use source text. Display text parsing and the exclusion of
default-ignorable Unicode characters live in `src/visible-text.ts`; the
dependency patch contains no Obsidian-specific parsing.

`pnpm install --frozen-lockfile` applies the patch through
`pnpm-workspace.yaml` and the lockfile. When upgrading the dependency, port the
hook with `pnpm patch` / `pnpm patch-commit`, then run `pnpm test` and
`pnpm build`. The test runner bundles the actual patched dependency rather
than a replacement formatter.
