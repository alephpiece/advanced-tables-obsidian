import { ObsidianTextEditor } from './obsidian-text-editor';
import { TableEditorPluginSettings } from './settings';
import {
  Alignment,
  Options,
  SortOrder,
  TableEditor as MTEEditor,
} from '@tgrosinger/md-advanced-tables';
import { App, Editor, Modal, Notice, TFile } from 'obsidian';

export class TableEditor {
  private readonly app: App;
  private readonly settings: TableEditorPluginSettings;
  private readonly mte: MTEEditor;
  private readonly getOptions: () => Options;

  constructor(
    app: App,
    file: TFile,
    editor: Editor,
    settings: TableEditorPluginSettings,
  ) {
    this.app = app;
    this.settings = settings;
    this.getOptions = () => settings.asOptions(() => editor.getValue());

    const ote = new ObsidianTextEditor(app, file, editor);
    this.mte = new MTEEditor(ote);
  }

  public readonly cursorIsInTableFormula = (): boolean =>
    this.mte.cursorIsInTableFormula(this.getOptions());

  public readonly cursorIsInTable = (): boolean =>
    this.mte.cursorIsInTable(this.getOptions());

  public readonly nextCell = (): void => {
    this.mte.nextCell(this.getOptions());
  };

  public readonly previousCell = (): void => {
    this.mte.previousCell(this.getOptions());
  };

  public readonly nextRow = (): void => {
    this.mte.nextRow(this.getOptions());
  };

  public readonly formatTable = (): void => {
    this.mte.format(this.getOptions());
  };

  public readonly formatAllTables = (): void => {
    this.mte.formatAll(this.getOptions());
  };

  public readonly insertColumn = (): void => {
    this.mte.insertColumn(this.getOptions());
  };

  public readonly insertRow = (): void => {
    this.mte.insertRow(this.getOptions());
  };

  public readonly leftAlignColumn = (): void => {
    this.mte.alignColumn(Alignment.LEFT, this.getOptions());
  };

  public readonly centerAlignColumn = (): void => {
    this.mte.alignColumn(Alignment.CENTER, this.getOptions());
  };

  public readonly rightAlignColumn = (): void => {
    this.mte.alignColumn(Alignment.RIGHT, this.getOptions());
  };

  public readonly moveColumnLeft = (): void => {
    this.mte.moveColumn(-1, this.getOptions());
  };

  public readonly moveColumnRight = (): void => {
    this.mte.moveColumn(1, this.getOptions());
  };

  public readonly moveRowUp = (): void => {
    this.mte.moveRow(-1, this.getOptions());
  };

  public readonly moveRowDown = (): void => {
    this.mte.moveRow(1, this.getOptions());
  };

  public readonly deleteColumn = (): void => {
    this.mte.deleteColumn(this.getOptions());
  };

  public readonly deleteRow = (): void => {
    this.mte.deleteRow(this.getOptions());
  };

  public readonly sortRowsAsc = (): void => {
    this.mte.sortRows(SortOrder.Ascending, this.getOptions());
  };

  public readonly sortRowsDesc = (): void => {
    this.mte.sortRows(SortOrder.Descending, this.getOptions());
  };

  public readonly transpose = (): void => {
    this.mte.transpose(this.getOptions());
  };

  public readonly escape = (): void => {
    this.mte.escape(this.getOptions());
  };

  public readonly evaluateFormulas = (): void => {
    const err = this.mte.evaluateFormulas(this.getOptions());
    if (err) {
      new Notice(err.message);
    }
  };

  public readonly exportCSVModal = (): void => {
    new CSVModal(this.app, this.mte, this.settings).open();
  };
}

class CSVModal extends Modal {
  private readonly mte: MTEEditor;
  private readonly settings: TableEditorPluginSettings;

  constructor(app: App, mte: MTEEditor, settings: TableEditorPluginSettings) {
    super(app);
    this.mte = mte;
    this.settings = settings;
  }

  public onOpen(): void {
    const { contentEl } = this;
    const div = contentEl.createDiv({
      cls: 'advanced-tables-csv-export',
    });

    const ta = div.createEl('textarea', {
      attr: {
        readonly: true,
      },
    });
    ta.value = this.mte.exportCSV(true, this.settings.asOptions());
    ta.onClickEvent(() => ta.select());

    const lb = div.createEl('label');
    const cb = lb.createEl('input', {
      type: 'checkbox',
      attr: {
        checked: true,
      },
    });
    lb.createSpan().setText('Include table headers');
    cb.onClickEvent(() => {
      ta.value = this.mte.exportCSV(cb.checked, this.settings.asOptions());
    });
  }

  public onClose(): void {
    const { contentEl } = this;
    contentEl.empty();
  }
}
