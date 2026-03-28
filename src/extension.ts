import * as vscode from 'vscode';
import { CnsHttpClient } from './cnsHttpClient.js';
import { CnsEventSubscriber } from './cnsEventSubscriber.js';
import { CnsTreeProvider } from './cnsTreeProvider.js';
import { CnsNodeItem } from './cnsTreeItem.js';
import { log, disposeOutput } from './extensionOutput.js';

const CONFIG_SECTION = 'winccoaCns';
const PROJECT_ADMIN_EXT_ID = 'RichardJanisch.winccoa-project-admin';

export async function activate(context: vscode.ExtensionContext): Promise<void> {
  log('WinCC OA CNS extension activating');

  // --- Create core services ---
  const treeProvider = new CnsTreeProvider();
  const httpClient = new CnsHttpClient({ url: '', token: '' });
  const eventSubscriber = new CnsEventSubscriber();

  // --- Status bar item ---
  const statusBar = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right, 100);
  statusBar.command = 'winccoaCns.refresh';
  context.subscriptions.push(statusBar);

  function updateStatusBar(state: 'disconnected' | 'connected' | 'live'): void {
    if (state === 'disconnected') {
      statusBar.text = '$(debug-disconnect) CNS';
      statusBar.tooltip = 'WinCC OA CNS: Not connected — configure winccoaCns.serverUrl and winccoaCns.token';
      statusBar.backgroundColor = new vscode.ThemeColor('statusBarItem.warningBackground');
    } else if (state === 'live') {
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

  /** Read settings and (re-)connect to the CNS server. */
  async function applyConfig(): Promise<void> {
    const cfg = vscode.workspace.getConfiguration(CONFIG_SECTION);
    const serverUrl = cfg.get<string>('serverUrl', '').trim();
    const token = cfg.get<string>('token', '').trim();

    if (!serverUrl || !token) {
      eventSubscriber.disconnect();
      treeProvider.setClient(undefined);
      updateStatusBar('disconnected');
      if (!serverUrl || !token) {
        const action = await vscode.window.showWarningMessage(
          'WinCC OA CNS: Please configure winccoaCns.serverUrl and winccoaCns.token to connect to the CNS manager.',
          'Open Settings',
        );
        if (action === 'Open Settings') {
          await vscode.commands.executeCommand('workbench.action.openSettings', 'winccoaCns');
        }
      }
      return;
    }

    log(`Connecting to CNS server at ${serverUrl}`);
    httpClient.updateConfig({ url: serverUrl, token });
    treeProvider.setClient(httpClient);
    updateStatusBar('connected');

    try {
      await treeProvider.refresh();
      eventSubscriber.connect({ baseUrl: serverUrl, token });
      updateStatusBar('live');
    } catch (err) {
      log(`Failed to connect to CNS server: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // Re-connect when settings change
  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration(CONFIG_SECTION)) {
        applyConfig().catch(err => log(`Config change error: ${String(err)}`));
      }
    }),
  );

  // Apply config immediately on activation
  await applyConfig();

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

  context.subscriptions.push(
    vscode.commands.registerCommand('winccoaCns.addManager', async () => {
      // Invoke project-admin's add manager command if available, then guide settings setup
      const adminExt = vscode.extensions.getExtension(PROJECT_ADMIN_EXT_ID);
      if (adminExt) {
        await vscode.commands.executeCommand('winccoaProjectAdmin.addManager');
      } else {
        vscode.window.showInformationMessage(
          'Install the WinCC OA Project Admin extension to add the CNS manager via the UI, ' +
          'or add a "node" manager manually pointing to managers/cns-server.js in your project.',
        );
      }
      // After adding the manager, guide the user to configure VS Code settings
      const action = await vscode.window.showInformationMessage(
        'After the CNS manager is running, configure the server URL and token in VS Code settings.',
        'Open Settings',
      );
      if (action === 'Open Settings') {
        await vscode.commands.executeCommand('workbench.action.openSettings', 'winccoaCns');
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
