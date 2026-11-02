# Advanced Tables Help

The Advanced Tables plugin for Obsidian adds a lot of new features to editing
Markdown tables within Obsidian, while maintaining full compatibility
with Markdown.

As commonly ask questions arise they will be added below:

## Using Formulas in Markdown Tables

Formulas are written on the line immediately following the table. For more
information on the formula syntax please take a look at [this
document](https://github.com/tgrosinger/md-advanced-tables/blob/main/docs/formulas.md)
which contains detailed explanation and helpful examples.

<https://github.com/tgrosinger/md-advanced-tables/blob/main/docs/formulas.md>

Evaluating formulas is done using the formulas button in the toolbar.

![evaluate formulas button](https://raw.githubusercontent.com/tgrosinger/advanced-tables-obsidian/main/resources/screenshots/evaluate-formulas-button.png)

## Sorting Rows

When using the sort option in the toolbar, the sort will be performed based
on the column the cursor is currently in.

## Estimate Delimiter Width from Visible Text

Enable **Estimate delimiter width from visible text** in the plugin settings
to size the separator row's dashes using displayed text instead of link URLs
and formatting markers. This option is off by default and requires
**Pad cell width using spaces** to be enabled. It takes effect on the next
table operation, including Tab/Enter navigation and formatting all tables.

The estimate supports Markdown links, Wiki links and aliases, reference links
defined in the same note, bold, italics, strikethrough, highlights, inline code,
escapes and HTML entities. A `<br>` separates displayed lines; the longest line
determines the width. Unicode text uses the existing formatter's width rules.
Unaliased Wiki links retain explicit paths and extensions, with heading and
block subpaths separated by ` > `, as in Obsidian.

Only the separator row's dash counts change. Cell padding still aligns source
text, so separator pipes may no longer line up with the other rows. This can
improve exported column proportions in Pandoc workflows that infer widths from
dash counts; it is an estimate, not a measurement of a particular font or page.
Images (including the rest of their cell), embeds, math and unsupported HTML
retain their source text for width estimation.

## Additional Questions

If you have additional questions which are not covered here, please [create
an issue](https://github.com/tgrosinger/advanced-tables-obsidian/issues/new/choose),
or reach out to me directly on the Obsidian discord. My username is
tgrosinger.
