# AGENTS.md — WinCC OA CNS Browser

This file is the authoritative guide for AI coding agents working in this repository.
Read it in full before making any changes.

---

## Table of Contents

1. [Project Overview](#1-project-overview)
2. [Architecture](#2-architecture)
3. [Repository Map](#3-repository-map)
4. [Development Workflow](#4-development-workflow)
5. [Key Concepts](#5-key-concepts)
6. [Coding Conventions](#6-coding-conventions)
7. [HTTP API Reference](#7-http-api-reference)
8. [WinCC OA CNS API Reference](#8-wincc-oa-cns-api-reference)
9. [Common Patterns](#9-common-patterns)
10. [What NOT to Do](#10-what-not-to-do)
11. [Testing & Validation](#11-testing--validation)
12. [Possible Agents & Skills](#12-possible-agents--skills)

---

## 1. Project Overview

**vscode-winccoa-cns** is a VS Code extension that displays the
[WinCC OA Component Naming System (CNS)](https://www.winccoa.com/documentation/WinCCOA/latest/en_US/CNS/cns-01.html)
tree with live updates.

CNS is WinCC OA's hierarchical naming layer that maps human-readable component
paths (e.g. `Plant.Building1.HVAC.Pump01`) to internal datapoints.
This extension makes the entire CNS hierarchy browsable from within VS Code.

**Two-component design:**

| Component | Language | Lives in |
|-----------|----------|----------|
| VS Code Extension | TypeScript | `src/` |
| WinCC OA Node Manager | JavaScript (CommonJS) | `managers/` |

The extension talks to the manager over HTTP/SSE on `localhost`.
The manager calls the `winccoa-manager` npm package to reach the live WinCC OA runtime.

---

## 2. Architecture

```
┌──────────────────────────────────────────────────────┐
│  VS Code (Extension Host)                            │
│                                                      │
│  extension.ts ──wires──► CnsTreeProvider             │
│       │                      │                       │
│       │               CnsHttpClient ──POST──►┐        │
│       │                                     │        │
│       └──► CnsEventSubscriber ─SSE GET──────►│        │
└────────────────────────────────────────────│───────-─┘
                                             │ HTTP :4712
┌────────────────────────────────────────────▼────────┐
│  WinCC OA Node Manager (cns-server.js)              │
│                                                     │
│  HTTP server ──► WinccoaManager                     │
│                      │                              │
│              winccoa-manager npm pkg                │
│                      │                              │
│              WinCC OA Runtime (EVENT/DATA)          │
└─────────────────────────────────────────────────────┘
```

**Data flow (read):**
1. User expands a tree node in VS Code.
2. `CnsTreeProvider.getChildren()` calls `CnsHttpClient.callTool()`.
3. Client POSTs to `cns-server.js` with a Bearer token.
4. Manager calls `winccoa.cnsGetChildren(nodePath)` and returns JSON.

**Data flow (live updates):**
1. `CnsEventSubscriber` holds an open SSE connection to `GET /cns/events`.
2. `cns-server.js` calls `winccoa.cnsAddObserver('', callback)` for all CNS changes.
3. On any change, the manager pushes a `notifications/resources/updated` SSE event.
4. The subscriber fires `onCnsChanged`, which triggers `CnsTreeProvider.refresh()`.

---

## 3. Repository Map

```
vscode-winccoa-cns/
├── src/
│   ├── extension.ts          # Entry point — activates extension, wires services
│   ├── cnsHttpClient.ts      # fetch-based REST client for cns-server.js
│   ├── cnsEventSubscriber.ts # SSE stream with exponential-backoff reconnect
│   ├── cnsTreeProvider.ts    # VS Code TreeDataProvider<CnsItem>
│   ├── cnsTreeItem.ts        # CnsViewItem / CnsNodeItem subclasses
│   ├── cnsSetupWizard.ts     # One-time project setup (copy script, gen token, register manager)
│   ├── managerConfigHelper.ts# Read/write WinCC OA config/progs manager registry
│   ├── extensionOutput.ts    # Singleton OutputChannel wrapper (log())
│   └── types.ts              # CnsNodeInfo interface (shared shape with manager)
├── managers/
│   ├── cns-server.js         # WinCC OA Node manager — standalone HTTP + SSE server
│   └── .env.example          # Config template (CNS_SERVER_PORT, CNS_SERVER_TOKEN)
├── docs/
│   ├── manager-setup.md      # End-user setup guide
│   ├── dev/
│   │   └── VISION.md         # Architecture principles and development roadmap
│   └── automation/           # CI/CD workflow documentation
├── scripts/
│   ├── test-local.js             # Local VSIX install + launch automation
│   ├── setup-test-environment.js # Test environment bootstrap
│   ├── run-vscode-test-coverage.mjs # Extension test coverage runner
│   └── report-v8-coverage.mjs    # V8 coverage report formatter
├── resources/
│   └── cns.svg               # Activity bar icon
├── dist/
│   └── extension.js          # esbuild output (do NOT edit)
├── bin/                      # Packaged .vsix files (do NOT commit)
├── esbuild.config.mjs        # Bundle config (single file, external: vscode)
├── tsconfig.json             # Strict TypeScript config
├── Makefile                  # Build targets (install, build, typecheck, package, …)
└── package.json              # Extension manifest + contributes (commands, views, config)
```

> **`dist/` and `bin/` are build artifacts — never edit them directly.**

---

## 4. Development Workflow

### Prerequisites

- Node.js ≥ 18
- VS Code ≥ 1.80 (for extension testing)
- A WinCC OA project with the CNS manager running (for end-to-end testing)

### Common commands

```bash
make install     # npm install
make build       # esbuild → dist/extension.js
make typecheck   # tsc --noEmit (type-check only, no emit)
make watch       # esbuild --watch (auto-rebuild on save)
make package     # vsce package → bin/*.vsix
make dev         # build + package
make all         # clean + install + build + package
```

Or directly with npm:

```bash
npm install
npm run build
npm run typecheck
npm run watch
```

### Before opening a PR

1. `make typecheck` — must pass with zero errors.
2. `make build` — must succeed.
3. Verify `dist/extension.js` is updated (git diff).

### Running the extension locally

```bash
# Option A — VS Code launch config (F5 in VS Code)
# Opens an Extension Development Host window.

# Option B — install VSIX
make package
make test-local TEST_WORKSPACE=/path/to/winccoa-project
```

---

## 5. Key Concepts

### CNS (Component Naming System)

CNS is WinCC OA's tree-structured naming layer. It maps plant/process semantics
onto datapoints. Key hierarchy levels:

```
View  (top-level grouping, e.g. "Plant", "Electrical")
  └─ Tree  (root node of a subtree)
       └─ Node  (arbitrary depth; leaf nodes link to a datapoint)
```

- **View path**: dot-separated, e.g. `Plant`
- **Node path**: dot-separated, e.g. `Plant.Building1.HVAC.Pump01`
- **Linked DP**: datapoint name wired to a leaf node (may be empty for structural nodes)
- **Display name**: multilingual; resolved per `winccoa.getProjectLangs()`

### CnsNodeInfo (shared type)

`src/types.ts` defines `CnsNodeInfo` — the plain-object representation used by
both the HTTP API and the VS Code tree. The manager's `toCnsNodeInfo()` converts
raw `WinccoaCnsTreeNode` objects from `winccoa-manager` into this shape.

```ts
interface CnsNodeInfo {
  path: string;          // Full dot-separated CNS path
  displayName: string;   // Resolved for the first available project language
  displayNames: Record<string, string>;  // All language variants
  linkedDp: string;      // Linked datapoint ('' if none)
  isTree: boolean;       // True for direct children of a view
  isLeaf: boolean;       // True when no children
  icon?: string;         // Optional WinCC OA icon path
}
```

> Keep `CnsNodeInfo` in sync between `src/types.ts` and `managers/cns-server.js`.
> The manager uses the same field names as a runtime contract.

### Bearer Token Auth

All HTTP endpoints (except `GET /health`) require:

```
Authorization: Bearer <CNS_SERVER_TOKEN>
```

The token is set in the manager's `.env` file and mirrored in VS Code setting
`winccoaCns.token`. Generate with `node -e "console.log(require('crypto').randomUUID())"`.

---

## 6. Coding Conventions

### TypeScript (src/)

- **Strict mode** is enabled (`tsconfig.json`). No `any`, no suppressed errors.
- All source files use **ESM-style imports with `.js` extensions**
  (TypeScript resolves `.ts` → `.js` at compile time for esbuild).
  ```ts
  import { log } from './extensionOutput.js';  // ✓
  import { log } from './extensionOutput';     // ✗
  ```
- Use `async/await`; avoid raw Promise chains.
- Dispose of all `vscode.Disposable`s via `context.subscriptions.push(...)`.
- Log with `log()` from `extensionOutput.ts` — never `console.log` in extension code.

### JavaScript (managers/)

- CommonJS (`require`/`module.exports`) — the WinCC OA Node manager loader expects CJS.
- No TypeScript transpilation step for manager files.
- `'use strict'` at the top of every manager script.
- Log with `console.log` / `console.error` prefixed with `[cns-server]`.
- No external npm dependencies beyond `winccoa-manager` (already available in the OA runtime).

### Formatting (Prettier)

The repository uses Prettier with the following rules (`.prettierrc.json`):

| Rule | Value |
|------|-------|
| `printWidth` | 100 |
| `tabWidth` | 4 (spaces) |
| `semi` | true |
| `singleQuote` | true |
| `trailingComma` | `"all"` |
| `arrowParens` | `"always"` |

Match this style in all new `.ts` and `.js` files. No lint/format scripts are wired into
`package.json` yet — run `npx prettier --write src/` manually before committing.

### Naming

| Entity | Convention | Example |
|--------|------------|---------|
| Classes | PascalCase | `CnsHttpClient` |
| Interfaces | PascalCase, no `I` prefix | `CnsNodeInfo` |
| Constants | SCREAMING_SNAKE in modules, camelCase in functions | `BACKOFF_MAX_MS` |
| VS Code commands | `winccoaCns.<verb>` | `winccoaCns.refresh` |
| VS Code settings | `winccoaCns.<name>` | `winccoaCns.serverUrl` |
| HTTP endpoints | `/cns/<resource>` | `/cns/children` |

---

## 7. HTTP API Reference

All endpoints are served by `managers/cns-server.js` on `http://127.0.0.1:<CNS_SERVER_PORT>`.

### `GET /health`

No auth required.

**Response:**
```json
{ "status": "ok", "version": "1.0.0" }
```

### `POST /cns/views`

Returns all CNS view names.

**Request body** (optional):
```json
{ "system": "System1" }
```

**Response:**
```json
{ "views": ["Plant", "Electrical", "Network"] }
```

### `POST /cns/trees`

Returns the tree-root nodes for a view.

**Request body:**
```json
{ "viewPath": "Plant" }
```

**Response:**
```json
{
  "viewPath": "Plant",
  "trees": [ <CnsNodeInfo>, … ]
}
```

### `POST /cns/children`

Returns the children of a CNS node.

**Request body:**
```json
{ "nodePath": "Plant.Building1.HVAC" }
```

**Response:**
```json
{
  "nodePath": "Plant.Building1.HVAC",
  "children": [ <CnsNodeInfo>, … ]
}
```

### `GET /cns/events` (SSE)

Long-lived SSE stream. Auth required.

**Events fired on every CNS change:**
```
data: {"method":"notifications/resources/updated","params":{"uri":"cns://Plant.Building1.HVAC.Pump01"}}
```

The `uri` field uses the `cns://` scheme followed by the changed node path.
An empty path segment (`cns://`) means an unspecified/global change.

---

## 8. WinCC OA CNS API Reference

The manager uses these `winccoa-manager` methods:

| Method | Description |
|--------|-------------|
| `winccoa.cnsGetViews(system?)` | Returns `string[]` of view names. `system` defaults to the local system. |
| `winccoa.cnsGetTrees(viewPath)` | Returns `WinccoaCnsTreeNode[]` — the root nodes of a view. |
| `winccoa.cnsGetChildren(nodePath)` | Returns `WinccoaCnsTreeNode[]` — direct children of a node. |
| `winccoa.cnsAddObserver(path, callback)` | Subscribe to CNS changes. Empty string `''` subscribes to all. Callback: `(action, node) => void`. |
| `winccoa.getProjectLangs()` | Returns `string[]` of configured language codes (e.g. `['en_US', 'de_AT']`). |

**`WinccoaCnsTreeNode` shape** (runtime type from `winccoa-manager`):

```ts
interface WinccoaCnsTreeNode {
  path: string;
  displayNames?: Record<string, string>;
  linkedDp?: string;
  isTree?: boolean;
  isLeaf?: boolean;
  icon?: string;
}
```

> All `cns*` methods are async and must be awaited.

**Full API docs:**
https://www.winccoa.com/documentation/WinCCOA/latest/en_US/apis/winccoa-manager/2.2.6/index.html

---

## 9. Common Patterns

### Adding a new HTTP endpoint to the manager

1. Write a handler function in `managers/cns-server.js`:
   ```js
   async function handleMyEndpoint(res, body) {
     const result = await winccoa.someMethod(body.param);
     json(res, 200, { result });
   }
   ```
2. Add a route in the `http.createServer` callback:
   ```js
   if (req.method === 'POST' && req.url === '/cns/my-endpoint') {
     const body = await readBody(req);
     await handleMyEndpoint(res, body);
     return;
   }
   ```

### Adding a new VS Code command

1. Declare in `package.json` under `contributes.commands`.
2. Optionally add to `contributes.menus` for context-menu visibility.
3. Register in `extension.ts`:
   ```ts
   context.subscriptions.push(
     vscode.commands.registerCommand('winccoaCns.myCommand', async (item: CnsNodeItem) => {
       // implementation
     }),
   );
   ```

### Adding a VS Code setting

1. Declare in `package.json` under `contributes.configuration.properties`.
2. Read in `extension.ts` via:
   ```ts
   const cfg = vscode.workspace.getConfiguration('winccoaCns');
   const value = cfg.get<string>('myNewSetting', 'default');
   ```
3. React to changes in the `onDidChangeConfiguration` handler already wired in `extension.ts`.

### Calling `CnsHttpClient` from a new service

```ts
const data = await httpClient.post<{ children: CnsNodeInfo[] }>(
  '/cns/children',
  { nodePath: 'Plant.Building1' },
);
```

Use `.callTool()` only for the three standard tool-name mappings; use `.post()` for any new endpoints.

---

## 10. What NOT to Do

- **Do not import `vscode` in `managers/cns-server.js`** — it runs in the WinCC OA runtime, not VS Code.
- **Do not use ESM (`import`/`export`) in `managers/`** — the WinCC OA node manager requires CommonJS.
- **Do not add npm dependencies to `managers/cns-server.js`** — only `winccoa-manager` and Node.js built-ins are available in the OA runtime.
- **Do not edit `dist/extension.js` directly** — it is fully regenerated on every build.
- **Do not commit `bin/*.vsix`** — packages are build artifacts.
- **Do not log sensitive data** (tokens, passwords) via `log()` or `console`.
- **Do not skip the Bearer token check** for any endpoint that returns CNS data.
- **Do not change `CnsNodeInfo` fields without updating both** `src/types.ts` and `managers/cns-server.js`'s `toCnsNodeInfo()` — they are a shared contract.
- **Do not catch-and-swallow errors silently** — at minimum log with `log()` / `console.error`.

---

## 11. Testing & Validation

There are currently no automated test files. Until a test suite is added:

1. **Type-check** — `make typecheck` must pass (zero TypeScript errors).
2. **Build** — `make build` must succeed.
3. **Manual smoke test** checklist:
   - Manager starts without errors in WinCC OA.
   - `GET http://localhost:4712/health` returns `{"status":"ok"}`.
   - `POST /cns/views` returns the expected view list.
   - Extension tree shows views → trees → nodes correctly.
   - Status bar shows `● CNS` (live) when connected.
   - Editing a CNS node in WinCC OA triggers a tree refresh.
   - Disconnecting the manager shows `◯ CNS` and the extension reconnects.
4. When adding new HTTP endpoints: manually test with `curl`:
   ```bash
   curl -s -X POST http://localhost:4712/cns/views \
     -H "Authorization: Bearer $TOKEN" \
     -H "Content-Type: application/json" \
     -d '{}'
   ```

---

## 12. Possible Agents & Skills

This section describes AI agent capabilities and MCP skills that could be built on top of
this codebase or alongside it. Each entry includes the required API surface and implementation notes.

---

### 12.1 CNS Tree Explorer (MCP Tool Skill)

**Purpose:** Let any AI agent navigate the full CNS hierarchy on demand.

**Tools to expose:**

| Tool name | Description | Parameters |
|-----------|-------------|------------|
| `cns_get_views` | List all CNS views in the project | `system?` |
| `cns_get_trees` | List root nodes of a view | `viewPath` |
| `cns_get_children` | List children of a node | `nodePath` |
| `cns_get_subtree` | Recursively walk a subtree up to `depth` | `nodePath`, `depth` |
| `cns_search` | Find nodes whose display name or path matches a query | `query`, `viewPath?` |

**Implementation notes:**
- The HTTP API already exposes views/trees/children — wrap them in an MCP server.
- `cns_get_subtree` would require recursive calls to `/cns/children`; implement with a depth limit (default 3) to avoid overwhelming the runtime.
- `cns_search` could do a breadth-first walk and filter; cache results with a TTL keyed on the SSE change counter.

---

### 12.2 Datapoint Resolver (MCP Tool Skill)

**Purpose:** Translate CNS paths to/from WinCC OA datapoint names, enabling agents to
work with semantic names rather than internal DP paths.

**Tools to expose:**

| Tool name | Description | Parameters |
|-----------|-------------|------------|
| `cns_resolve_dp` | Return the linked DP name for a CNS path | `cnsPath` |
| `cns_find_by_dp` | Find the CNS node(s) linked to a datapoint | `dpName` |

**Implementation notes:**
- `cns_resolve_dp`: already available via `CnsNodeInfo.linkedDp`.
- `cns_find_by_dp`: requires a reverse index — build it by walking the tree once and caching `dp → cnsPath` entries; invalidate on SSE change events.
- Add a `GET /cns/resolve` endpoint to `cns-server.js` for direct use.

---

### 12.3 CNS Change Monitor (Event-Driven Agent Skill)

**Purpose:** Trigger agent actions whenever specific CNS nodes change (e.g. alert on
value change, run a workflow on topology update).

**Skill design:**
- Subscribe to the existing `GET /cns/events` SSE stream.
- Match incoming `cns://<path>` URIs against a user-defined filter list.
- Emit structured change events to downstream agent pipelines (webhooks, message queues).

**New endpoint needed:**
```
POST /cns/watch
Body: { "paths": ["Plant.Building1.HVAC"], "webhookUrl": "https://..." }
```

The manager stores watchers in memory and calls the webhook on matching SSE events.

---

### 12.4 CNS Health & Diagnostics Agent

**Purpose:** Detect structural issues in the CNS configuration (broken DP links,
empty trees, missing display names, duplicate paths) and report them.

**Checks to implement:**

| Check | Description |
|-------|-------------|
| Orphaned nodes | Nodes with no linked DP and no children |
| Missing display names | Nodes with an empty `displayName` in any configured language |
| Invalid DP links | `linkedDp` references a DP that does not exist in the runtime |
| Duplicate paths | Multiple nodes with the same fully-qualified CNS path |

**Implementation:** Walk the full tree via recursive `cns_get_subtree`, run checks
server-side in the manager, expose as `GET /cns/health/full`.

---

### 12.5 CNS Documentation Generator Agent

**Purpose:** Auto-generate markdown or HTML documentation for the CNS structure of a
WinCC OA project — useful for handover docs, audits, or onboarding.

**Output:** A table or nested list mapping every CNS node to its display name, DP,
and description, grouped by view.

**Implementation notes:**
- Walk the tree via `cns_get_subtree` with depth unlimited.
- Use `winccoa.dpGetDescription(dpName)` to enrich DP entries (add to manager if not yet exposed).
- Render as markdown or export to CSV.

---

### 12.6 CNS Setup & Migration Assistant Agent

**Purpose:** Guide a user through setting up or migrating the CNS structure for a new
project, or diffing two CNS snapshots to detect changes.

**Capabilities:**
- `cns_snapshot`: Serialize the entire CNS tree to a JSON file.
- `cns_diff`: Compare two snapshots, report added/removed/renamed nodes.
- `cns_import`: Recreate a CNS structure from a snapshot (using `winccoa.cnsCreate*` if available in the manager API).

**Implementation notes:**
- Snapshots are static JSON files — no special runtime needed for diff.
- Import requires write access to the WinCC OA runtime; guard with a confirmation step.

---

### 12.7 VS Code Copilot Chat Participant (@winccoa-cns)

**Purpose:** Answer questions about the CNS tree directly in the VS Code Copilot Chat panel.

**Example interactions:**
```
@winccoa-cns What datapoint is linked to Plant.Building1.HVAC.Pump01?
@winccoa-cns List all nodes under the Electrical view.
@winccoa-cns Are there any CNS nodes without a linked datapoint?
```

**Implementation:** Register a `vscode.chat.createChatParticipant('winccoa-cns', handler)`
in `extension.ts`. The handler calls `CnsHttpClient` to resolve answers at runtime.
Requires VS Code ≥ 1.90 (Copilot Chat API).

---

*Last updated: 2026-03-29*
