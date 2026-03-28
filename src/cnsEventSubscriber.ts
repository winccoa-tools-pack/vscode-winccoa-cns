/**
 * Subscribes to CNS live change notifications from the standalone CNS manager via SSE.
 *
 * Opens a GET /cns/events SSE stream and fires an event whenever a
 * notifications/resources/updated message is received.
 *
 * Auto-reconnects with exponential backoff (1s → 30s cap).
 */

import * as vscode from 'vscode';
import { log } from './extensionOutput.js';

const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 30_000;

export interface CnsEventConfig {
  baseUrl: string;
  token: string;
}

export class CnsEventSubscriber {
  private readonly _onCnsChanged = new vscode.EventEmitter<string | undefined>();
  /** Fired when a CNS change notification arrives. Payload is the changed URI (or undefined). */
  readonly onCnsChanged: vscode.Event<string | undefined> = this._onCnsChanged.event;

  private abortController: AbortController | undefined;
  private reconnectTimer: NodeJS.Timeout | undefined;
  private backoff = BACKOFF_BASE_MS;
  private disposed = false;
  private config: CnsEventConfig | undefined;

  constructor() {}

  /** Start (or restart) listening with the given server config. */
  connect(config: CnsEventConfig): void {
    this.config = config;
    this.backoff = BACKOFF_BASE_MS;
    this.startStream();
  }

  /** Stop all SSE activity. */
  disconnect(): void {
    this.cancelReconnect();
    this.abortController?.abort();
    this.abortController = undefined;
    this.config = undefined;
    log('CNS event subscriber disconnected');
  }

  dispose(): void {
    this.disposed = true;
    this.disconnect();
    this._onCnsChanged.dispose();
  }

  private startStream(): void {
    if (this.disposed || !this.config) return;
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.runStream(this.config, this.abortController.signal).catch(err => {
      if (!this.disposed && !this.abortController?.signal.aborted) {
        log(`CNS SSE stream error: ${err instanceof Error ? err.message : String(err)}`);
        this.scheduleReconnect();
      }
    });
  }

  private async runStream(config: CnsEventConfig, signal: AbortSignal): Promise<void> {
    const url = `${config.baseUrl.replace(/\/$/, '')}/cns/events`;
    const res = await fetch(url, {
      method: 'GET',
      headers: {
        'Accept': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Authorization': `Bearer ${config.token}`,
      },
      signal,
    });

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
      // Ignore non-JSON SSE data (e.g. the initial ": connected" comment line)
    }
  }

  private scheduleReconnect(): void {
    if (this.disposed || !this.config) return;
    this.cancelReconnect();
    log(`CNS SSE reconnecting in ${this.backoff}ms…`);
    this.reconnectTimer = setTimeout(() => {
      if (!this.disposed && this.config) {
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
