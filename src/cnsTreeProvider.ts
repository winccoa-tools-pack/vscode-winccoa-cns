import * as vscode from 'vscode';
import type { CnsMcpClient } from './cnsMcpClient.js';
import { CnsViewItem, CnsNodeItem, type CnsItem } from './cnsTreeItem.js';
import type { CnsNodeInfo } from './types.js';
import { log } from './extensionOutput.js';

export type ProviderState = 'disconnected' | 'connected';

export class CnsTreeProvider implements vscode.TreeDataProvider<CnsItem> {
  private readonly _onDidChangeTreeData = new vscode.EventEmitter<CnsItem | undefined | null>();
  readonly onDidChangeTreeData: vscode.Event<CnsItem | undefined | null> = this._onDidChangeTreeData.event;

  private state: ProviderState = 'disconnected';
  private client: CnsMcpClient | undefined;

  setClient(client: CnsMcpClient | undefined): void {
    this.client = client;
    this.state = client ? 'connected' : 'disconnected';
    this.refresh();
  }

  /** Full tree refresh. */
  refresh(): void {
    this._onDidChangeTreeData.fire(undefined);
  }

  /** Targeted refresh of a single item (or full refresh if undefined). */
  refreshItem(item: CnsItem | undefined): void {
    this._onDidChangeTreeData.fire(item ?? undefined);
  }

  getTreeItem(element: CnsItem): vscode.TreeItem {
    return element;
  }

  async getChildren(element?: CnsItem): Promise<CnsItem[]> {
    if (this.state === 'disconnected' || !this.client) {
      return [];
    }

    try {
      if (!element) {
        // Root: list all views
        const data = await this.client.callTool<{ views: string[] }>('cns.cns_get_views', {});
        return data.views.map(v => new CnsViewItem(v));
      }

      if (element instanceof CnsViewItem) {
        // View expanded: list tree roots
        const data = await this.client.callTool<{ trees: CnsNodeInfo[] }>('cns.cns_get_trees', {
          viewPath: element.viewPath,
        });
        return data.trees.map(n => new CnsNodeItem(n));
      }

      if (element instanceof CnsNodeItem && !element.info.isLeaf) {
        // Node expanded: list children
        const data = await this.client.callTool<{ children: CnsNodeInfo[] }>('cns.cns_get_children', {
          nodePath: element.info.path,
        });
        return data.children.map(n => new CnsNodeItem(n));
      }

      return [];
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      log(`Error fetching CNS children: ${msg}`);
      const errorItem = new vscode.TreeItem(`Error: ${msg}`);
      errorItem.iconPath = new vscode.ThemeIcon('error');
      return [errorItem as CnsItem];
    }
  }

  dispose(): void {
    this._onDidChangeTreeData.dispose();
  }
}
