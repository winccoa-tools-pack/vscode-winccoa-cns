/**
 * CnsDetailProvider — WebviewViewProvider that renders rich node details
 * in a sidebar panel below the CNS tree.
 *
 * Displayed sections (collapsible):
 *   - Node Identity  (path, type flags)
 *   - Display Names  (all configured project languages)
 *   - Hierarchy      (parent path, root path)
 *   - Linked Datapoint (DP name, type, description, alias, format, unit)
 *   - Custom Properties (key-value pairs)
 *   - User Data      (hex, only if non-empty)
 */

import * as vscode from 'vscode';
import type { CnsNodeInfo, CnsNodeDetails } from './types.js';
import type { CnsHttpClient } from './cnsHttpClient.js';
import { log } from './extensionOutput.js';

export const CNS_DETAILS_VIEW_ID = 'winccoaCnsDetails';

export class CnsDetailProvider implements vscode.WebviewViewProvider {
    private view: vscode.WebviewView | undefined;
    private client: CnsHttpClient | undefined;
    private currentPath: string | undefined;

    setClient(client: CnsHttpClient | undefined): void {
        this.client = client;
    }

    resolveWebviewView(
        webviewView: vscode.WebviewView,
        _context: vscode.WebviewViewResolveContext,
        _token: vscode.CancellationToken,
    ): void {
        this.view = webviewView;

        webviewView.webview.options = {
            enableScripts: false, // no scripts needed — pure HTML/CSS
        };

        this.renderEmpty('Select a CNS node to view its details.');
    }

    /** Called when the tree selection changes. Fetches and renders details. */
    async showNode(info: CnsNodeInfo | null): Promise<void> {
        if (!info) {
            this.renderEmpty('Select a CNS node to view its details.');
            return;
        }

        if (!this.client) {
            this.renderEmpty('Not connected to the CNS server.');
            return;
        }

        if (this.currentPath === info.path && this.view) {
            return; // same node, no need to re-fetch
        }
        this.currentPath = info.path;

        this.renderLoading(info.displayName || info.path);

        try {
            const details = await this.client.getNodeDetails(info.path);
            this.renderDetails(info, details);
        } catch (err) {
            log(`Failed to fetch node details for ${info.path}: ${err instanceof Error ? err.message : String(err)}`);
            this.renderError(info.path, err instanceof Error ? err.message : String(err));
        }
    }

    /** Clear the panel when the CNS client disconnects. */
    clearNode(): void {
        this.currentPath = undefined;
        this.renderEmpty('Not connected to the CNS server.');
    }

    // -------------------------------------------------------------------------
    // Private rendering helpers
    // -------------------------------------------------------------------------

    private setHtml(html: string): void {
        if (this.view) {
            this.view.webview.html = html;
        }
    }

    private renderEmpty(message: string): void {
        this.setHtml(this.buildPage(`
            <div class="empty-state">
                <span class="codicon codicon-info"></span>
                <p>${escHtml(message)}</p>
            </div>
        `));
    }

    private renderLoading(label: string): void {
        this.setHtml(this.buildPage(`
            <div class="empty-state">
                <p>Loading details for <strong>${escHtml(label)}</strong>…</p>
            </div>
        `));
    }

    private renderError(path: string, message: string): void {
        this.setHtml(this.buildPage(`
            <div class="empty-state error">
                <p>Failed to load details for <strong>${escHtml(path)}</strong></p>
                <p class="error-msg">${escHtml(message)}</p>
            </div>
        `));
    }

    private renderDetails(info: CnsNodeInfo, details: CnsNodeDetails): void {
        const sections: string[] = [];

        // --- Node Identity ---
        const typeLabel = info.isTree ? 'Tree root' : info.isLeaf ? 'Leaf node' : 'Branch node';
        sections.push(buildSection('Node Identity', [
            row('Path', `<code>${escHtml(details.path)}</code>`),
            row('Type', typeLabel),
            ...(info.icon ? [row('Icon', escHtml(info.icon))] : []),
        ]));

        // --- Display Names ---
        const dnEntries = Object.entries(details.displayNames);
        if (dnEntries.length > 0) {
            sections.push(buildSection('Display Names', dnEntries.map(([lang, name]) =>
                row(escHtml(lang), escHtml(name)),
            )));
        }

        // --- Hierarchy ---
        const hierarchyRows: string[] = [];
        if (details.parentPath) {
            hierarchyRows.push(row('Parent', `<code>${escHtml(details.parentPath)}</code>`));
        }
        if (details.rootPath && details.rootPath !== details.path) {
            hierarchyRows.push(row('Root', `<code>${escHtml(details.rootPath)}</code>`));
        }
        const dpEntries = Object.entries(details.displayPath);
        if (dpEntries.length > 0) {
            dpEntries.forEach(([lang, p]) => {
                hierarchyRows.push(row(`Display path (${escHtml(lang)})`, escHtml(p)));
            });
        }
        if (hierarchyRows.length > 0) {
            sections.push(buildSection('Hierarchy', hierarchyRows));
        }

        // --- Linked Datapoint ---
        if (details.dp) {
            const d = details.dp;
            const dpRows: string[] = [
                row('DP Element', `<code>${escHtml(d.dpName)}</code>`),
            ];
            if (d.typeName) dpRows.push(row('DP Type', `<code>${escHtml(d.typeName)}</code>`));
            Object.entries(d.description).forEach(([lang, desc]) => {
                if (desc) dpRows.push(row(`Description (${escHtml(lang)})`, escHtml(desc)));
            });
            if (d.alias) dpRows.push(row('Alias', escHtml(d.alias)));
            Object.entries(d.format).forEach(([lang, fmt]) => {
                if (fmt) dpRows.push(row(`Format (${escHtml(lang)})`, `<code>${escHtml(fmt)}</code>`));
            });
            Object.entries(d.unit).forEach(([lang, u]) => {
                if (u) dpRows.push(row(`Unit (${escHtml(lang)})`, escHtml(u)));
            });
            sections.push(buildSection('Linked Datapoint', dpRows));
        } else if (info.linkedDp) {
            sections.push(buildSection('Linked Datapoint', [
                row('DP Element', `<code>${escHtml(info.linkedDp)}</code>`),
            ]));
        }

        // --- Custom Properties ---
        const propEntries = Object.entries(details.properties);
        if (propEntries.length > 0) {
            sections.push(buildSection('Custom Properties', propEntries.map(([k, v]) =>
                row(escHtml(k), `<code>${escHtml(String(v))}</code>`),
            )));
        }

        // --- User Data ---
        if (details.userDataHex) {
            sections.push(buildSection('User Data', [
                `<div class="hex-dump"><code>${escHtml(details.userDataHex)}</code></div>`,
            ], false));
        }

        this.setHtml(this.buildPage(`
            <h2 class="node-title">${escHtml(info.displayName || details.path)}</h2>
            ${sections.join('\n')}
        `));
    }

    private buildPage(content: string): string {
        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline';">
<style>
  *, *::before, *::after { box-sizing: border-box; }

  body {
    font-family: var(--vscode-font-family);
    font-size: var(--vscode-font-size);
    color: var(--vscode-foreground);
    background: var(--vscode-sideBar-background);
    margin: 0;
    padding: 8px;
  }

  h2.node-title {
    font-size: 1em;
    font-weight: 600;
    margin: 0 0 10px;
    padding: 0 0 6px;
    border-bottom: 1px solid var(--vscode-widget-border, #444);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  details {
    margin-bottom: 6px;
    border: 1px solid var(--vscode-widget-border, #444);
    border-radius: 3px;
  }

  summary {
    font-weight: 600;
    font-size: 0.9em;
    padding: 5px 8px;
    cursor: default;
    user-select: none;
    background: var(--vscode-sideBarSectionHeader-background, transparent);
    color: var(--vscode-sideBarSectionHeader-foreground, inherit);
    list-style: none;
    display: flex;
    align-items: center;
    gap: 4px;
  }

  summary::before {
    content: '▶';
    font-size: 0.7em;
    transition: transform 0.15s;
    flex-shrink: 0;
  }

  details[open] > summary::before {
    transform: rotate(90deg);
  }

  .section-body {
    padding: 6px 8px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
  }

  tr + tr > td {
    border-top: 1px solid var(--vscode-widget-border, #3333);
  }

  td {
    padding: 3px 4px;
    vertical-align: top;
    word-break: break-all;
  }

  td:first-child {
    width: 38%;
    color: var(--vscode-descriptionForeground);
    font-size: 0.85em;
    padding-right: 8px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  code {
    font-family: var(--vscode-editor-font-family, monospace);
    font-size: 0.9em;
    background: var(--vscode-textCodeBlock-background, rgba(128,128,128,0.1));
    padding: 1px 3px;
    border-radius: 2px;
    word-break: break-all;
  }

  .hex-dump {
    overflow-x: auto;
  }

  .hex-dump code {
    word-break: break-all;
    white-space: pre-wrap;
    display: block;
    padding: 4px;
  }

  .empty-state {
    display: flex;
    flex-direction: column;
    align-items: center;
    padding: 24px 16px;
    color: var(--vscode-descriptionForeground);
    text-align: center;
    gap: 8px;
  }

  .empty-state p { margin: 0; }

  .empty-state.error .error-msg {
    font-size: 0.85em;
    color: var(--vscode-errorForeground);
  }
</style>
</head>
<body>
${content}
</body>
</html>`;
    }
}

// ---------------------------------------------------------------------------
// Small HTML helpers (no external deps)
// ---------------------------------------------------------------------------

function escHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

function row(label: string, value: string): string {
    return `<tr><td>${label}</td><td>${value}</td></tr>`;
}

function buildSection(title: string, rows: string[], isTable = true, open = true): string {
    const body = isTable
        ? `<table>${rows.join('')}</table>`
        : rows.join('');
    return `<details${open ? ' open' : ''}>
  <summary>${escHtml(title)}</summary>
  <div class="section-body">${body}</div>
</details>`;
}
