/**
 * Minimal HTTP MCP client for calling tools over JSON-RPC 2.0.
 *
 * Manages a single session (initialize on first call, reuse mcp-session-id).
 * No external SDK dependency — uses the built-in fetch API (Node 18+).
 */

import { log } from './extensionOutput.js';

export interface McpConnectionConfig {
  url: string;
  token: string;
  authType: 'bearer' | 'basic';
}

interface JsonRpcResponse<T = unknown> {
  jsonrpc: '2.0';
  id: number;
  result?: T;
  error?: { code: number; message: string; data?: unknown };
}

interface ToolResult {
  content: Array<{ type: string; text?: string }>;
  isError?: boolean;
}

export class CnsMcpClient {
  private sessionId: string | undefined;
  private requestId = 1;
  private initPromise: Promise<void> | undefined;

  constructor(private config: McpConnectionConfig) {}

  /** Update connection config (e.g. when MCP server reconnects). */
  updateConfig(config: McpConnectionConfig): void {
    this.config = config;
    this.sessionId = undefined;
    this.initPromise = undefined;
  }

  /** Call a tool and return the parsed JSON result text. */
  async callTool<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
    await this.ensureInitialized();
    const response = await this.post<ToolResult>('tools/call', { name, arguments: args });
    if (response.isError) {
      const text = response.content.find((c: { type: string }) => c.type === 'text')?.text ?? 'Unknown tool error';
      throw new Error(text);
    }
    const text = response.content.find((c: { type: string }) => c.type === 'text')?.text;
    if (!text) throw new Error(`Tool "${name}" returned no text content`);
    return JSON.parse(text) as T;
  }

  private async ensureInitialized(): Promise<void> {
    if (this.sessionId) return;
    if (!this.initPromise) {
      this.initPromise = this.initialize().catch(e => {
        this.initPromise = undefined;
        throw e;
      });
    }
    return this.initPromise;
  }

  private async initialize(): Promise<void> {
    const body = {
      jsonrpc: '2.0',
      id: this.requestId++,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: { roots: {}, sampling: {} },
        clientInfo: { name: 'vscode-winccoa-cns', version: '0.1.0' },
      },
    };

    const res = await this.fetchRpc(body);
    const sessionId = res.headers.get('mcp-session-id');
    if (!sessionId) throw new Error('MCP server did not return a session ID');
    this.sessionId = sessionId;
    log(`MCP session initialized: ${sessionId}`);
  }

  private async post<T>(method: string, params: unknown): Promise<T> {
    const body = {
      jsonrpc: '2.0',
      id: this.requestId++,
      method,
      params,
    };
    const res = await this.fetchRpc(body);
    const json = await res.json() as JsonRpcResponse<T>;
    if (json.error) throw new Error(`MCP error ${json.error.code}: ${json.error.message}`);
    return json.result as T;
  }

  private async fetchRpc(body: unknown): Promise<Response> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };
    if (this.config.authType === 'bearer') {
      headers['Authorization'] = `Bearer ${this.config.token}`;
    } else {
      headers['Authorization'] = `Basic ${Buffer.from(this.config.token).toString('base64')}`;
    }
    if (this.sessionId) {
      headers['mcp-session-id'] = this.sessionId;
    }

    const res = await fetch(this.config.url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} from MCP server`);
    }
    return res;
  }

  /** Reset session (e.g. on reconnect). */
  reset(): void {
    this.sessionId = undefined;
    this.initPromise = undefined;
  }
}
