import * as vscode from 'vscode';
import { CnsMcpClient } from './cnsMcpClient.js';
import { CnsEventSubscriber } from './cnsEventSubscriber.js';
import { CnsTreeProvider } from './cnsTreeProvider.js';
import { CnsNodeItem } from './cnsTreeItem.js';
import { log, disposeOutput } from './extensionOutput.js';
import type { McpServerExtensionApi, McpConnectionInfo } from './extensionApiTypes.js';

const MCP_EXT_ID = 'RichardJanisch.winccoa-mcp-server';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  log('WinCC OA CNS extension activating');

  // --- Acquire MCP extension API ---
  const mcpExt = vscode.extensions.getExtension<McpServerExtensionApi>(MCP_EXT_ID);
  if (!mcpExt) {
    vscode.window.showWarningMessage(
      'WinCC OA CNS: Could not find the WinCC OA MCP Server extension. Please install it.',
    );
    return;
  }
  const mcpApi = await mcpExt.activate();

  // --- Create core services ---
  const treeProvider = new CnsTreeProvider();
  const mcpClient = new CnsMcpClient({ url: '', token: '', authType: 'bearer' });
  const eventSubscriber = new CnsEventSubscriber();

  // --- Status bar item ---
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'winccoaCns.refresh';
  context.subscriptions.push(statusBar);

  function updateStatusBar(connected: boolean, live: boolean): void {
    if (!connected) {
      statusBar.text = '$(debug-disconnect) CNS';
      statusBar.tooltip = 'WinCC OA CNS: Not connected';
      statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else if (live) {
      statusBar.text = '$(circle-filled) CNS';
      statusBar.tooltip = 'WinCC OA CNS: Connected — live updates active';
      statusBar.backgroundColor = undefined;
    } else {
      statusBar.text = '$(circle-outline) CNS';
      statusBar.tooltip = 'WinCC OA CNS: Connected — live updates reconnecting…';
      statusBar.backgroundColor = undefined;
    }
    statusBar.show();
  }

  // --- Tree view ---
  const treeView = vscode.window.createTreeView('winccoaCns', {
    treeDataProvider: treeProvider,
    showCollapseAll: true,
  });
  context.subscriptions.push(treeView);

  // --- CNS change event → targeted tree refresh ---
  context.subscriptions.push(
    eventSubscriber.onCnsChanged(_uri => {
      treeProvider.refresh();
    }),
  );

  // --- Connect / disconnect based on MCP state ---
  async function onConnectionChange(info: McpConnectionInfo | null): Promise<void> {
    if (!info) {
      log('MCP disconnected — pausing CNS tree');
      eventSubscriber.disconnect();
      treeProvider.setClient(undefined);
      updateStatusBar(false, false);
      return;
    }

    log(`MCP connected at ${info.url}`);
    mcpClient.updateConfig({ url: info.url, token: info.token, authType: info.authType });
    treeProvider.setClient(mcpClient);
    updateStatusBar(true, false);

    // Start SSE subscription — we need a session ID first, obtained by initializing the client
    try {
      // Trigger initialization (callTool internally calls initialize)
      await treeProvider.refresh();
      // The client now has a session; pass it to the event subscriber
      const sessionId = (mcpClient as unknown as { sessionId?: string }).sessionId;
      if (sessionId) {
        eventSubscriber.connect({ url: info.url, token: info.token, authType: info.authType }, sessionId);
        updateStatusBar(true, true);
      }
    } catch (err) {
      log(`Failed to start CNS event subscription: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // React to future connection changes
  context.subscriptions.push(mcpApi.onDidChangeConnection(onConnectionChange));

  // React to current state immediately
  const currentInfo = mcpApi.getConnectionInfo();
  await onConnectionChange(currentInfo);

  // --- Commands ---
  context.subscriptions.push(
    vscode.commands.registerCommand('winccoaCns.refresh', () => {
      treeProvider.refresh();
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('winccoaCns.copyDpName', (item: CnsNodeItem) => {
      if (item?.info?.linkedDp) {
        vscode.env.clipboard.writeText(item.info.linkedDp);
        vscode.window.showInformationMessage(`Copied DP name: ${item.info.linkedDp}`);
      }
    }),
  );

  context.subscriptions.push(
    vscode.commands.registerCommand('winccoaCns.copyCnsPath', (item: CnsNodeItem) => {
      const path = item?.info?.path ?? (item as unknown as { viewPath?: string }).viewPath;
      if (path) {
        vscode.env.clipboard.writeText(path);
        vscode.window.showInformationMessage(`Copied CNS path: ${path}`);
      }
    }),
  );

  // --- Cleanup ---
  context.subscriptions.push({
    dispose: () => {
      eventSubscriber.dispose();
      treeProvider.dispose();
      disposeOutput();
    },
  });

  log('WinCC OA CNS extension activated');
}

export function deactivate(): void {
  // Cleanup handled via context.subscriptions
}
