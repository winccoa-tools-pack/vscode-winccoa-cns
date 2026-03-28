/**
 * Mirrors the public API types from the vscode-winccoa-mcp-server extension.
 * We redeclare them here instead of importing to avoid a hard runtime dependency.
 */

import type * as vscode from 'vscode';

export interface McpConnectionInfo {
  url: string;
  token: string;
  authType: 'bearer' | 'basic';
  projectName?: string;
  projectPath?: string;
}

export type McpConnectionState = 'connected' | 'disconnected' | 'connecting' | 'error';

export interface McpServerExtensionApi {
  getConnectionInfo(): McpConnectionInfo | null;
  getConnectionState(): McpConnectionState;
  onDidChangeConnection: vscode.Event<McpConnectionInfo | null>;
}
