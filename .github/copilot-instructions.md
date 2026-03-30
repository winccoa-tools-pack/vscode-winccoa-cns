# GitHub Copilot Instructions — vscode-winccoa-cns

## Project at a Glance

**WinCC OA CNS Browser** is a VS Code extension that renders the WinCC OA Component Naming System (CNS) hierarchy as a live tree view.
Two components work together:

| Component | Language | Entry point |
|-----------|----------|-------------|
| VS Code Extension | TypeScript (ESM via esbuild) | `src/extension.ts` |
| WinCC OA Node Manager | JavaScript (CommonJS) | `managers/cns-server.js` |

They communicate over `HTTP :4712` (Bearer token auth).
The manager talks to the live WinCC OA runtime via the `winccoa-manager` npm package.

## TypeScript Conventions

- **Strict mode** — `tsconfig.json` enables all strict flags. No `any`, no `!` non-null assertions unless unavoidable and commented.
- **ESM file extensions** — every relative import inside `src/` must end in `.js` (esbuild requirement), e.g. `import { log } from './extensionOutput.js'`.
- **Named exports only** — no default exports.
- **Async/await** everywhere; no `.then()` chains.
- **`void` operator** for fire-and-forget calls: `void applyConfig()`.
- Run `make typecheck` after every change; zero type errors required.
- Run `make build` to verify the esbuild bundle compiles.

## VS Code Extension Patterns

- All disposables must be pushed to `context.subscriptions`.
- Commands are registered with `vscode.commands.registerCommand` in `extension.ts` and declared in `package.json` under `contributes.commands`.
- The CNS tree uses `vscode.window.createTreeView('winccoaCns', { treeDataProvider })`.
- Item context values (`contextValue`) must match the `when` clauses in `package.json` `menus`.
- Use `vscode.workspace.getConfiguration('winccoaCns')` to read settings.
- Log with `log()` from `src/extensionOutput.ts` — never use `console.log` in extension code.

## Manager (cns-server.js) Patterns

- CommonJS only — `require()`, not `import`.
- All HTTP endpoints follow the pattern: parse Bearer token → validate body → call `winccoa.*` → respond with JSON.
- Every new endpoint must be listed in the `Endpoints:` JSDoc comment at the top of `cns-server.js`.
- SSE clients are tracked in `sseClients: Set<ServerResponse>` and flushed on `push(event, data)`.
- Use the existing `buildCnsNodeInfo(node)` helper to convert WinCC OA CNS nodes to `CnsNodeInfo` objects.

## WinCC OA Concepts

- **CNS (Component Naming System):** hierarchical naming layer; maps human-readable paths like `Plant.HVAC.Pump01` to internal WinCC OA datapoints (DPs).
- **View:** top-level CNS container (e.g. `Default`, `Electrical`).
- **Tree:** root node inside a view.
- **Node:** any CNS element; has `path`, multilingual `displayNames`, and optionally a `linkedDp`.
- **Datapoint (DP):** WinCC OA's internal data entity; identified by a string like `Pump01.`.
- **Manager:** a process registered in WinCC OA's `config/progs`; `cns-server.js` runs as a node manager.

## CnsNodeInfo Type

```typescript
interface CnsNodeInfo {
  path: string;
  displayName: string;               // resolved for the current project language
  displayNames: Record<string, string>;
  linkedDp: string;                  // '' when no DP is linked
  isTree: boolean;
  isLeaf: boolean;
  icon?: string;
}
```

## Code Style

- Prettier (`npm run format`) + ESLint (`npm run lint`) must pass before commit.
- 2-space indent, single quotes, trailing commas (see `.prettierrc.json`).
- Short, focused functions. No function longer than ~50 lines without a good reason.
- Prefer `const`; use `let` only when reassignment is needed.

## What NOT to Do

- Do **not** edit files in `dist/` — those are build artifacts.
- Do **not** commit `bin/*.vsix` — built packages are ignored.
- Do **not** add runtime dependencies to the extension without updating `esbuild.config.mjs` externals.
- Do **not** use `vscode.window.showInputBox` for multi-step flows — use `CnsSetupWizard` patterns instead.
- Do **not** call `winccoa.*` functions from TypeScript — only the manager (CommonJS) talks to the runtime.
