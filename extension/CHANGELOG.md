# Change Log

All notable changes to the Tabstronaut extension will be documented in this file.

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
