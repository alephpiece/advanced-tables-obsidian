import { createVisibleTextProjector } from './visible-text';
import {
  FormatType,
  Options,
  optionsWithDefaults,
} from '@tgrosinger/md-advanced-tables';

export const defaultSettings: Partial<ISettings> = {
  formatType: FormatType.NORMAL,
  useVisibleDelimiterWidth: false,
  showRibbonIcon: true,
  bindEnter: true,
  bindTab: true,
};

export interface ISettings {
  formatType: FormatType;
  useVisibleDelimiterWidth: boolean;
  showRibbonIcon: boolean;
  bindEnter: boolean;
  bindTab: boolean;
}

export class TableEditorPluginSettings implements ISettings {
  public formatType: FormatType;
  public useVisibleDelimiterWidth: boolean;
  public showRibbonIcon: boolean;

  public bindEnter: boolean;
  public bindTab: boolean;

  constructor(loadedData: Partial<ISettings>) {
    const allFields = { ...defaultSettings, ...loadedData };
    this.formatType = allFields.formatType;
    this.useVisibleDelimiterWidth = allFields.useVisibleDelimiterWidth;
    this.showRibbonIcon = allFields.showRibbonIcon;
    this.bindEnter = allFields.bindEnter;
    this.bindTab = allFields.bindTab;
  }

  public asOptions(
    getDocument: () => string = () => '',
    referenceCacheKey?: object,
  ): Options {
    return optionsWithDefaults({
      formatType: this.formatType,
      delimiterContent:
        this.useVisibleDelimiterWidth && this.formatType === FormatType.NORMAL
          ? createVisibleTextProjector(getDocument, referenceCacheKey)
          : undefined,
    });
  }
}
