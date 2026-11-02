import { referenceEnvironment } from '../src/reference-cache';
import { TableEditorPluginSettings } from '../src/settings';
import { createVisibleTextProjector } from '../src/visible-text';
import {
  Alignment,
  completeTable,
  formatTable,
  FormatType,
  ITextEditor,
  Options,
  Point,
  Range,
  readTable,
  SortOrder,
  TableEditor,
} from '@tgrosinger/md-advanced-tables';
import MarkdownIt from 'markdown-it';
import assert from 'node:assert/strict';
import test from 'node:test';

const project = createVisibleTextProjector();
const examples = [
  ['[说明](https://example.com/a/very/long/path "Title")', '说明'],
  ['[**说明** and *more*](https://example.com/a_(b))', '说明 and more'],
  ['[a [bracket] label](<https://example.com/path>)', 'a [bracket] label'],
  ['[empty]()', 'empty'],
  ['[[some/long/note#Heading\\|说明]]', '说明'],
  ['[[some/long/note|  Alias  ]]', 'Alias'],
  [
    '[[Folder/Note.md#Heading#Subheading]]',
    'Folder/Note.md > Heading > Subheading',
  ],
  ['[[#Heading]]', 'Heading'],
  ['[[Note#^block]]', 'Note > ^block'],
  ['[[Note|**literal**]]', '**literal**'],
  [
    '**bold** *italic* __strong__ _emphasis_ ~~deleted~~',
    'bold italic strong emphasis deleted',
  ],
  ['==highlight **and bold**==', 'highlight and bold'],
  ['**bold ==and highlight==**', 'bold and highlight'],
  ['x ==highlight== y', 'x highlight y'],
  ['a == b', 'a == b'],
  ['==unfinished', '==unfinished'],
  ['snake_case and a_b_c', 'snake_case and a_b_c'],
  ['`[literal](long-url) **code**`', '[literal](long-url) **code**'],
  ['``a ` b``', 'a ` b'],
  ['`==literal==`', '==literal=='],
  ['\\*literal\\* and a\\|b', '*literal* and a|b'],
  ['\\[label](https://example.com)', '[label](https://example.com)'],
  ['<https://example.com/path>', 'https://example.com/path'],
  ['https://example.com/path', 'https://example.com/path'],
  ['&amp; &#65; &#x4E2D;', '& A 中'],
  ['abc<br>de<BR />f', 'abc\nde\nf'],
  ['`a<br>b`', 'a<br>b'],
  [
    '![alt](https://example.com/large.png "Title")',
    '![alt](https://example.com/large.png "Title")',
  ],
  ['[link](long-url) ![alt](image.png)', '[link](long-url) ![alt](image.png)'],
  ['![[some/embedded/note\\|alias]]', '![[some/embedded/note\\|alias]]'],
  ['$a_b * c$', '$a_b * c$'],
  ['$$a_b * c$$', '$$a_b * c$$'],
  ['$5 [label](https://example.com/long/path) $10', '$5 label $10'],
  ['$ [label](https://example.com/long/path) $', '$ label $'],
  ['$a [label](https://example.com/long/path) $', '$a label $'],
  ['[unfinished](https://example.com', '[unfinished](https://example.com'],
  ['[[unfinished', '[[unfinished'],
  ['<span>text</span>', '<span>text</span>'],
];

for (const [source, expected] of examples) {
  test(`display text: ${source}`, () => {
    assert.equal(project(source), expected);
  });
}

test('reference links use definitions from the document, including collapsed and shortcut links', () => {
  const fromDocument = createVisibleTextProjector(
    () =>
      '[guide]: https://example.com/very/long/path "Guide"\n[Other Label]: /target',
  );
  assert.equal(fromDocument('[**说明**][guide]'), '说明');
  assert.equal(fromDocument('[guide][]'), 'guide');
  assert.equal(fromDocument('[guide]'), 'guide');
  assert.equal(fromDocument('[label][other   LABEL]'), 'label');
  assert.equal(fromDocument('[label][missing]'), '[label][missing]');
});

test('definitions in code blocks are ignored and definitions inside blockquotes work', () => {
  const fromDocument = createVisibleTextProjector(
    () => '```md\n[fake]: /target\n```\n\n> [real]: /target',
  );
  assert.equal(fromDocument('[label][fake]'), '[label][fake]');
  assert.equal(fromDocument('[label][real]'), 'label');
  const quoted = createVisibleTextProjector(() => '> [real]: /target');
  assert.equal(quoted('[label][real]'), 'label');
});

test('the document is read only for possible reference links, once per action', () => {
  let reads = 0;
  const fromDocument = createVisibleTextProjector(() => {
    reads++;
    return '[ref]: /target';
  });
  assert.equal(fromDocument('**plain**'), 'plain');
  assert.equal(fromDocument('[label](url)'), 'label');
  assert.equal(fromDocument('[[Note\\|alias]]'), 'alias');
  assert.equal(fromDocument('`[ref]`'), '[ref]');
  assert.equal(fromDocument('$[ref]$'), '$[ref]$');
  assert.equal(reads, 0);
  assert.equal(fromDocument('**[label][ref]**'), 'label');
  assert.equal(fromDocument('[label][ref]'), 'label');
  fromDocument('[label][ref]');
  fromDocument('**different**');
  assert.equal(reads, 1);
});

test('long price lists preserve text and still parse a following link', () => {
  const prices = Array.from({ length: 3000 }, (_, i) => `$${i + 1}`).join(' ');
  assert.equal(project(`${prices} [label](url)`), `${prices} label`);
});

test('failed math scans respect link-label bounds, delimiters and escapes', () => {
  assert.equal(project('[cost $1](url) [cost $2](url)'), 'cost $1 cost $2');
  assert.equal(project('[a $$x$$](url) and $1'), 'a $$x$$ and $1');
  assert.equal(project('\\$1 $2 [label](url)'), '$1 $2 label');
});

const settings = (enabled = true): TableEditorPluginSettings =>
  new TableEditorPluginSettings({ useVisibleDelimiterWidth: enabled });

const formatted = (
  lines: string[],
  options = settings().asOptions(),
): string[] =>
  formatTable(
    completeTable(readTable(lines, options), options).table,
    options,
  ).table.toLines();

test('old settings keep the feature off and weak mode ignores it', () => {
  const oldSettings = new TableEditorPluginSettings({});
  assert.equal(oldSettings.useVisibleDelimiterWidth, false);
  assert.equal(oldSettings.asOptions().delimiterContent, undefined);
  const weak = new TableEditorPluginSettings({
    useVisibleDelimiterWidth: true,
    formatType: FormatType.WEAK,
  });
  assert.equal(weak.asOptions().delimiterContent, undefined);
  assert.equal(
    formatted(
      ['| A | B |', '| --- | --- |', '| [说明](long-url) | abcdef |'],
      weak.asOptions(),
    )[1],
    '| --- | --- |',
  );
});

test('only delimiter bars change; source padding, links and alignment stay intact', () => {
  const source = [
    '| A | B |',
    '| :--- | ---: |',
    '| [说明](https://example.com/long/path) | abcdef |',
  ];
  const original = formatted(source, settings(false).asOptions());
  const visible = formatted(source);
  assert.equal(visible[1], '|:---- | ------:|');
  assert.deepEqual([visible[0], visible[2]], [original[0], original[2]]);
  assert.deepEqual(formatted(visible), visible);
});

test('column widths include headers, Unicode widths and the longest displayed line', () => {
  const source = [
    '| Header | 中 | C |',
    '| --- | :---: | --- |',
    '| [x](url) | [[long/note\\|中文]] | ab<br>cdef |',
  ];
  assert.equal(formatted(source)[1], '| ------ |:----:| ---- |');
  const combining = ['| A |', '| --- |', '| **e\u0301abc** |'];
  assert.equal(formatted(combining)[1], '| ---- |');
});

test('new Wiki aliases stay stable when the kernel escapes their pipes', () => {
  const result = formatted(['| A |', '| --- |', '| [[long/note|alias]] |']);
  assert.equal(result[1], '| ----- |');
  assert.ok(result[2].includes('[[long/note\\|alias]]'));
  assert.deepEqual(formatted(result), result);
});

test('price text with a link uses the label width and preserves the source', () => {
  const source = [
    '| A |',
    '| --- |',
    '| $5 [label](https://example.com/long/path) $10 |',
  ];
  const result = formatted(source);
  assert.equal(result[1], '| ------------ |');
  assert.equal(result[2], formatted(source, settings(false).asOptions())[2]);
});

test('code spans remove one table pipe escape and preserve other backslashes', () => {
  const cases = [
    ['`a\\|b`', '| --- |'],
    ['`a\\|b\\|c`', '| ----- |'],
    ['`a\\\\|b`', '| ---- |'],
    ['`a\\\\\\|b`', '| ----- |'],
    ['`a\\*b`', '| ---- |'],
  ];
  for (const [content, delimiter] of cases) {
    const source = ['| A |', '| --- |', `| ${content} |`];
    const result = formatted(source);
    assert.equal(result[1], delimiter, content);
    assert.equal(
      result[2],
      formatted(source, settings(false).asOptions())[2],
      content,
    );
  }
});

test('plain tables and unsupported content retain their normal delimiter widths', () => {
  for (const content of [
    'ordinary text',
    '$a_b * c$',
    '![alt](image.png)',
    '![[Note]]',
  ]) {
    const source = ['| A |', '| --- |', `| ${content} |`];
    assert.deepEqual(
      formatted(source),
      formatted(source, settings(false).asOptions()),
    );
  }
});

class MemoryEditor implements ITextEditor {
  public lines: string[];
  public cursor = new Point(0, 2);
  public selection: Range | undefined;
  private readonly editable: (row: number) => boolean;

  constructor(
    lines: string[],
    editable: (row: number) => boolean = () => true,
  ) {
    this.lines = lines.slice();
    this.editable = editable;
  }

  public getCursorPosition(): Point {
    return this.cursor;
  }
  public setCursorPosition(pos: Point): void {
    this.cursor = pos;
    this.selection = undefined;
  }
  public setSelectionRange(range: Range): void {
    this.selection = range;
    this.cursor = range.end;
  }
  public getLastRow(): number {
    return this.lines.length - 1;
  }
  public acceptsTableEdit(row: number): boolean {
    return this.editable(row);
  }
  public getLine(row: number): string {
    return this.lines[row];
  }
  public insertLine(row: number, line: string): void {
    this.lines.splice(row, 0, line);
  }
  public deleteLine(row: number): void {
    this.lines.splice(row, 1);
  }
  public replaceLines(start: number, end: number, lines: string[]): void {
    this.lines.splice(start, end - start, ...lines);
  }
  public transact(func: () => void): void {
    func();
  }
}

const editorOptions = (editor: MemoryEditor): Options =>
  settings().asOptions(() => editor.lines.join('\n'), editor);

test('typing in a cell and pressing Tab keeps reference definitions reusable', () => {
  const editor = new MemoryEditor([
    '| A | B |',
    '| --- | --- |',
    '| [one][ref] | 1 |',
    '',
    '[ref]: /target',
  ]);
  const table = new TableEditor(editor);
  table.format(editorOptions(editor));
  const markdown = new MarkdownIt({ html: true });
  const initial = referenceEnvironment(
    markdown,
    editor.lines.join('\n'),
    editor,
  );
  for (const label of ['longer', 'even longer', 'last']) {
    editor.lines[2] = `| [${label}][ref] | 1 |`;
    editor.cursor = new Point(2, 3);
    table.nextCell(editorOptions(editor));
    assert.equal(
      referenceEnvironment(markdown, editor.lines.join('\n'), editor),
      initial,
    );
    assert.equal(
      editor.lines[1],
      `| ${'-'.repeat(Math.max(3, label.length))} | --- |`,
    );
  }
  editor.lines[4] = 'Reference deleted';
  table.format(editorOptions(editor));
  assert.ok(editor.lines[1].includes('-'.repeat('[last][ref]'.length)));
});

test('Tab selects the same source cell with the feature on or off', () => {
  const source = [
    '| A | B |',
    '| --- | --- |',
    '| [说明](https://example.com/long/path) | second |',
  ];
  const visible = new MemoryEditor(source);
  const normal = new MemoryEditor(source);
  visible.cursor = normal.cursor = new Point(2, 4);
  new TableEditor(visible).nextCell(editorOptions(visible));
  new TableEditor(normal).nextCell(settings(false).asOptions());
  assert.deepEqual(visible.selection, normal.selection);
  assert.deepEqual(visible.cursor, normal.cursor);
  assert.equal(visible.lines[1], '| ---- | ------ |');
});

test('formatting keeps a cursor in the same delimiter cell and clamps its offset', () => {
  const source = [
    '| [label](https://example.com/long/path) | B |',
    '| --------------------------------------- | --------- |',
    '| x | y |',
  ];
  const editor = new MemoryEditor(source);
  editor.cursor = new Point(1, source[1].lastIndexOf('---------') + 6);
  new TableEditor(editor).format(editorOptions(editor));
  assert.equal(editor.lines[1], '| ----- | --- |');
  assert.equal(editor.cursor.row, 1);
  assert.equal(editor.cursor.column, 13);
});

test('row/column edits and alignment use visible widths immediately', () => {
  const editor = new MemoryEditor([
    '| A | B |',
    '| --- | --- |',
    '| [label](https://example.com/long/path) | abcdef |',
  ]);
  const table = new TableEditor(editor);
  table.insertRow(editorOptions(editor));
  assert.equal(editor.lines[1], '| ----- | ------ |');
  editor.cursor = new Point(2, 2);
  table.insertColumn(editorOptions(editor));
  assert.equal(editor.lines[1], '| --- | ----- | ------ |');
  table.alignColumn(Alignment.CENTER, editorOptions(editor));
  assert.equal(editor.lines[1], '|:---:| ----- | ------ |');
  table.deleteColumn(editorOptions(editor));
  assert.equal(editor.lines[1], '| ----- | ------ |');
});

test('sorting preserves link source and visible widths', () => {
  const editor = new MemoryEditor([
    '| A | B |',
    '| --- | --- |',
    '| z | [longer](url) |',
    '| a | [[Note\\|short]] |',
  ]);
  const table = new TableEditor(editor);
  editor.cursor = new Point(2, 2);
  table.sortRows(SortOrder.Ascending, editorOptions(editor));
  assert.equal(editor.lines[1], '| --- | ------ |');
  assert.ok(editor.lines[2].includes('[[Note\\|short]]'));
  assert.ok(editor.lines[3].includes('[longer](url)'));
});

test('formula evaluation and CSV export preserve the underlying cell content', () => {
  const editor = new MemoryEditor([
    '| A | B |',
    '| --- | --- |',
    '| [label](long-url) | 1 |',
    '| total | |',
    '<!-- TBLFM: @3$2=2 -->',
  ]);
  const table = new TableEditor(editor);
  const error = table.evaluateFormulas(editorOptions(editor));
  assert.equal(error, undefined);
  assert.equal(editor.lines[1], '| ----- | --- |');
  assert.ok(editor.lines[2].includes('[label](long-url)'));
  assert.equal(
    readTable(editor.lines.slice(0, 4), editorOptions(editor)).getCellAt(3, 1)
      ?.content,
    '2',
  );
  assert.ok(
    table.exportCSV(true, editorOptions(editor))?.includes('[label](long-url)'),
  );
});

test('format all handles document references, repeated formatting and excluded code blocks', () => {
  const source = [
    '| A | B |',
    '| --- | --- |',
    '| [first][ref] | other |',
    '',
    '```md',
    '| A |',
    '| --- |',
    '| [literal](url) |',
    '```',
    '',
    '| C | D |',
    '| --- | --- |',
    '| [[Note\\|alias]] | last |',
    '',
    '[ref]: https://example.com/a/long/path',
  ];
  const editor = new MemoryEditor(source, (row) => row < 4 || row > 8);
  const table = new TableEditor(editor);
  table.formatAll(editorOptions(editor));
  assert.equal(editor.lines[1], '| ----- | ----- |');
  assert.equal(editor.lines[11], '| ----- | ---- |');
  assert.deepEqual(editor.lines.slice(4, 9), source.slice(4, 9));
  const once = editor.lines.slice();
  table.formatAll(editorOptions(editor));
  assert.deepEqual(editor.lines, once);
});
