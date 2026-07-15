# Change Log

All notable changes to the Tabstronaut extension will be documented in this file.

## [1.6.5]

- Reworded several tips in the panel's Tips row that read awkwardly or duplicated another tip, and added one covering the '+' icon in the editor toolbar for adding the active tab to a group.

## [1.6.4]

- **Tips row** — the Tab Groups panel now shows a rotating "Tip: ..." row at the bottom, cycling hourly through nearly 60 tips covering keyboard shortcuts, drag-and-drop, Tab Snapshots, and settings you might not have found yet. Turn it off with the new **Show Tips** setting (`tabstronaut.showTips`, on by default).
- Suggested-group rows are now labeled "Suggestion: ..." (previously "Suggested: ...") and the empty-state hint is now labeled "Get Started: ..." for consistent labeling across all three informational rows.

## [1.6.3]

- Converted `webpack.config.js` and `eslint.config.cjs` to TypeScript (`webpack.config.ts`, `eslint.config.ts`) for a fully TypeScript codebase.

## [1.6.2]

- **Export now uses relative paths** — `tabGroups-export.json` stores file paths relative to the workspace root instead of absolute paths. Exported files can be imported on any machine (or any location on the same machine) as long as the workspace folder structure matches. Pre-1.6.2 exports that contain absolute paths continue to import correctly.
- **Multi-root workspace support in export/import** — in workspaces with multiple root folders, exported paths are prefixed with the workspace folder name (e.g. `"frontend/src/App.tsx"`) so the correct root is resolved on import.
- **Graceful import with no workspace open** — importing when no workspace folder is open no longer produces silently broken paths; paths are passed through unchanged.

## [1.6.1]

- Updated the top-level description to reflect Tab Snapshots and Ungrouped Tabs alongside the original archive/restore workflow.
- **Create New Tab Snapshot** (`Ctrl+Alt+S` / `Cmd+Alt+S`) no longer requires 2+ editor panes. With a single pane open it now creates a Tab Snapshot containing that one pane, instead of showing an informational message.
- Renamed Tab Snapshot column sub-groups from "Column N" to "Pane N" to avoid confusion with Tab Groups and VS Code's own "editor group" terminology.

## [1.6.0]

- **Tab Snapshots** — a new kind of Tab Group that remembers your whole split-editor layout (columns, files, and pinned state), not just a flat list of files. Restoring one recreates the saved column layout exactly.
  - **`Ctrl+Alt+S` / `Cmd+Alt+S`** — **Create New Tab Snapshot** — saves your current split layout (2+ editor columns required) as a new Tab Snapshot. Also available as a camera-icon button at the top of the Tabstronaut sidebar.
  - **`Ctrl+Alt+Shift+S` / `Cmd+Alt+Shift+S`** — **Update Tab Snapshot** — replaces the saved layout of the Tab Snapshot selected in the sidebar with your current layout. Also available via its camera-icon inline button.
  - Tab Snapshots are restored, renamed, and deleted the same way as regular Tab Groups (click, `Ctrl+Alt+O`, `Ctrl+Alt+Enter`, number shortcuts, etc.), and are shown with a square icon and a "(Tab Snapshot)" tooltip.
  - Tab Snapshots are only created or updated explicitly via `Ctrl+Alt+S` / `Ctrl+Alt+Shift+S` — `Add All Open Tabs to Group` (`Ctrl+Alt+G`) and "New Tab Group from all tabs" continue to always create a flat group, as before.
  - This is a rebrand of the "Session" groups feature introduced in 1.5.6/1.5.7 — existing saved sessions continue to work and are now shown as Tab Snapshots.

## [1.5.7]

- **`F2` to rename a focused group** — press F2 while a group is selected in the Tabstronaut sidebar to rename it immediately. Navigate groups with the arrow keys and press F2; no mouse or menu required. The existing `Ctrl+Alt+E` / `Cmd+Alt+E` quick-pick shortcut continues to work from anywhere.
- **`Delete` to delete a focused group** — press Delete while a group is selected in the sidebar to delete it. The existing confirmation prompt and 5-second undo button are both preserved. The existing `Ctrl+Alt+Shift+R` / `Cmd+Alt+Shift+R` quick-pick shortcut continues to work from anywhere.
- **`Ctrl+Alt+Enter` / `Cmd+Alt+Enter` to restore a focused group** — press while a group is selected in the sidebar to restore it immediately, without opening a quick-pick menu. The existing `Ctrl+Alt+O` / `Cmd+Alt+O` shortcut continues to work from anywhere.
- Added confirmation prompt before **Add All Open Tabs to Group** (the inline button on each group row) to prevent accidental bulk additions. Respects the *Show Confirmation* setting.
- Added confirmation prompt before **Restore Tab Group** closes all open editors when the *Auto Close on Restore* setting is enabled. Previously the close happened silently; now a Yes/No prompt appears first. Respects the *Show Confirmation* setting.
- Clicking a suggestion row now applies it (creates the group), same as pressing the inline + button.
- Tweaked suggestion logic so that files already in a tab group can still appear in new suggestions. Previously any file already grouped was excluded entirely; now it can join a suggested cluster if it co-occurs strongly enough with the seed pair.

## [1.5.6]

- Merged `Ctrl+Alt+A` / `Cmd+Alt+A` and the previous `Ctrl+Alt+S` shortcut into one. `Ctrl+Alt+A` now shows only the groups the active file is *not* already in — keeping the list short and relevant — while retaining the richer quick-pick UI with per-group icon buttons. The redundant `Ctrl+Alt+S` shortcut has been removed.

## [1.5.5]

Three more keyboard shortcuts to round out the keyboard-first workflow.

- **`Ctrl+Alt+G` / `Cmd+Alt+G`** — **Add All Open Tabs to Group…** — snapshot every currently open file tab into an existing or new group in one keystroke. Ideal for context-switching: save where you are before restoring a different group.
- **`Ctrl+Alt+N` / `Cmd+Alt+N`** — **Create New Tab Group** — creates a new empty group instantly. When the *Prompt for Group Details* setting is off (the default) the group is created silently with the next auto-generated name; when on, the name and color pickers appear. Note: on Windows/Linux this shortcut overlaps with the Code Runner extension's "Run Code" binding — you can rebind either in VS Code Keyboard Shortcuts if needed.
- **`Ctrl+Alt+E` / `Cmd+Alt+E`** — **Rename Tab Group…** — pick any group (including nested sub-groups shown with `>` hierarchy) and enter a new name and color. Closes the last gap that previously required reaching for the mouse.

## [1.5.4]

Three new hotkey-driven commands for a fully keyboard-first workflow. (Thanks @homezonebenny - #206)

- **`Ctrl+Alt+S` / `Cmd+Alt+S`** — **Add Current Tab to Group…** — opens a quick-pick listing only the groups the active file is *not* already in, so the list stays short and relevant. A "Create new group…" option appears at the top if you want to start a fresh group on the spot.
- **`Ctrl+Alt+R` / `Cmd+Alt+R`** — **Remove Current Tab from Group…** — shows only the groups the active file *is* in. Select one to remove it from that group. If the file isn't in any group a warning message appears instead of an empty list. (`Ctrl+Alt+D` was avoided on Mac as `⌘⌥D` is reserved by macOS to show/hide the Dock.)
- **`Ctrl+Alt+Shift+R` / `Cmd+Alt+Shift+R`** — **Delete Tab Group…** — pick any group (including nested sub-groups shown with a `>` hierarchy indicator) to delete it. The existing confirmation prompt and 5-second undo button are both preserved.
- Fixed a bug where deleting a root group and then pressing Undo would restore it at the end of the list instead of its original position.

## [1.5.3]

- Fixed `Ctrl+Alt+1`–`9` keybindings to always target **root-level** Tab Groups. Previously, the numbering used a depth-first flat list of all groups (including sub-groups), so having a nested group could shift the numbers unpredictably. Shortcuts now count only top-level groups — `Ctrl+Alt+1` is always the first group, `Ctrl+Alt+2` the second, and so on. Opening a group via its number still opens all its tabs and those of every sub-group recursively.

## [1.5.2]

- Added **Open Tab Group...** command (`Ctrl+Alt+O` / `Cmd+Alt+O`) — opens a quick-pick menu listing all your Tab Groups by name so you can restore any group without needing to remember its number. Nested groups are shown with a `>` hierarchy indicator. (Thanks @homezonebenny - #206)

## [1.5.1]

- Fixed a bug where the GitHub Copilot permission dialog would reappear repeatedly after being cancelled. It now asks once per session. Toggling the **Enable AI Group Naming** setting off and back on gives you a fresh prompt if you change your mind.
- Fixed a bug where applying a suggested group triggered a separate tree refresh and workspace state write for every file in the suggestion, causing visible flicker. All files are now added in a single batch.
- Fixed a bug where renaming a file was not reflected in the tab usage tracker, meaning the old filename could persist in suggestions indefinitely. The tracker now updates all co-occurrence entries when a file is renamed.

## [1.5.0]

🎉 **10,000 installs — thank you!** This release is dedicated to everyone who has used, shared, and supported Tabstronaut. You made this milestone happen.

- Added **AI-powered tab group suggestions** — Tabstronaut now silently tracks which files you open together and suggests a tab group when a pattern is detected. Suggestions appear at the bottom of the Tab Groups panel.
- Group names are generated automatically. If you have a VS Code AI provider installed (such as GitHub Copilot), the name is AI-enhanced — otherwise a pattern-based name is used.
- Dismissed suggestions will not re-appear for 7 days.
- Added two new settings under Tabstronaut in VS Code Settings:
  - **Enable Tab Group Suggestions** — master switch. When **off**, this is a complete opt-out: no file usage data is collected, recorded, or stored in any form. When **on**, all analysis stays entirely on your local device and nothing is sent anywhere (unless AI naming is also enabled).
  - **Enable AI Group Naming** — when off, suggestions still appear but names are generated locally with no data leaving your device.
- Added **Tabstronaut: Clear Tab Usage Data** command to wipe all locally stored usage history at any time.
- Updated Privacy section in the README with full details of what is and is not collected.

## [1.4.6]

- Added "Sort All Tab Groups..." toolbar button and command — sort all groups by Name A→Z, Name Z→A, Date (Oldest First), or Date (Newest First).

## [1.4.5]

- Improved drag-and-drop for Tab Groups — drag onto a group to reorder, drag onto a tab to nest, drag to empty space to promote to top level.
- Tab Groups now persist when empty — removing the last tab no longer auto-deletes the group.

## [1.4.4]

- Added nested Tab Groups — groups can now contain sub-groups, ad infinitum.

## [1.4.3]

- Improved file opening to handle binary files like images and PDFs. (Thanks @NyxJae - #196)

## [1.4.1-1.4.2]

- Updated wording in extension.

## [1.4.0]

- Added `importExportDirectory` setting to configure a default directory for importing and exporting Tab Groups.

## [1.3.9-1.3.10]

- Hotfixes.

## [1.3.8]

- Added a setting to skip the name and color prompts when creating new Tab Groups, using the defaults automatically instead.
- Added a setting that closes grouped tabs automatically when their corresponding active tab closes.

## [1.3.7]

- Fixed Jupyter notebooks opening as JSON instead of in the notebook view.

## [1.3.6]

- Reordered title bar actions for more intuitive navigation.

## [1.3.5]

- Added filter Tab Groups listed, by name.
- Added button to toggle between collapsing and expanding all Tab Groups.
- Avoid opening duplicate tabs by switching to an existing tab if it is already open in another editor group.

## [1.3.3-1.3.4]

- Hotfixes.

## [1.3.2]

- New Ungrouped Tabs section.
- Added option to sort tabs alphabetically within a group.
- Dropping a tab onto empty space now creates a new Tab Group with the next default name and color.
- Added `tabstronaut.newTabGroupPosition` setting to control where new groups are inserted, defaulting to the bottom of the list.
- Can undo restoring tabs and closing all tabs.

## [1.3.1]

- Fixed behavior with adding tabs from Solution Explorer.

## [1.3.0]

- Added a new logo and branding.
- New action to sort tabs within a group by folder or file type.

## [1.2.6]

- Tabs and Tab Groups reorder drag-and-drop logic more natural.
- Add unit tests.

## [1.2.5]

- Fix two issues with importing Tabs — colors and locating the correct group.
- Restored context menu command (`Ctrl+Shift+P`) to open the Tab Group context menu.
- Code cleanup with more classes and separation of concerns.
- Restoring a Tab Group returns it to its original position instead of moving it to the top.
- Added buttons for selecting defaults when creating a Tab Group.
- Improved text consistency throughout the extension.
- Add unit tests.

## [1.2.4]

- Disable erroneous commands.

## [1.2.3]

- New more readable logo.

## [1.2.2]

- Fixed issue where the showConfirmationMessages setting was missing from the Settings UI.

## [1.2.1]

- New "Add all open tabs to Tab Group" option for faster group building.
- Undo support when deleting a Tab Group — available for 5 seconds after deletion via a button in the Tabstronaut title bar.
- New configuration options:
  - showConfirmationMessages: Toggle confirmation popups when adding tabs to groups.
- Minor bug fixes and improvements.

## [1.2.0]

- Added support to add files and folders to Tab Groups directly from the Solution Explorer.
  - Selecting multiple files or folders now prompts to create or add to a group.
  - When selecting folders with subfolders, users are prompted to add files either recursively or from the top level only.
- Enabled drag and drop to reorder Tabs within a Tab Group.
- Enabled drag and drop to move entire Tab Groups.
- Added success messages when creating or adding to groups via both the Solution Explorer and tab right-click menu.
- General UX improvements and polish.

## [1.1.20 - 1.1.21]

- Hotfixes.

## [1.1.19]

- Added optional Auto-close Other Tabs on Restore setting for clean context switching.
- Added Import/Export Tab Groups functionality to backup and share setups.
- Fixed notebook support so `.ipynb` tabs open correctly in the Jupyter Notebook view.
- Bug fixes and improvements.

## [1.1.18]


- Updated Tabstronaut extension title.

## [1.1.17]

- Updated commands to be hidden from the command palette for a cleaner user experience.

## [1.1.16]

- A Tab Group is moved to the top of the list and its timestamp is reset when a Tab is added, edited or removed.
- Added a "More Options" button in the Tabstronaut title bar for quick access to key actions including "Get Started", "Settings", "Feedback", and "Support".

## [1.1.15]

- Improved file renaming logic to maintain original case in tab titles.

## [1.1.14]

- Option to open tab group context menu from right-click menu now selects the clicked tab, not the active tab.

## [1.1.13]

- Added option to open tab group context menu from keybinding, the right-click menu and the 'More Actions...' menu
- Added keybindings to restore tab groups.
- Added setting to change order of restore keybindings.
- Added close all button.
- Add settings option to remove confirmation modals.
- Added bug fixes.

## [1.1.12]

- Renamed files are tracked in Tabs.

## [1.1.11]

- Added a setting to toggle the file paths in the description of Tabs.

## [1.1.10]

- Tab Groups can be customized with colors.
- Added a 'Collapse All' Tab Groups button.

## [1.1.9]

- When renaming a Tab Group, the previous name is auto-filled as the value.
- Clicking a file name now previews the file instead of restoring it.
- Tab descriptions now cater to files outside of the current workspace.

## [1.1.8]

- Added file icons based on the user's File Icon Theme.
- Show relative paths instead of absolute paths in Tab descriptions.
- Users can now click a Tab to restore it.
- Added the ability to remove a single Tab from a Tab Group.

## [1.1.7]

- Enriched Tab Groups with real-time timestamps.
- Reorganized Tab Groups in descending order. The newest groups are displayed at the top.

## [1.1.3 - 1.1.6]

- Hotfixes.

## [1.1.2]

- Removed the "Invalid Tab Group name. Please try again." error message when the user cancels renaming a Tab Group.

## [1.1.1]

- Ensured groups are uniquely identified by IDs, allowing multiple groups with identical names.
- Improved user prompts for the 'New Group from All Tabs...' option.
- Fixed a bug to allow adding tabs to existing groups.

## [1.1.0]

- Removed the need for GitHub authentication and Postgres server connections.
- Tailored Tab Groups to be workspace-specific.

## [1.0.0]

- Initial release of Tabstronaut.
