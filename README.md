# Tabstronaut

<table>
  <tr>
    <td><img src="extension/media/Tabstronaut.png" alt="Tabstronaut" width="200"></td>
    <td valign="middle" style="padding-left: 20px;">A cosmic solution to group VS Code editor tabs 👩‍🚀🪐</td>
  </tr>
</table>

Tabstronaut excels in tab management for VS Code by enabling users to archive and retrieve specific tab groups. It ensures frequently-used or feature-specific tabs are systematically stored for future access.

## Features

![Tabstronaut in action](extension/media/tabstronaut-demo-3.gif)

The Tabstronaut extension offers these enhanced features:

- Creation of new groups from current tab or all tabs.
- Streamlined addition and removal of tabs within specific groups.
- Ability to open all tabs in a group or selectively expand/collapse them.
- Intuitive renaming and color-coding of groups.
- Efficient deletion of individual tabs or entire groups.
- Archive and retrieve tab sets, systematically storing frequently-used or feature-specific tabs for future access.

## Tips

![Customize Tabstronaut's location](extension/media/tabstronaut-demo-2.gif)

You can move the Tabstronaut extension to many parts of the VS Code UI, such as the Sidebars and Panel.

![Close all tabs](extension/media/tabstronaut-demo-4.gif)

You can close all tabs by right-clicking any tab and clicking 'Close All' or pressing `Ctrl+K W`.

## Requirements

There are no specific requirements or dependencies for this extension.

## Extension Settings

The Tabstronaut extension does not currently add any new settings to VS Code.

## Known Issues

There are no known issues at the moment. If you encounter a bug, please open an issue on the GitHub repository!

## Release Notes

### 1.1.9

In this update, when renaming a Tab Group, the previous name is auto-filled as the value. Additionally, when clicking a file name, the file is previewed instead of restored. Finally, Tab descriptions cater to files outside of the current workspace.

### 1.1.8

In this update, we added file icons based on the user's File Icon Theme, relative paths instead of absolute paths shown in Tab descriptions, the ability to click a Tab to restore it, and the ability to remove a single Tab from a Tab Group. Enjoy using Tabstronaut!

### 1.1.7

In our latest release, we've enriched Tab Groups with real-time timestamps. Additionally, we've reorganized them in descending order, ensuring the newest groups are prominently displayed at the top for your convenience.

### 1.1.2

In this update, we removed the "Invalid Tab Group name. Please try again." error message when the user cancels renaming a Tab Group.

### 1.1.1

In this update, we've enhanced Tabstronaut by ensuring groups are uniquely identified by IDs, allowing multiple groups with identical names. We've improved user prompts for the 'New Group from All Tabs...' option and fixed a bug to allow adding tabs to existing groups, streamlining your user experience.

### 1.1.0

In our latest update, we've removed the need for GitHub authentication and Postgres server connections, making Tabstronaut quicker and more straightforward to use. We've also tailored Tab Groups to be workspace-specific, improving organization and focus. Enjoy a streamlined, hassle-free coding experience with Tabstronaut!

### 1.0.0

Initial release of Tabstronaut.

---

**Enjoy using Tabstronaut!**
