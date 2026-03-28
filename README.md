# WinCC OA CNS Browser

A VS Code extension that displays the **WinCC OA Component Naming System (CNS)** tree with live updates.

> **Requires** the [WinCC OA MCP Server](https://github.com/rjanisch/vscode-winccoa-mcp-server) extension to be installed and connected.

## Features

- 📂 **Lazy-loading tree view** in the Explorer panel — Views → Trees → Nodes
- ⚡ **Live updates** via SSE — tree refreshes automatically on any CNS change
- 📋 **Copy commands** — right-click to copy a node's CNS path or linked datapoint name
- 🔄 **Auto-reconnect** — SSE stream reconnects with exponential backoff if the MCP server restarts

## Requirements

| Requirement | Details |
|-------------|---------|
| VS Code | ≥ 1.80 |
| [WinCC OA MCP Server](https://marketplace.visualstudio.com/items?itemName=RichardJanisch.winccoa-mcp-server) | Must be installed and configured |
| WinCC OA project | With an active MCP server manager running |

## Usage

1. Install and configure the **WinCC OA MCP Server** extension.
2. Connect to your WinCC OA project.
3. The **WinCC OA CNS** panel appears in the Explorer sidebar.
4. Expand views and trees to browse the CNS hierarchy.

### Commands

| Command | Description |
|---------|-------------|
| `WinCC OA CNS: Refresh CNS Tree` | Force-refresh the entire tree |
| `WinCC OA CNS: Copy CNS Path` | Copy the selected node's full CNS path |
| `WinCC OA CNS: Copy Datapoint Name` | Copy the linked datapoint name |

## Development

```bash
# Install dependencies
make install          # or: npm install

# Build (esbuild bundle → dist/)
make build            # or: npm run build

# Type-check only (no emit)
make typecheck        # or: npm run typecheck

# Watch mode (auto-recompile on save)
make watch            # or: npm run watch

# Package .vsix into bin/
make package          # or: npm run package

# Build + package
make dev

# Full clean build
make all              # clean + install + build + package

# Install into VS Code for local testing
make test-local TEST_WORKSPACE=/path/to/project

# Show all available targets
make help
```

## Architecture

```
vscode-winccoa-cns/
├── src/
│   ├── extension.ts          # Activation, wires services together
│   ├── cnsMcpClient.ts       # HTTP JSON-RPC 2.0 MCP client (fetch-based)
│   ├── cnsEventSubscriber.ts # SSE stream + auto-reconnect
│   ├── cnsTreeProvider.ts    # VS Code TreeDataProvider
│   ├── cnsTreeItem.ts        # TreeItem subclasses (view / node)
│   ├── extensionApiTypes.ts  # Types mirrored from vscode-winccoa-mcp-server
│   ├── extensionOutput.ts    # OutputChannel wrapper
│   └── types.ts              # CnsNodeInfo interface
├── scripts/
│   └── test-local.js         # Local install + launch automation
├── resources/
│   └── cns.svg               # Activity bar icon
├── Makefile                  # Build orchestration
└── dist/
    └── extension.js          # esbuild output (15 KB)
```

## CNS URI Scheme

Live updates use `cns://` resource URIs over MCP SSE:

| URI | Scope |
|-----|-------|
| `cns://` | All CNS changes (any view) |
| `cns://ViewName` | Changes within a specific view |

## License

MIT
