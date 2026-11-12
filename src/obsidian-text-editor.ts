import { ensureSyntaxTree } from '@codemirror/language';
import type { EditorView } from '@codemirror/view';
import { Point, Range } from '@tgrosinger/md-advanced-tables';
import type { Editor, EditorPosition } from 'obsidian';

interface LegacyCodeMirror {
  getTokenAt(
    position: EditorPosition,
    precise: boolean,
  ): { type: string | null };
}

const protectedToken =
  /(?:^|[ _-])(?:math|codeblock|indented-code|frontmatter|inline-code)(?:$|[ _-])/i;

/**
 * ObsidianTextEditor is an implementation of the ITextEditor interface from
 * the mte-kernel library. It teaches the table editor library how to interface
 * with Obsidian.
 */
export class ObsidianTextEditor {
  private readonly editor: Editor;
  private readonly hasOptOut: boolean;

  constructor(editor: Editor) {
    this.editor = editor;
    // Each adapter serves one command; table edits cannot add marker lines.
    this.hasOptOut = editor.getValue().includes('-tx-');
  }

  public getCursorPosition = (): Point => {
    const position = this.editor.getCursor();
    return new Point(position.line, position.ch);
  };

  public setCursorPosition = (pos: Point): void => {
    this.editor.setCursor({ line: pos.row, ch: pos.column });
  };

  public setSelectionRange = (range: Range): void => {
    this.editor.setSelection(
      { line: range.start.row, ch: range.start.column },
      { line: range.end.row, ch: range.end.column },
    );
  };

  public getLastRow = (): number => this.editor.lastLine();

  public acceptsTableEdit = (row: number): boolean => {
    // Obsidian documents editor.cm, but does not expose it in Editor's types.
    // @ts-expect-error, not typed by Obsidian
    const cm: EditorView | LegacyCodeMirror | undefined = this.editor.cm;
    if (!cm) {
      return false;
    }
    const text = this.getLine(row);
    const column = Math.max(0, text.search(/\S/));
    if ('getTokenAt' in cm) {
      if (
        protectedToken.test(
          cm.getTokenAt({ line: row, ch: column + 1 }, true).type ?? '',
        )
      ) {
        return false;
      }
    } else {
      const { state } = cm;
      // Parse through the inspected line, even outside the viewport. A partial
      // tree must never turn unknown context into permission to rewrite text.
      const line = state.doc.line(row + 1);
      const tree = ensureSyntaxTree(state, line.to, Infinity);
      if (!tree) {
        return false;
      }
      // Inspect the leading pipe's context, not math/code inside a table cell.
      for (
        let node = tree.resolveInner(line.from + column, 1);
        node;
        node = node.parent
      ) {
        if (protectedToken.test(node.name)) {
          return false;
        }
      }
    }

    // Preserve the -tx- opt-out using current lines, without cached positions.
    // https://github.com/tgrosinger/advanced-tables-obsidian/issues/133
    if (!this.hasOptOut) {
      return true;
    }
    let firstRow = row;
    while (firstRow > 0 && /^\s*\|/.test(this.getLine(firstRow - 1))) {
      firstRow--;
    }
    return firstRow === 0 || this.getLine(firstRow - 1) !== '-tx-';
  };

  public getLine = (row: number): string => this.editor.getLine(row);

  public insertLine = (row: number, line: string): void => {
    if (row > this.getLastRow()) {
      this.editor.replaceRange('\n' + line, { line: row, ch: 0 });
    } else {
      this.editor.replaceRange(line + '\n', { line: row, ch: 0 });
    }
  };

  public deleteLine = (row: number): void => {
    // If on the last line of the file, we cannot replace to the next row.
    // Instead, replace all the contents of this line.
    if (row === this.getLastRow()) {
      const rowContents = this.getLine(row);
      this.editor.replaceRange(
        '',
        { line: row, ch: 0 },
        { line: row, ch: rowContents.length },
      );
    } else {
      this.editor.replaceRange(
        '',
        { line: row, ch: 0 },
        { line: row + 1, ch: 0 },
      );
    }
  };

  public replaceLines = (
    startRow: number,
    endRow: number,
    lines: string[],
  ): void => {
    // Take one off the endRow and instead go to the end of that line
    const realEndRow = endRow - 1;
    const endRowContents = this.editor.getLine(realEndRow);
    const endRowFinalIndex = endRowContents.length;

    this.editor.replaceRange(
      lines.join('\n'),
      { line: startRow, ch: 0 },
      { line: realEndRow, ch: endRowFinalIndex },
    );
  };

  public transact = (func: () => void): void => {
    /*
    this.editor.operation(() => {
      func();
    });
    */
    func();
  };
}
