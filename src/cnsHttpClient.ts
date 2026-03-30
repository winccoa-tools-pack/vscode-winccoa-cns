/**
 * HTTP client for the standalone WinCC OA CNS manager.
 *
 * Calls the REST endpoints exposed by managers/cns-server.js.
 * No JSON-RPC session management — plain fetch with Bearer token auth.
 */

import { log } from './extensionOutput.js';
import type { CnsNodeDetails } from './types.js';

export interface CnsServerConfig {
  url: string;
  token: string;
}

export class CnsHttpClient {
  constructor(private config: CnsServerConfig) {}

  updateConfig(config: CnsServerConfig): void {
    this.config = config;
    log(`CNS server URL updated: ${config.url}`);
  }

  /** Call a CNS endpoint and return the parsed JSON result. */
  async post<T = unknown>(path: string, body: Record<string, unknown> = {}): Promise<T> {
    const url = `${this.config.url.replace(/\/$/, '')}${path}`;
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.token}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText} from CNS server`);
    }
    return res.json() as Promise<T>;
  }

  /** Convenience wrappers matching the previous MCP tool names. */
  async callTool<T = unknown>(name: string, args: Record<string, unknown>): Promise<T> {
    const pathMap: Record<string, string> = {
      'cns.cns_get_views':    '/cns/views',
      'cns.cns_get_trees':    '/cns/trees',
      'cns.cns_get_children': '/cns/children',
    };
    const endpoint = pathMap[name];
    if (!endpoint) throw new Error(`Unknown CNS tool: ${name}`);
    return this.post<T>(endpoint, args);
  }

  /** Return the configured server base URL (used by CnsEventSubscriber). */
  getBaseUrl(): string {
    return this.config.url.replace(/\/$/, '');
  }

  /** Return the auth token (used by CnsEventSubscriber). */
  getToken(): string {
    return this.config.token;
  }

  /** Fetch all extended details for a CNS node path. */
  async getNodeDetails(nodePath: string): Promise<CnsNodeDetails> {
    return this.post<CnsNodeDetails>('/cns/node-details', { nodePath });
  }
}
