---
name: winccoa-chat-participant
description: >
  How to add a VS Code Copilot Chat Participant (@winccoa-cns) to the extension
  so users can ask natural-language questions about the live CNS tree directly
  in the Copilot Chat panel. Use this skill when implementing AGENTS.md §12.7.
---

# Add a VS Code Copilot Chat Participant (`@winccoa-cns`)

Use this skill when implementing the `@winccoa-cns` chat participant described
in AGENTS.md §12.7. It lets users ask questions like:

```
@winccoa-cns What datapoint is linked to Plant.Building1.HVAC.Pump01?
@winccoa-cns List all nodes under the Electrical view.
@winccoa-cns Are there any nodes without a linked datapoint?
```

**Requires:** VS Code ≥ 1.90 and the GitHub Copilot extension.

---

## Step 1 — Declare the Participant in `package.json`

```json
"contributes": {
  "chatParticipants": [
    {
      "id": "winccoa-cns.participant",
      "name": "winccoa-cns",
      "fullName": "WinCC OA CNS",
      "description": "Ask questions about the live WinCC OA CNS tree",
      "isSticky": true
    }
  ]
}
```

Add `vscode.lm` to `activationEvents` if not already present:

```json
"activationEvents": ["onStartupFinished"]
```

---

## Step 2 — Register the Handler in `extension.ts`

Add the participant registration inside `activate()`. The handler receives
a `vscode.ChatRequest` and streams responses back:

```typescript
import type { CnsHttpClient } from './cnsHttpClient.js';

// Inside activate():
const participant = vscode.chat.createChatParticipant(
  'winccoa-cns.participant',
  async (request, _context, stream, token) => {
    if (!httpClient) {
      stream.markdown('⚠️ Not connected. Configure `winccoaCns.serverUrl` and `winccoaCns.token`.');
      return;
    }

    const prompt = request.prompt.trim();

    // --- Resolve datapoint by CNS path ---
    const resolveMatch = prompt.match(/(?:datapoint|dp).+?([A-Za-z0-9_.]+\.[A-Za-z0-9_.]+)/i);
    if (resolveMatch) {
      const cnsPath = resolveMatch[1];
      try {
        stream.markdown(`Looking up **${cnsPath}**…\n\n`);
        const dp = await httpClient.resolveDatapoint(cnsPath);
        stream.markdown(dp ? `Linked datapoint: \`${dp}\`` : `No datapoint linked to \`${cnsPath}\`.`);
      } catch (err) {
        stream.markdown(`Error: ${String(err)}`);
      }
      return;
    }

    // --- List views ---
    if (/views?|list views/i.test(prompt)) {
      try {
        const data = await httpClient.callTool<{ views: string[] }>('cns.cns_get_views', {});
        stream.markdown('**CNS Views:**\n\n' + data.views.map(v => `- \`${v}\``).join('\n'));
      } catch (err) {
        stream.markdown(`Error: ${String(err)}`);
      }
      return;
    }

    // --- Fallback: forward to language model ---
    const messages = [
      vscode.LanguageModelChatMessage.User(
        `You are a WinCC OA CNS expert. The user asked: "${prompt}". ` +
        `Explain how to find the answer using the CNS tree browser.`,
      ),
    ];
    const lmResponse = await request.model.sendRequest(messages, {}, token);
    for await (const chunk of lmResponse.text) {
      stream.markdown(chunk);
    }
  },
);

participant.iconPath = vscode.Uri.joinPath(context.extensionUri, 'resources', 'cns.svg');
context.subscriptions.push(participant);
```

---

## Step 3 — Add Follow-Up Suggestions

Return follow-up questions to help users discover features:

```typescript
participant.followupProvider = {
  provideFollowups(_result, _context, _token) {
    return [
      { prompt: 'List all CNS views', label: 'List views', command: 'winccoa-cns' },
      { prompt: 'Are there any nodes without a linked datapoint?', label: 'Health check' },
    ];
  },
};
```

---

## Step 4 — Extend `CnsHttpClient` for Participant Use

The participant needs methods like `resolveDatapoint()`. Add them following the
`add-manager-endpoint` skill. Ensure the client instance created in `activate()`
is accessible to the participant handler (close over it or pass it in).

---

## Slash Commands (optional)

Register slash commands for quick actions:

```json
"contributes": {
  "chatParticipants": [
    {
      "id": "winccoa-cns.participant",
      "commands": [
        { "name": "views",   "description": "List all CNS views" },
        { "name": "resolve", "description": "Resolve a CNS path to its datapoint" },
        { "name": "health",  "description": "Check for CNS structural issues" }
      ]
    }
  ]
}
```

Handle them in the request handler:

```typescript
if (request.command === 'views') { /* ... */ }
if (request.command === 'resolve') { /* ... */ }
```

---

## Checklist

- [ ] `chatParticipants` entry in `package.json` with `id`, `name`, `description`
- [ ] `vscode.chat.createChatParticipant()` called in `activate()`
- [ ] Handler streams markdown responses via `stream.markdown()`
- [ ] Handler returns early with error message when `httpClient` is not connected
- [ ] Participant disposed via `context.subscriptions.push(participant)`
- [ ] `followupProvider` registered for discovery
- [ ] Tested in VS Code Chat with `@winccoa-cns <prompt>`
- [ ] `make typecheck` passes (ensure `@types/vscode` ≥ 1.90)
