# WinCC OA CNS Browser

A VS Code extension that displays the **WinCC OA Component Naming System (CNS)** tree with live updates.

> **Requires** a running WinCC OA CNS manager (`managers/cns-server.js`) in your WinCC OA project.
> See [docs/manager-setup.md](docs/manager-setup.md) for the full setup guide.

## Features

- 📂 **Lazy-loading tree view** in the Explorer panel — Views → Trees → Nodes
- ⚡ **Live updates** via SSE — tree refreshes automatically on any CNS change
- 📋 **Copy commands** — right-click to copy a node's CNS path or linked datapoint name
- 🔄 **Auto-reconnect** — SSE stream reconnects with exponential backoff if the manager restarts

## Requirements

| Requirement | Details |
|-------------|---------|
| VS Code | ≥ 1.80 |
| WinCC OA project | With the CNS `node` manager (`cns-server.js`) running |
| [vscode-winccoa-project-admin](https://marketplace.visualstudio.com/items?itemName=RichardJanisch.winccoa-project-admin) | Recommended for adding the manager to your project |

## Quick Setup

1. Copy `managers/cns-server.js` and a configured `.env` (from `.env.example`) into your
   WinCC OA project's `javascript/` directory.
2. Add a `node` manager pointing to `javascript/cns-server.js` via the **WinCC OA Project Admin**
   extension, or use the command **WinCC OA CNS: Add CNS Manager to WinCC OA Project**.
3. Start the manager.
4. Configure VS Code settings:
   - `winccoaCns.serverUrl` → e.g. `http://localhost:4712`
   - `winccoaCns.token` → the same value as `CNS_SERVER_TOKEN` in `.env`

See [docs/manager-setup.md](docs/manager-setup.md) for detailed instructions.

## VS Code Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `winccoaCns.serverUrl` | `http://localhost:4712` | URL of the CNS HTTP manager |
| `winccoaCns.token` | _(empty)_ | Bearer token — must match `CNS_SERVER_TOKEN` in manager `.env` |

## Usage

Once the manager is running and settings are configured:

1. The **WinCC OA CNS** panel appears in the Explorer sidebar.
2. Expand views and trees to browse the CNS hierarchy.
3. The status bar shows ● CNS (green) when live updates are active.

### Commands

| Command | Description |
|---------|-------------|
| `WinCC OA CNS: Refresh CNS Tree` | Force-refresh the entire tree |
| `WinCC OA CNS: Copy CNS Path` | Copy the selected node's full CNS path |
| `WinCC OA CNS: Copy Datapoint Name` | Copy the linked datapoint name |
| `WinCC OA CNS: Add CNS Manager to WinCC OA Project` | Register the CNS manager via project-admin |

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
│   ├── cnsHttpClient.ts      # REST HTTP client for the CNS manager
│   ├── cnsEventSubscriber.ts # SSE stream + auto-reconnect
│   ├── cnsTreeProvider.ts    # VS Code TreeDataProvider
│   ├── cnsTreeItem.ts        # TreeItem subclasses (view / node)
│   ├── extensionOutput.ts    # OutputChannel wrapper
│   └── types.ts              # CnsNodeInfo interface
├── managers/
│   ├── cns-server.js         # WinCC OA node manager (HTTP server)
│   └── .env.example          # Configuration template
├── docs/
│   └── manager-setup.md      # Full manager setup guide
├── scripts/
│   └── test-local.js         # Local install + launch automation
├── resources/
│   └── cns.svg               # Activity bar icon
├── Makefile                  # Build orchestration
└── dist/
    └── extension.js          # esbuild output
```

## CNS HTTP API (manager endpoints)

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Server health check |
| `/cns/views` | POST | List all CNS views |
| `/cns/trees` | POST | List tree roots for a view |
| `/cns/children` | POST | List children of a CNS node |
| `/cns/events` | GET | SSE stream for live CNS change notifications |

## License

MIT
