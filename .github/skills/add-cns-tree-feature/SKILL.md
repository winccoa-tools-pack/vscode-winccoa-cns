---
name: add-cns-tree-feature
description: >
  How to add a new item type, context menu action, or display feature to the
  WinCC OA CNS tree view in the VS Code extension. Use this skill when
  extending CnsTreeItem, CnsTreeProvider, or adding new commands to tree nodes.
---

# Add a New CNS Tree Feature

Use this skill when you want to:
- Add a new tree item type (e.g. a "Disconnected" placeholder, a loading spinner item)
- Add a new context menu command to existing tree nodes
- Change how nodes are displayed (icons, descriptions, badges, tooltips)
- Add inline buttons ("inline" menu group) to tree items

---

## Tree Item Architecture

```
CnsItem  (= CnsViewItem | CnsNodeItem)
  ├── CnsViewItem    contextValue: 'cnsView'   — top-level view (e.g. "Default")
  └── CnsNodeItem    contextValue: 'cnsTree'   — root node of a view
                                  'cnsNode'    — regular CNS node
```

Every item extends `vscode.TreeItem`. The `contextValue` property controls which
`menus` entries are shown in `package.json`.

---

## Step 1 — Add a New Item Type (optional)

Add the new class to `src/cnsTreeItem.ts`:

```typescript
export class CnsStatusItem extends vscode.TreeItem {
  readonly contextValue = 'cnsStatus';

  constructor(message: string) {
    super(message, vscode.TreeItemCollapsibleState.None);
    this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
    this.tooltip = message;
  }
}
```

Update the `CnsItem` union type:

```typescript
export type CnsItem = CnsViewItem | CnsNodeItem | CnsStatusItem;
```

---

## Step 2 — Return the New Item from `CnsTreeProvider`

Open `src/cnsTreeProvider.ts`. Add the new type to the return of `getChildren()`:

```typescript
async getChildren(element?: CnsItem): Promise<CnsItem[]> {
  if (this.state === 'disconnected' || !this.client) {
    return [new CnsStatusItem('Not connected — configure winccoaCns.serverUrl')];
  }
  // ... existing logic ...
}
```

---

## Step 3 — Change Node Display

To change icon, description, or badge on `CnsNodeItem`, edit the constructor
in `src/cnsTreeItem.ts`:

```typescript
// Show a warning icon when no DP is linked
if (!info.linkedDp) {
  this.iconPath = new vscode.ThemeIcon('warning', new vscode.ThemeColor('list.warningForeground'));
} else {
  this.iconPath = new vscode.ThemeIcon('symbol-variable');
}

// VS Code 1.90+: show a badge with a count
// this.badge = { value: childCount, tooltip: `${childCount} children` };
```

---

## Step 4 — Add a Context Menu Command

**In `package.json`** — declare the command and menu entry:

```json
"contributes": {
  "commands": [
    {
      "command": "winccoaCns.copyPath",
      "title": "Copy CNS Path",
      "category": "WinCC OA CNS",
      "icon": "$(clippy)"
    }
  ],
  "menus": {
    "view/item/context": [
      {
        "command": "winccoaCns.copyPath",
        "when": "view == winccoaCns && viewItem =~ /^cnsNode|cnsTree$/",
        "group": "winccoa@1"
      }
    ],
    "view/title": [
      {
        "command": "winccoaCns.refresh",
        "when": "view == winccoaCns",
        "group": "navigation"
      }
    ]
  }
}
```

**In `extension.ts`** — register the command handler:

```typescript
context.subscriptions.push(
  vscode.commands.registerCommand('winccoaCns.copyPath', async (item: CnsNodeItem) => {
    await vscode.env.clipboard.writeText(item.info.path);
    vscode.window.showInformationMessage(`Copied: ${item.info.path}`);
  }),
);
```

---

## Step 5 — Add an Inline Button (optional)

Inline buttons appear directly on hover in the tree row. Use a `_`-prefixed
command name with a `#inline` suffix in the `group`:

```json
"menus": {
  "view/item/context": [
    {
      "command": "winccoaCns.copyPath",
      "when": "view == winccoaCns && viewItem =~ /^cnsNode|cnsTree$/",
      "group": "inline"
    }
  ]
}
```

The command must have an `icon` defined.

---

## Checklist

- [ ] New item class added to `src/cnsTreeItem.ts` with correct `contextValue`
- [ ] `CnsItem` union type updated if a new class was added
- [ ] `getChildren()` returns the new item where appropriate
- [ ] Command declared in `package.json` `contributes.commands`
- [ ] Menu entry added in `package.json` `contributes.menus` with correct `when`
- [ ] Command registered in `extension.ts` with `context.subscriptions.push(...)`
- [ ] `make typecheck` passes
- [ ] `make build` succeeds
