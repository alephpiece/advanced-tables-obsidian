import { ObsidianTextEditor } from '../src/obsidian-text-editor';
import { ensureSyntaxTree, StreamLanguage } from '@codemirror/language';
import { EditorState } from '@codemirror/state';
import {
  optionsWithDefaults,
  readTable,
  TableEditor,
} from '@tgrosinger/md-advanced-tables';
import assert from 'node:assert/strict';
import test from 'node:test';
import type { Editor, EditorPosition } from 'obsidian';

// Obsidian supplies its own Markdown parser. This fixture emits its token
// names through real CodeMirror syntax trees and incremental transactions.
const language = StreamLanguage.define({
  startState: () => ({ block: '' }),
  token: (stream, state): string | null => {
    if (stream.sol()) {
      const text = stream.string.trim();
      if (state.block) {
        const block = state.block;
        if (
          (block === 'math' && text === '$$') ||
          (block === 'hmd-codeblock' && text.startsWith('```'))
        ) {
          state.block = '';
        }
        stream.skipToEnd();
        return `${block} string`;
      }
      state.block =
        text === '$$' ? 'math' : text.startsWith('```') ? 'hmd-codeblock' : '';
      if (state.block) {
        stream.skipToEnd();
        return `${state.block} string`;
      }
    }
    if (stream.match(/^\$[^$]+\$/)) return 'math string';
    if (stream.match(/^`[^`]+`/)) return 'inline-code string';
    stream.next();
    return null;
  },
  tokenTable: {
    math: [],
    'hmd-codeblock': [],
    'inline-code': [],
  },
});

class EditorFixture {
  public readonly cm: { state: EditorState };
  public cursor: EditorPosition = { line: 0, ch: 0 };
  public readonly adapter: ObsidianTextEditor;
  public readonly table: TableEditor;

  constructor(lines: string[]) {
    this.cm = {
      state: EditorState.create({
        doc: lines.join('\n'),
        extensions: [language],
      }),
    };
    this.adapter = new ObsidianTextEditor(this as unknown as Editor);
    this.table = new TableEditor(this.adapter);
  }

  public get lines(): string[] {
    return this.getValue().split('\n');
  }
  public getValue(): string {
    return this.cm.state.doc.toString();
  }
  public getLine(row: number): string {
    return this.cm.state.doc.line(row + 1).text;
  }
  public lastLine(): number {
    return this.cm.state.doc.lines - 1;
  }
  public getCursor(): EditorPosition {
    return this.cursor;
  }
  public setCursor(position: EditorPosition): void {
    this.cursor = position;
  }
  public setSelection(_start: EditorPosition, end: EditorPosition): void {
    this.cursor = end;
  }
  public replaceRange(text: string, from: EditorPosition, to = from): void {
    const offset = (position: EditorPosition): number =>
      position.line > this.lastLine()
        ? this.cm.state.doc.length
        : this.cm.state.doc.line(position.line + 1).from + position.ch;
    this.cm.state = this.cm.state.update({
      changes: { from: offset(from), to: offset(to), insert: text },
    }).state;
  }
}

const options = optionsWithDefaults({});
const math = ['$$', '|x|', '$$'];

test('format all protects math without metadata and allows math inside real table cells', () => {
  const editor = new EditorFixture([
    ...math,
    '',
    '|A|B|',
    '|---|---|',
    '| $x$ | `code` |',
    '<!-- TBLFM: @2$1=2 -->',
    '',
  ]);
  assert.equal(editor.adapter.acceptsTableEdit(6), true);
  assert.equal(editor.adapter.acceptsTableEdit(7), true);
  editor.table.formatAll(options);
  assert.deepEqual(editor.lines.slice(0, 3), math);
  assert.equal(editor.lines[4], '| A   | B      |');
  const table = readTable(editor.lines.slice(4, 7), options);
  assert.equal(table.getCellAt(2, 0)?.content, '$x$');
  assert.equal(table.getCellAt(2, 1)?.content, '`code`');
});

test('format all uses current syntax after earlier tables insert separator rows', () => {
  const source = [
    '| a |',
    'text a',
    '',
    '| b |',
    'text b',
    '',
    '| c |',
    'text c',
    'more text c',
    '',
    ...math,
    '',
    'tail paragraph',
    'tail line two',
    'tail line three',
    '',
    '| D |',
    '| --- |',
    '| value |',
    '',
  ];
  const editor = new EditorFixture(source);
  ensureSyntaxTree(editor.cm.state, editor.cm.state.doc.length, Infinity);
  editor.table.formatAll(options);
  assert.equal(editor.lines.length, source.length + 3);
  assert.ok(editor.getValue().includes(math.join('\n')));
  assert.ok(editor.getValue().includes('| D     |\n| ----- |\n| value |'));
});

test('formatting and Tab or Enter inside a math block never start a table', () => {
  for (const action of ['format', 'nextCell', 'nextRow'] as const) {
    const editor = new EditorFixture(math);
    editor.cursor = { line: 1, ch: 2 };
    assert.equal(editor.table.cursorIsInTable(options), false);
    editor.table[action](options);
    assert.deepEqual(editor.lines, math);
    assert.deepEqual(editor.cursor, { line: 1, ch: 2 });
  }
});

test('math delimiters inside code do not affect code or a following table', () => {
  const block = ['```text', ...math, '```'];
  const editor = new EditorFixture([...block, '', '|A|', '|---|', '|1|', '']);
  editor.table.formatAll(options);
  assert.deepEqual(editor.lines.slice(0, block.length), block);
  assert.equal(editor.lines[block.length + 1], '| A   |');
});

test('the -tx- opt-out follows current table boundaries', () => {
  const marked = ['-tx-', '|A|', '|---|', '|1|'];
  const editor = new EditorFixture([...marked, '', '|B|', '|---|', '|2|', '']);
  editor.table.formatAll(options);
  assert.deepEqual(editor.lines.slice(0, marked.length), marked);
  assert.equal(editor.lines[5], '| B   |');
});

test('missing syntax information cannot grant permission to rewrite a line', () => {
  const editor = new EditorFixture(math);
  editor.cm.state = EditorState.create({ doc: editor.getValue() });
  assert.equal(editor.adapter.acceptsTableEdit(1), false);
});

test('legacy editors request a precise token from the current document', () => {
  let precise: boolean | undefined;
  const editor = {
    cm: {
      getTokenAt: (
        _position: EditorPosition,
        accurate: boolean,
      ): { type: string } => {
        precise = accurate;
        return { type: 'math' };
      },
    },
    getValue: (): string => '|x|',
    getLine: (): string => '|x|',
  };
  assert.equal(
    new ObsidianTextEditor(editor as unknown as Editor).acceptsTableEdit(0),
    false,
  );
  assert.equal(precise, true);
});
