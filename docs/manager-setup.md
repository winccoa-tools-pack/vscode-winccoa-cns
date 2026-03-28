# CNS Manager Setup Guide

This guide explains how to set up and run the standalone WinCC OA CNS HTTP manager so that
the **vscode-winccoa-cns** VS Code extension can display the CNS tree without requiring the
`winccoa-mcp-server` extension.

---

## Prerequisites

- WinCC OA installed and a project configured
- [vscode-winccoa-project-admin](https://marketplace.visualstudio.com/items?itemName=RichardJanisch.winccoa-project-admin) VS Code extension installed

---

## Step 1 — Copy the manager files

Copy the following files from this repository's `managers/` directory into the **`javascript/`**
folder of your WinCC OA project:

```
<WinCCOA-Project>/javascript/
  cns-server.js
  .env          ← created in the next step
```

> **Tip:** You can use the VS Code command **WinCC OA CNS: Add CNS Manager to WinCC OA Project**
> (`winccoaCns.addManager`) to start the registration wizard.

---

## Step 2 — Create and configure the `.env` file

Copy `managers/.env.example` to `<WinCCOA-Project>/javascript/.env` and fill in your values:

```dotenv
CNS_SERVER_PORT=4712
CNS_SERVER_TOKEN=<replace-with-a-long-random-secret>
```

Generate a random token with e.g.:

```bash
node -e "console.log(require('crypto').randomUUID())"
```

---

## Step 3 — Add the manager via vscode-winccoa-project-admin

1. Open the **WinCC OA Project Admin** panel in VS Code.
2. In the **Managers** tree, click **Add Manager**.
3. Select manager type: **`node`**.
4. Set the manager path/command to:
   ```
   javascript/cns-server.js
   ```
5. Confirm and save. The manager will appear in the list.
6. Start the manager.

---

## Step 4 — Configure VS Code settings

Open VS Code Settings (`Ctrl+,`) and search for `winccoaCns`:

| Setting | Value |
|---|---|
| `winccoaCns.serverUrl` | `http://localhost:4712` (or the port you set) |
| `winccoaCns.token` | The same value as `CNS_SERVER_TOKEN` in `.env` |

The CNS tree in the Explorer sidebar will connect automatically once both settings are configured.

---

## Troubleshooting

| Symptom | Cause / Fix |
|---|---|
| Status bar shows ⊙ CNS (orange) | `serverUrl` or `token` not configured — check VS Code settings |
| Status bar shows ◯ CNS (reconnecting) | Manager not running or wrong port — check WinCC OA logs |
| 401 Unauthorized in WinCC OA manager log | Token mismatch — verify `.env` and VS Code setting match |
| CNS tree shows "Error: …" | WinCC OA may still be starting — wait and refresh |
