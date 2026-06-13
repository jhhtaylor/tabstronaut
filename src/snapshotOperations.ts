import * as vscode from 'vscode';
import * as path from 'path';
import { TabstronautDataProvider } from './tabstronautDataProvider';
import { Group } from './models/Group';
import { confirmIfRequired, getGroupNameForAllToNewGroup, selectColorOption, ColorOption } from './groupOperations';
import { closeAllEditors, generateUuidv4, getTabFilePath, COLORS, showConfirmation } from './utils';

/**
 * Captures the current editor layout into the given group: one child group
 * per editor pane, populated with that pane's open files and their pinned
 * state. The group is marked as a Tab Snapshot, even if only a single pane
 * is open.
 *
 * Re-running this on an existing Tab Snapshot group replaces its previous
 * snapshot.
 */
export async function captureSnapshotIntoGroup(
  treeDataProvider: TabstronautDataProvider,
  group: Group
): Promise<boolean> {
  const editorGroups = vscode.window.tabGroups.all
    .slice()
    .sort((a, b) => a.viewColumn - b.viewColumn)
    .filter((g) => g.tabs.some((tab) => getTabFilePath(tab) !== undefined));

  if (editorGroups.length === 0) {
    vscode.window.showInformationMessage('No open file tabs to save.');
    return false;
  }

  group.items = [];
  group.isSnapshot = true;
  group.tooltip = `${group.label} (Tab Snapshot)`;
  group.updateIcon();

  while (group.children.length > editorGroups.length) {
    group.children.pop();
  }

  for (let i = 0; i < editorGroups.length; i++) {
    let pane = group.children[i];
    if (!pane) {
      pane = new Group(`Pane ${i + 1}`, generateUuidv4(), new Date());
      pane.parentId = group.id;
      group.children[i] = pane;
    } else {
      pane.label = `Pane ${i + 1}`;
    }
    pane.contextValue = 'snapshotColumn';
    pane.iconPath = new vscode.ThemeIcon('primitive-square', new vscode.ThemeColor(pane.colorName));

    pane.items = [];
    for (const tab of editorGroups[i].tabs) {
      const filePath = getTabFilePath(tab);
      if (!filePath) {
        continue;
      }
      pane.items.push(pane.createTabItem(filePath, tab.isPinned));
    }
  }

  await treeDataProvider.updateWorkspaceState();
  return true;
}

/**
 * "Create New Tab Snapshot" view-title button: saves the current editor
 * layout (one or more panes, their files, and pinned state) as a brand new
 * Tab Snapshot group.
 */
export async function createSnapshotCommand(
  treeDataProvider: TabstronautDataProvider
): Promise<void> {
  const editorGroups = vscode.window.tabGroups.all.filter((g) =>
    g.tabs.some((tab) => getTabFilePath(tab) !== undefined)
  );

  if (editorGroups.length === 0) {
    vscode.window.showInformationMessage('No open file tabs to save.');
    return;
  }

  const result = await getGroupNameForAllToNewGroup(treeDataProvider);
  if (!result.name) {
    return;
  }

  const defaultColor = COLORS[treeDataProvider.getRootGroups().length % COLORS.length];
  let groupColor = defaultColor;
  if (!result.useDefaults) {
    const colorOption = (await selectColorOption(defaultColor)) as ColorOption | undefined;
    if (!colorOption) {
      return;
    }
    groupColor = colorOption.colorValue;
  }

  const groupId = await treeDataProvider.addGroup(result.name, groupColor);
  if (!groupId) {
    return;
  }

  const group = treeDataProvider.findGroupById(groupId);
  if (group && await captureSnapshotIntoGroup(treeDataProvider, group)) {
    showConfirmation(`Tab Snapshot '${result.name}' created.`);
  }
}

/**
 * Restores a Tab Snapshot group: closes the current editor layout, recreates one
 * column per saved column group, and reopens each column's tabs (including
 * pinned state) into the matching column.
 */
export async function restoreSnapshotGroup(
  treeDataProvider: TabstronautDataProvider,
  group: Group
): Promise<void> {
  if (group.children.length === 0) {
    vscode.window.showInformationMessage(`Tab Snapshot '${group.label}' has no saved columns to restore.`);
    return;
  }

  if (!await confirmIfRequired(`Close all open editors (including pinned tabs) and recreate the saved layout for '${group.label}'?`)) {
    return;
  }

  await closeAllEditors();

  const columns = group.children;
  await vscode.commands.executeCommand('vscode.setEditorLayout', {
    orientation: 0,
    groups: columns.map(() => ({})),
  });

  for (let i = 0; i < columns.length; i++) {
    const viewColumn = i + 1;
    const items = columns[i].items;

    // Pass 1: open every tab in saved left-to-right order, all unpinned.
    // Pinning a tab moves it to the front of the group, so pinning as we go
    // would scramble the order; opening everything first establishes the
    // correct order for the unpinned tabs.
    for (const item of items) {
      const filePath = item.resourceUri?.fsPath;
      if (!filePath) {
        continue;
      }
      try {
        const document = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(document, { viewColumn, preview: false });
      } catch {
        vscode.window.showErrorMessage(
          `Cannot open '${path.basename(filePath)}'. Please check if the file exists and try again.`
        );
      }
    }

    // Pass 2: pin tabs in reverse order. Since pinning moves a tab to the
    // front of the group, pinning from last to first leaves the pinned tabs
    // in their original left-to-right order.
    for (let j = items.length - 1; j >= 0; j--) {
      const item = items[j];
      const filePath = item.resourceUri?.fsPath;
      if (!item.pinned || !filePath) {
        continue;
      }
      try {
        const document = await vscode.workspace.openTextDocument(filePath);
        await vscode.window.showTextDocument(document, { viewColumn, preview: false });
        await vscode.commands.executeCommand('workbench.action.pinEditor');
      } catch {
        // Already reported in pass 1 if the file is missing.
      }
    }
  }
}
