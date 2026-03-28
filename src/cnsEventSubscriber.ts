/**
 * Subscribes to CNS live change notifications from the MCP server via SSE.
 *
 * Opens a GET /mcp SSE stream, sends a resources/subscribe for "cns://",
 * and fires an event whenever notifications/resources/updated is received.
 *
 * Auto-reconnects with exponential backoff (1s → 30s cap).
 */

import * as vscode from 'vscode';
import { log } from './extensionOutput.js';
import type { McpConnectionConfig } from './cnsMcpClient.js';

const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30_000;

export class CnsEventSubscriber {
  private readonly _onCnsChanged = new vscode.EventEmitter<string | undefined>();
  /** Fired when a CNS change notification arrives. Payload is the changed URI (or undefined). */
  readonly onCnsChanged: vscode.Event<string | undefined> = this._onCnsChanged.event;

  private abortController: AbortController | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private backoff = BACKOFF_BASE_MS;
  private disposed = false;
  private config: McpConnectionConfig | undefined;
  private sessionId: string | undefined;

  constructor() {}

  /** Start (or restart) listening with the given connection config + session ID. */
  connect(config: McpConnectionConfig, sessionId: string): void {
    this.config = config;
    this.sessionId = sessionId;
    this.backoff = BACKOFF_BASE_MS;
    this.startStream();
  }

  /** Stop all SSE activity. */
  disconnect(): void {
    this.cancelReconnect();
    this.abortController?.abort();
    this.abortController = undefined;
    this.config = undefined;
    this.sessionId = undefined;
    log('CNS event subscriber disconnected');
  }

  dispose(): void {
    this.disposed = true;
    this.disconnect();
    this._onCnsChanged.dispose();
  }

  private startStream(): void {
    if (this.disposed || !this.config || !this.sessionId) return;
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.runStream(this.config, this.sessionId, this.abortController.signal).catch(err => {
      if (!this.disposed && !this.abortController?.signal.aborted) {
        log(`CNS SSE stream error: ${err instanceof Error ? err.message : String(err)}`);
        this.scheduleReconnect();
      }
    });
  }

  private async runStream(config: McpConnectionConfig, sessionId: string, signal: AbortSignal): Promise<void> {
    const headers: Record<string, string> = {
      'Accept': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'mcp-session-id': sessionId,
    };
    if (config.authType === 'bearer') {
      headers['Authorization'] = `Bearer ${config.token}`;
    } else {
      headers['Authorization'] = `Basic ${Buffer.from(config.token).toString('base64')}`;
    }

    const res = await fetch(config.url, { method: 'GET', headers, signal });
    if (!res.ok || !res.body) {
      throw new Error(`SSE connect failed: HTTP ${res.status}`);
    }

    log('CNS SSE stream connected');
    this.backoff = BACKOFF_BASE_MS;

    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) {
        this.processLine(line.trimEnd());
      }
    }

    if (!signal.aborted && !this.disposed) {
      log('CNS SSE stream closed by server — reconnecting');
      this.scheduleReconnect();
    }
  }

  private currentEvent: { data?: string } = {};

  private processLine(line: string): void {
    if (line.startsWith('data:')) {
      this.currentEvent.data = line.slice(5).trim();
    } else if (line === '') {
      // Dispatch event
      if (this.currentEvent.data) {
        this.handleData(this.currentEvent.data);
      }
      this.currentEvent = {};
    }
  }

  private handleData(data: string): void {
    try {
      const msg = JSON.parse(data) as { method?: string; params?: { uri?: string } };
      if (msg.method === 'notifications/resources/updated') {
        const uri = msg.params?.uri;
        log(`CNS change notification: ${uri ?? '(all)'}`);
        this._onCnsChanged.fire(uri);
      }
    } catch {
      // Ignore non-JSON SSE data
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed || !this.config) return;
    this.cancelReconnect();
    log(`CNS SSE reconnecting in ${this.backoff}ms…`);
    this.reconnectTimer = setTimeout(() => {
      if (!this.disposed && this.config && this.sessionId) {
        this.startStream();
      }
    }, this.backoff);
    this.backoff = Math.min(this.backoff * 2, BACKOFF_MAX_MS);
  }

  private cancelReconnect(): void {
    if (this.reconnectTimer !== undefined) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = undefined;
    }
  }
}
