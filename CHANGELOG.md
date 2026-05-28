# Change Log

All notable changes to the Tabstronaut extension will be documented in this file.

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
