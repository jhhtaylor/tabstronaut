<p align="center">
  <img src="media/Tabstronaut.png" alt="Logo" width="200"/>
</p>

Tabstronaut is a tab management tool for VS Code. Archive tab groups and bring them back whenever you need them, save your current split-editor layout as a snapshot to restore it exactly as you left it, and keep ungrouped tabs organized alongside everything else so nothing gets lost.

![Tabstronaut in action](media/tabstronaut-demo.gif)

## Support the creator

<a href="https://www.buymeacoffee.com/jhhtaylor" target="_blank"><img src="https://cdn.buymeacoffee.com/buttons/v2/default-yellow.png" alt="Buy Me A Coffee" width="217" height="60"></a>

Love this extension? You can support its development with a small donation - completely optional! Your support helps me keep creating and improving tools like this.

## Features

- Create tab groups instantly
  - Collect your current or all open tabs into organized groups with a single click.
- Drag-and-drop mastery
  - Drag a group onto another group to reorder, onto a tab to nest it inside that group, or onto empty space to promote it to the top level.
- Share and revisit your workspaces
  - Save tab groups for later, export them to share, or bring back archived sets whenever inspiration strikes.
- Tab Snapshots
  - Save your entire split-editor layout, including pinned tabs, and restore it exactly as it was with one click. Click **Create New Tab Snapshot** (camera icon, `Ctrl+Alt+S` / `Cmd+Alt+S`) to save the current layout, and **Update Tab Snapshot** (`Ctrl+Alt+Shift+S` / `Cmd+Alt+Shift+S`) to refresh it later. Restore, rename, and delete it the same way as any other Tab Group. Shown with a square icon and a "(Tab Snapshot)" tooltip to tell it apart from regular groups.

## Tips

Check out [@tabstronaut_dev](https://x.com/tabstronaut_dev) for Tabstronaut tips and how-to videos.

### Keyboard Shortcuts

Every Tabstronaut action has a keyboard shortcut so you never need to touch the mouse.

| Action | Windows / Linux | macOS |
|--------|----------------|-------|
| **Create a new empty group** | `Ctrl+Alt+N` | `Cmd+Alt+N` |
| **Add current tab to a group** *(only shows groups the file isn't already in)* | `Ctrl+Alt+A` | `Cmd+Alt+A` |
| **Add all open tabs to a group** | `Ctrl+Alt+G` | `Cmd+Alt+G` |
| **Add current split's tabs to a group** | `Ctrl+Alt+Shift+G` | `Cmd+Alt+Shift+G` |
| **Create a new Tab Snapshot from the current split layout** | `Ctrl+Alt+S` | `Cmd+Alt+S` |
| **Update the focused Tab Snapshot** *(sidebar must have focus)* | `Ctrl+Alt+Shift+S` | `Cmd+Alt+Shift+S` |
| **Open / restore a group** | `Ctrl+Alt+O` | `Cmd+Alt+O` |
| **Rename a group** | `Ctrl+Alt+E` | `Cmd+Alt+E` |
| **Rename focused group** *(sidebar must have focus)* | `F2` | `F2` |
| **Delete focused group** *(sidebar must have focus)* | `Delete` | `⌫ Delete` |
| **Restore focused group** *(sidebar must have focus)* | `Ctrl+Alt+Enter` | `Cmd+Alt+Enter` |
| **Remove current tab from a group** | `Ctrl+Alt+R` | `Cmd+Alt+R` |
| **Delete a group** | `Ctrl+Alt+Shift+R` | `Cmd+Alt+Shift+R` |
| **Restore group 1–9 by number** | `Ctrl+Alt+1` – `Ctrl+Alt+9` | `Cmd+Alt+1` – `Cmd+Alt+9` |

The letter shortcuts (**A**, **G**, **Shift+G**, **O**, **E**, **R**, **Shift+R**) open a quick-pick menu — start typing to filter the list. **N** silently creates a group with no menu when the *Prompt for Group Details* setting is off (the default). The number shortcuts restore a top-level group immediately without any menu. **F2**, **Delete** (⌫ on Mac), **Ctrl+Alt+Enter**, and **Ctrl+Alt+Shift+S** work when a group is selected in the Tabstronaut sidebar — navigate with arrow keys, then press F2 to rename, Delete/⌫ to delete, Ctrl+Alt+Enter to restore in place, or Ctrl+Alt+Shift+S to update a selected Tab Snapshot with your current layout. **Ctrl+Alt+S** saves your current layout as a brand new Tab Snapshot, prompting for a name.

> **Tip:** All of these can also be reached from the Tabstronaut sidebar, the right-click menu in the editor tab bar, or the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`).

## Extension Settings

To tailor Tabstronaut to your preferences:

- Click the "..." (More Options...) button in the Tabstronaut title bar and click "Settings".

OR

- Open **VS Code Settings**: **`Ctrl+Shift+P`** → "Preferences: Open Settings (UI)" and search for "Tabstronaut".

Your changes will be saved automatically.

## Privacy

Tabstronaut includes a tab group suggestion feature that learns which files you tend to open together. Here is exactly what it does and does not do.

**What is always true regardless of AI:**

- **What is tracked:** The file paths of tabs you have open in VS Code, and how often those files appear open at the same time.
- **Where it is stored:** Entirely on your local machine, inside VS Code's built-in workspace storage (`workspaceState`).
- **File contents are never read** under any circumstances.

You can clear all tracked data at any time by running **Tabstronaut: Clear Tab Usage Data** from the command palette.

**AI-powered naming (optional):**

If you have a VS Code language model provider installed (such as GitHub Copilot), Tabstronaut will use it to generate a better group name. In that case:

- **What is sent:** Only the bare **file names** of the suggested files (e.g. `Button.tsx, Input.tsx`) — never full paths, never file contents.
- **Where it goes:** To whichever language model provider you have enabled in VS Code. For GitHub Copilot this means Microsoft's servers, subject to your existing Copilot agreement.

The suggestion item shows a **sparkle icon** when AI naming is active, and a **lightbulb icon** when using the local heuristic only.

**Settings:**

Both features can be controlled independently in VS Code Settings (search for "Tabstronaut"):

- **Enable Tab Group Suggestions** — master switch. Turn this off to disable all usage tracking and suggestions entirely.
- **Enable AI Group Naming** — turn this off to keep suggestions but use only the local heuristic for naming. No data will leave your device.

## Known Issues

If you encounter any other problem, please open an [Issue](https://github.com/jhhtaylor/tabstronaut/issues) on the GitHub repository.

## Release Notes

For a detailed list of all updates in bullet point format, see our [Change Log](CHANGELOG.md).
