import * as vscode from 'vscode';
import type { CnsNodeInfo } from './types.js';

export type CnsItem = CnsViewItem | CnsNodeItem;

export class CnsViewItem extends vscode.TreeItem {
  readonly contextValue = 'cnsView';
  readonly viewPath: string;

  constructor(viewPath: string) {
    super(viewPath, vscode.TreeItemCollapsibleState.Collapsed);
    this.viewPath = viewPath;
    this.iconPath = new vscode.ThemeIcon('symbol-namespace');
    this.tooltip = `CNS View: ${viewPath}`;
  }
}

export class CnsNodeItem extends vscode.TreeItem {
  readonly contextValue: string;
  readonly info: CnsNodeInfo;

  constructor(info: CnsNodeInfo) {
    super(
      info.displayName || info.path.split('.').pop() || info.path,
      info.isLeaf ? vscode.TreeItemCollapsibleState.None : vscode.TreeItemCollapsibleState.Collapsed,
    );
    this.info = info;
    this.contextValue = info.isTree ? 'cnsTree' : 'cnsNode';

    // Show the linked DP name as a grayed description
    if (info.linkedDp) {
      this.description = info.linkedDp;
    }

    // Tooltip shows full path + all display name languages
    const langLines = Object.entries(info.displayNames)
      .map(([lang, name]) => `  ${lang}: ${name}`)
      .join('\n');
    this.tooltip = [
      `Path: ${info.path}`,
      info.linkedDp ? `DP: ${info.linkedDp}` : undefined,
      langLines ? `Names:\n${langLines}` : undefined,
    ]
      .filter(Boolean)
      .join('\n');

    // Icon
    if (info.isTree) {
      this.iconPath = new vscode.ThemeIcon('symbol-structure');
    } else if (info.isLeaf) {
      this.iconPath = new vscode.ThemeIcon('circle-small');
    } else {
      this.iconPath = new vscode.ThemeIcon('symbol-object');
    }
  }
}
