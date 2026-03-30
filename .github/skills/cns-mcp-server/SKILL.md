---
name: cns-mcp-server
description: >
  How to build or extend a TypeScript MCP (Model Context Protocol) server that
  exposes WinCC OA CNS data as AI-accessible tools. Use this skill when
  implementing the CNS Tree Explorer, Datapoint Resolver, or other MCP tools
  described in AGENTS.md section 12.
---

# WinCC OA CNS MCP Server

Use this skill when you need to expose CNS data to AI agents via the
Model Context Protocol (MCP). The existing `managers/cns-server.js` already
serves HTTP — the MCP server wraps those same endpoints as structured tools.

> **Reference:** AGENTS.md §12 describes seven planned MCP skills.

---

## Architecture

```
AI Agent (Copilot, Claude, etc.)
        │  MCP protocol (stdio or HTTP)
        ▼
 cns-mcp-server  (new TypeScript project or extension to cns-server.js)
        │  HTTP POST
        ▼
 cns-server.js  (existing WinCC OA Node Manager on :4712)
        │  winccoa-manager npm pkg
        ▼
 WinCC OA Runtime
```

The MCP server acts as a **protocol adapter**: it speaks MCP to AI agents and
speaks HTTP to the existing `cns-server.js`.

---

## Project Setup

```bash
mkdir cns-mcp-server && cd cns-mcp-server
npm init -y
npm install @modelcontextprotocol/sdk zod
npm install --save-dev typescript tsx @types/node
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "bundler",
    "strict": true,
    "outDir": "dist"
  }
}
```

`package.json`:
```json
{
  "type": "module",
  "scripts": { "start": "npx tsx src/index.ts" }
}
```

---

## Server Skeleton (`src/index.ts`)

```typescript
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const CNS_URL = process.env.CNS_SERVER_URL ?? 'http://localhost:4712';
const CNS_TOKEN = process.env.CNS_SERVER_TOKEN ?? '';

const server = new McpServer({ name: 'winccoa-cns', version: '1.0.0' });

/** POST helper — mirrors CnsHttpClient behaviour */
async function cnsPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${CNS_URL}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${CNS_TOKEN}`,
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`cns-server ${path} → ${res.status}`);
  return res.json() as Promise<T>;
}

// --- Register tools below ---

const transport = new StdioServerTransport();
await server.connect(transport);
```

---

## Implementing the Core CNS Tools (AGENTS.md §12.1)

```typescript
server.registerTool(
  'cns_get_views',
  {
    title: 'List CNS Views',
    description: 'Return all CNS views available in the WinCC OA project.',
    inputSchema: z.object({ system: z.string().optional() }),
  },
  async ({ system }) => {
    const data = await cnsPost<{ views: string[] }>('/cns/views', { system });
    return {
      content: [{ type: 'text', text: data.views.join('\n') }],
      structuredContent: data,
    };
  },
);

server.registerTool(
  'cns_get_children',
  {
    title: 'Get CNS Children',
    description: 'List the direct children of a CNS node or tree root.',
    inputSchema: z.object({ nodePath: z.string() }),
  },
  async ({ nodePath }) => {
    const data = await cnsPost<{ children: unknown[] }>('/cns/children', { nodePath });
    return {
      content: [{ type: 'text', text: JSON.stringify(data.children, null, 2) }],
      structuredContent: data,
    };
  },
);

server.registerTool(
  'cns_get_subtree',
  {
    title: 'Get CNS Subtree',
    description: 'Recursively walk a CNS subtree up to a given depth (default 3).',
    inputSchema: z.object({
      nodePath: z.string(),
      depth: z.number().int().min(1).max(10).default(3),
    }),
  },
  async ({ nodePath, depth }) => {
    // Recursive implementation using /cns/children
    async function walk(path: string, remaining: number): Promise<unknown> {
      const { children } = await cnsPost<{ children: { path: string; isLeaf: boolean }[] }>(
        '/cns/children', { nodePath: path },
      );
      if (remaining <= 1) return { path, children };
      const nested = await Promise.all(
        children.map(c => c.isLeaf ? c : walk(c.path, remaining - 1)),
      );
      return { path, children: nested };
    }
    const tree = await walk(nodePath, depth);
    return {
      content: [{ type: 'text', text: JSON.stringify(tree, null, 2) }],
      structuredContent: { nodePath, depth, tree },
    };
  },
);
```

---

## Datapoint Resolver Tools (AGENTS.md §12.2)

Add a `/cns/resolve` endpoint to `cns-server.js` first (see `add-manager-endpoint` skill),
then:

```typescript
server.registerTool(
  'cns_resolve_dp',
  {
    title: 'Resolve Datapoint',
    description: 'Return the WinCC OA datapoint name linked to a CNS path.',
    inputSchema: z.object({ cnsPath: z.string() }),
  },
  async ({ cnsPath }) => {
    const data = await cnsPost<{ linkedDp: string }>('/cns/resolve', { cnsPath });
    return {
      content: [{ type: 'text', text: data.linkedDp || '(no linked datapoint)' }],
      structuredContent: data,
    };
  },
);
```

---

## Error Handling

Always wrap `cnsPost` calls in try/catch and return a structured error:

```typescript
try {
  const data = await cnsPost<...>('/cns/children', { nodePath });
  return { content: [{ type: 'text', text: '...' }], structuredContent: data };
} catch (err) {
  return {
    content: [{ type: 'text', text: `Error: ${String(err)}` }],
    isError: true,
  };
}
```

---

## Running & Testing

```bash
# Start
CNS_SERVER_URL=http://localhost:4712 CNS_SERVER_TOKEN=secret npx tsx src/index.ts

# Inspect with MCP Inspector
npx @modelcontextprotocol/inspector
# Connect to: stdio — npx tsx src/index.ts
```

---

## Checklist

- [ ] `@modelcontextprotocol/sdk` and `zod` installed
- [ ] `cns_get_views`, `cns_get_trees`, `cns_get_children` tools registered
- [ ] `cns_get_subtree` with configurable depth
- [ ] `cns_resolve_dp` (requires `/cns/resolve` endpoint — use `add-manager-endpoint` skill)
- [ ] Error handling in every tool handler
- [ ] `CNS_SERVER_URL` and `CNS_SERVER_TOKEN` read from environment
- [ ] Tested with MCP Inspector against a live WinCC OA project
