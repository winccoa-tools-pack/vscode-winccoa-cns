import * as vscode from 'vscode';

let channel: vscode.OutputChannel | undefined;

export function getOutput(): vscode.OutputChannel {
  if (!channel) {
    channel = vscode.window.createOutputChannel('WinCC OA CNS');
  }
  return channel;
}

export function log(message: string): void {
  getOutput().appendLine(`[${new Date().toISOString()}] ${message}`);
}

export function disposeOutput(): void {
  channel?.dispose();
  channel = undefined;
}
