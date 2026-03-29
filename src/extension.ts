import * as vscode from 'vscode';
import { CnsHttpClient } from './cnsHttpClient.js';
import { CnsEventSubscriber } from './cnsEventSubscriber.js';
import { CnsTreeProvider } from './cnsTreeProvider.js';
import { CnsNodeItem } from './cnsTreeItem.js';
import { CnsSetupWizard } from './cnsSetupWizard.js';
import { log, disposeOutput } from './extensionOutput.js';

const CONFIG_SECTION = 'winccoaCns';
const PROJECT_ADMIN_IDS = [
  'RichardJanisch.winccoa-project-admin',
  'winccoa-tools-pack.winccoa-project-admin',
];

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

  // --- Project Admin integration ---
  let currentProject: { projectDir: string; name: string; id?: string; version?: string } | undefined;

  function findProjectAdminExtension(): vscode.Extension<unknown> | undefined {
    for (const id of PROJECT_ADMIN_IDS) {
      const ext = vscode.extensions.getExtension(id);
      if (ext) {
        log(`Found project-admin extension: ${id} (active=${ext.isActive})`);
        return ext;
      }
    }

    // Debug: list all winccoa extensions
    const allExts = vscode.extensions.all
      .filter(e => e.id.toLowerCase().includes('winccoa'))
      .map(e => `  ${e.id} (active=${e.isActive})`);
    log(`WinCC OA extensions found:\n${allExts.length > 0 ? allExts.join('\n') : '  (none)'}`);
    log('project-admin extension not found under any known ID');
    return undefined;
  }

  interface ProjectAdminApi {
    getCurrentProject(): { projectDir: string; name: string; id?: string; version?: string } | undefined;
    onDidChangeProject(listener: (project: { projectDir: string; name: string; id?: string; version?: string } | undefined) => void): () => void;
  }

  async function getProjectAdminApi(): Promise<ProjectAdminApi | undefined> {
    const ext = findProjectAdminExtension();
    if (!ext) return undefined;

    if (!ext.isActive) {
      log('project-admin not active yet, waiting for activation...');
      try {
        const api = await ext.activate();
        log(`project-admin activated, exports: ${JSON.stringify(Object.keys(api || {}))}`);
        return api as unknown as ProjectAdminApi;
      } catch (err) {
        log(`Failed to activate project-admin: ${err}`);
        return undefined;
      }
    }

    const api = ext.exports as unknown as ProjectAdminApi;
    log(`project-admin exports: ${JSON.stringify(Object.keys(api || {}))}`);
    return api;
  }

  async function subscribeToProjectAdmin(): Promise<void> {
    log(`Looking up Project Admin extension, candidates: [${PROJECT_ADMIN_IDS.join(', ')}]…`);
    const api = await getProjectAdminApi();
    if (!api?.onDidChangeProject) {
      log('Project Admin API not available');
      return;
    }

    // Check initial project
    if (api.getCurrentProject) {
      const project = api.getCurrentProject();
      if (project) {
        currentProject = { projectDir: project.projectDir, name: project.name, id: project.id, version: project.version };
        await handleProjectChange(project);
      }
    }

    api.onDidChangeProject(async (project: { projectDir: string; name: string; id?: string; version?: string } | undefined) => {
      currentProject = project ? { projectDir: project.projectDir, name: project.name, id: project.id, version: project.version } : undefined;
      if (project) {
        await handleProjectChange(project);
      }
    });
    log('Subscribed to Project Admin project changes');
  }

  async function handleProjectChange(project: { projectDir: string; name: string; id?: string; version?: string }): Promise<void> {
    const installed = await CnsSetupWizard.isCnsManagerInstalled(project.projectDir);
    if (installed) {
      log(`CNS manager already installed in ${project.name}`);
      await applyConfig();
      return;
    }

    const success = await CnsSetupWizard.runSetup(
      project.projectDir,
      project.name,
      context.extensionPath,
      project.id,
      project.version,
    );
    if (success) {
      // Settings were auto-configured — reconnect
      await applyConfig();
    }
  }

  await subscribeToProjectAdmin();

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
      if (currentProject) {
        const success = await CnsSetupWizard.runSetup(
          currentProject.projectDir,
          currentProject.name,
          context.extensionPath,
          currentProject.id,
          currentProject.version,
        );
        if (success) {
          await applyConfig();
        }
      } else {
        vscode.window.showWarningMessage(
          'No WinCC OA project selected. Please select a project via the Project Admin extension first.',
        );
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
