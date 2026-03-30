---
name: add-manager-endpoint
description: >
  How to add a new HTTP endpoint to the WinCC OA CNS manager (cns-server.js)
  and consume it from the VS Code extension TypeScript client. Use this skill
  when you need to expose new CNS data or functionality to the extension.
---

# Add a New Manager Endpoint

Use this skill when extending `managers/cns-server.js` with a new HTTP route
and wiring it into the extension via `src/cnsHttpClient.ts`.

---

## Step 1 — Add the Endpoint to `cns-server.js`

Follow the existing pattern: validate the Bearer token, parse the JSON body,
call `winccoa.*`, return JSON.

```javascript
// Inside the `server.on('request', ...)` handler, before the final 404 branch:

if (req.method === 'POST' && req.url === '/cns/resolve') {
  if (!checkAuth(req, res)) return;
  readBody(req, (err, body) => {
    if (err) return respond(res, 400, { error: 'Invalid body' });
    const { cnsPath } = body;
    if (!cnsPath) return respond(res, 400, { error: 'cnsPath required' });
    try {
      const node = winccoa.cnsGetNode(cnsPath);
      if (!node) return respond(res, 404, { error: 'Node not found' });
      respond(res, 200, { cnsPath, linkedDp: node.dpName ?? '' });
    } catch (e) {
      respond(res, 500, { error: String(e) });
    }
  });
  return;
}
```

Update the JSDoc endpoint list at the top of the file:

```javascript
 *   POST /cns/resolve     → body: { cnsPath } → { cnsPath, linkedDp: string }
```

---

## Step 2 — Add a Typed Method to `CnsHttpClient`

Open `src/cnsHttpClient.ts` and add a dedicated method (or use `callTool` if the
endpoint maps to an MCP tool). For direct HTTP endpoints use `post()`:

```typescript
/** Resolve the linked datapoint name for a CNS path. */
async resolveDatapoint(cnsPath: string): Promise<string> {
  const data = await this.post<{ linkedDp: string }>('/cns/resolve', { cnsPath });
  return data.linkedDp;
}
```

If `CnsHttpClient` does not yet have a generic `post<T>()` helper, add one:

```typescript
private async post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(`${this.url}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${this.token}`,
    },
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    throw new Error(`CNS server ${path} returned ${response.status}`);
  }
  return response.json() as Promise<T>;
}
```

---

## Step 3 — Call the New Method from the Extension

Consume the new client method wherever needed (tree provider, command handler, etc.):

```typescript
// In extension.ts or a command handler:
const dp = await httpClient.resolveDatapoint(selectedNode.info.path);
await vscode.env.clipboard.writeText(dp);
vscode.window.showInformationMessage(`Datapoint: ${dp}`);
```

---

## Step 4 — Register a Command (if user-facing)

In `package.json`, add the command under `contributes.commands`:

```json
{
  "command": "winccoaCns.resolveDatapoint",
  "title": "Resolve Datapoint",
  "category": "WinCC OA CNS"
}
```

Add a `menus` entry so it appears in the tree item context menu:

```json
"view/item/context": [
  {
    "command": "winccoaCns.resolveDatapoint",
    "when": "view == winccoaCns && viewItem == cnsNode",
    "group": "winccoa@2"
  }
]
```

Register it in `extension.ts`:

```typescript
context.subscriptions.push(
  vscode.commands.registerCommand('winccoaCns.resolveDatapoint', async (item: CnsNodeItem) => {
    const dp = await httpClient.resolveDatapoint(item.info.path);
    await vscode.env.clipboard.writeText(dp);
  }),
);
```

---

## Checklist

- [ ] Endpoint added to `cns-server.js` with Bearer token check
- [ ] JSDoc endpoint list at top of `cns-server.js` updated
- [ ] Typed method added to `CnsHttpClient`
- [ ] Command registered in `extension.ts` and declared in `package.json`
- [ ] `make typecheck` passes
- [ ] `make build` succeeds
- [ ] Manually tested with a live WinCC OA project (or smoke-tested via `GET /health`)
