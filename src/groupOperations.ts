import * as vscode from 'vscode';
import { TabstronautDataProvider } from './tabstronautDataProvider';
import { Group } from './models/Group';
import { COLORS, COLOR_LABELS, getTabFilePath, isGroupContextValue, isSnapshotManaged, showConfirmation } from './utils';
import { gatherFileUris } from './fileOperations';

export type GroupNameResult = {
  name: string | undefined;
  useDefaults: boolean;
};

export async function getGroupName(
  treeDataProvider: TabstronautDataProvider,
  prompt: string | undefined = undefined
): Promise<GroupNameResult> {
  const config = vscode.workspace.getConfiguration('tabstronaut');
  const promptForGroupDetails = config.get<boolean>(
    'promptForGroupDetails',
    false
  );
  if (!promptForGroupDetails) {
    return {
      name: `Group ${treeDataProvider.getRootGroups().length + 1}`,
      useDefaults: true,
    };
  }

  const inputBox = vscode.window.createInputBox();
  inputBox.placeholder =
    "Enter a Tab Group name. Press 'Enter' without typing to use the default.";
  if (prompt) {
    inputBox.prompt = prompt;
  }
  const defaultButton: vscode.QuickInputButton = {
    iconPath: new vscode.ThemeIcon('testing-skipped-icon'),
    tooltip: 'Use default Tab Group name and color',
  };
  inputBox.buttons = [defaultButton];

  return await new Promise<GroupNameResult>((resolve) => {
    let resolved = false;
    const finalize = (result: GroupNameResult) => {
      if (resolved) {
        return;
      }
      resolved = true;
      resolve(result);
    };

    inputBox.onDidAccept(() => {
      const value = inputBox.value;
      if (value.trim() === '') {
        finalize({
          name: `Group ${treeDataProvider.getRootGroups().length + 1}`,
          useDefaults: false,
        });
      } else {
        finalize({ name: value, useDefaults: false });
      }
      inputBox.hide();
      inputBox.dispose();
    });

    inputBox.onDidTriggerButton((button) => {
      if (button === defaultButton) {
        finalize({
          name: `Group ${treeDataProvider.getRootGroups().length + 1}`,
          useDefaults: true,
        });
        inputBox.hide();
        inputBox.dispose();
      }
    });

    inputBox.onDidHide(() => {
      finalize({ name: undefined, useDefaults: false });
      inputBox.dispose();
    });

    inputBox.show();
  });
}

export async function getGroupNameForAllToNewGroup(
  treeDataProvider: TabstronautDataProvider
): Promise<GroupNameResult> {
  const prompt =
    "Please ensure that all non-source code file tabs are closed before proceeding.";
  return await getGroupName(treeDataProvider, prompt);
}

export type CustomQuickPickItem = vscode.QuickPickItem & {
  id?: string;
  buttons?: vscode.QuickInputButton[];
};

export async function selectTabGroup(
  treeDataProvider: TabstronautDataProvider,
  useSelectedFiles = false,
  filterFilePath?: string
): Promise<CustomQuickPickItem | undefined> {
  const quickPick = vscode.window.createQuickPick<CustomQuickPickItem>();

  const buildGroupItems = (groups: Group[], prefix = ''): CustomQuickPickItem[] => {
    const items: CustomQuickPickItem[] = [];
    for (const group of groups) {
      if (isSnapshotManaged(group)) {
        // Tab Snapshots are managed via their own refresh/restore/rename/delete
        // controls, not generic group pickers.
        continue;
      }
      const label = prefix
        ? `${prefix} > ${typeof group.label === 'string' ? group.label : ''}`
        : (typeof group.label === 'string' ? group.label : '');
      // When filtering, skip groups that already directly contain this file
      if (!filterFilePath || !group.containsFile(filterFilePath)) {
        items.push({
          label,
          id: group.id,
          buttons: [
            {
              iconPath: new vscode.ThemeIcon(
                'new-folder',
                new vscode.ThemeColor(group.colorName)
              ),
              tooltip: 'Add all tabs to Tab Group',
            },
            {
              iconPath: new vscode.ThemeIcon(
                'split-horizontal',
                new vscode.ThemeColor(group.colorName)
              ),
              tooltip: 'Add current split to Tab Group',
            },
          ],
        });
      }
      if (group.children.length > 0) {
        items.push(...buildGroupItems(group.children, label));
      }
    }
    return items;
  };

  quickPick.items = [
    {
      label: 'New Tab Group from current tab...',
      buttons: [
        {
          iconPath: new vscode.ThemeIcon('new-folder'),
          tooltip: 'New Tab Group from all tabs...',
        },
        {
          iconPath: new vscode.ThemeIcon('split-horizontal'),
          tooltip: 'New Tab Group from current split...',
        },
      ],
    },
    { label: '', kind: vscode.QuickPickItemKind.Separator },
    ...buildGroupItems(treeDataProvider.getRootGroups()),
  ];

  quickPick.placeholder = 'Select a Tab Group';

  const selectionPromise = new Promise<CustomQuickPickItem | undefined>((resolve) => {
    quickPick.onDidAccept(() => {
      resolve(quickPick.selectedItems[0]);
      quickPick.hide();
    });

    quickPick.onDidHide(() => {
      resolve(undefined);
    });

    quickPick.onDidTriggerItemButton(async (e) => {
      const item = e.item as CustomQuickPickItem;
      if (useSelectedFiles) {
        resolve(item);
        quickPick.hide();
        return;
      }

      if (item.label === 'New Tab Group from current tab...') {
        const fromCurrentSplit = e.button.tooltip === 'New Tab Group from current split...';

        const result = await getGroupNameForAllToNewGroup(treeDataProvider);
        if (!result.name) {
          return;
        }

        const color = COLORS[treeDataProvider.getRootGroups().length % COLORS.length];
        let groupColor = color;
        if (!result.useDefaults) {
          const selectedColorOption = await selectColorOption(color);
          if (!selectedColorOption || !('colorValue' in selectedColorOption)) {
            return;
          }
          groupColor = selectedColorOption.colorValue;
        }

        const groupId = await treeDataProvider.addGroup(
          result.name,
          groupColor
        );

        if (!groupId) {
          return;
        }

        if (fromCurrentSplit) {
          const group = treeDataProvider.findGroupById(groupId);
          if (group) {
            await addCurrentSplitToGroup(treeDataProvider, group);
          }
        } else {
          await vscode.commands.executeCommand(
            'tabstronaut.addAllToNewGroup',
            groupId
          );
          showConfirmation(describeAddAllResult(treeDataProvider, groupId, result.name));
        }
        quickPick.hide();
        return;
      }

      if (item.id) {
        const group = treeDataProvider
          .getGroups()
          .find((g) => g.id === item.id);
        if (!group) {
          return;
        }

        if (e.button.tooltip === 'Add current split to Tab Group') {
          await addCurrentSplitToGroup(treeDataProvider, group);
        } else {
          await addAllOpenTabsToGroup(treeDataProvider, group);
        }
        quickPick.hide();
      }
    });
  });

  quickPick.show();
  return await selectionPromise;
}

export type ColorOption = {
  label: string;
  description: string;
  colorValue: string;
  color: vscode.ThemeColor;
};

export async function handleNewGroupCreation(
  treeDataProvider: TabstronautDataProvider,
  groupLabel: string,
  filePath: string
): Promise<void> {
  let result: GroupNameResult;
  if (groupLabel === 'New Tab Group from current tab...') {
    result = await getGroupName(treeDataProvider);
  } else {
    result = await getGroupNameForAllToNewGroup(treeDataProvider);
  }
  if (!result.name) {
    return;
  }

  const defaultColor = COLORS[treeDataProvider.getRootGroups().length % COLORS.length];
  let groupColor = defaultColor;
  if (!result.useDefaults) {
    const selectedColorOption = (await selectColorOption(defaultColor)) as
      | ColorOption
      | undefined;
    if (!selectedColorOption) {
      return;
    }
    groupColor = selectedColorOption.colorValue;
  }

  const groupId = await treeDataProvider.addGroup(result.name, groupColor);
  if (!groupId) {
    vscode.window.showErrorMessage(
      `Cannot create Tab Group with name: ${result.name}.`
    );
    return;
  }

  if (groupLabel === 'New Tab Group from current tab...') {
    treeDataProvider.addToGroup(groupId, filePath);
    showConfirmation(`Created '${result.name}' and added 1 file.`);
  } else if (groupLabel === 'New Tab Group from all tabs...') {
    await vscode.commands.executeCommand('tabstronaut.addAllToNewGroup', groupId);
    showConfirmation(describeAddAllResult(treeDataProvider, groupId, result.name));
  }
}

export async function handleAddToExistingGroup(
  treeDataProvider: TabstronautDataProvider,
  groupId: string,
  filePath: string
): Promise<void> {
  await treeDataProvider.addToGroup(groupId, filePath);
  const group = treeDataProvider.getGroups().find((g) => g.id === groupId);
  if (group) {
    showConfirmation(`Added 1 file to Tab Group '${group.label}'.`);
  }
}

export async function handleTabGroupAction(
  treeDataProvider: TabstronautDataProvider,
  filePath: string
) {
  const selectedGroup = await selectTabGroup(treeDataProvider, false, filePath);

  if (!selectedGroup) {
    return;
  }

  if (
    selectedGroup.label === 'New Tab Group from current tab...' ||
    selectedGroup.label === 'New Tab Group from all tabs...'
  ) {
    await handleNewGroupCreation(treeDataProvider, selectedGroup.label, filePath);
  } else if (selectedGroup.id) {
    await handleAddToExistingGroup(treeDataProvider, selectedGroup.id, filePath);
  }
}

export async function handleNewGroupCreationFromMultipleFiles(
  treeDataProvider: TabstronautDataProvider,
  groupLabel: string,
  fileUris: vscode.Uri[]
): Promise<void> {
  const isAll = groupLabel === 'New Tab Group from all tabs...';

  const result = isAll
    ? await getGroupNameForAllToNewGroup(treeDataProvider)
    : await getGroupName(treeDataProvider);
  if (!result.name) {
    return;
  }

  const defaultColor = COLORS[treeDataProvider.getRootGroups().length % COLORS.length];
  let groupColor = defaultColor;
  if (!result.useDefaults) {
    const selectedColorOption = (await selectColorOption(defaultColor)) as
      | ColorOption
      | undefined;
    if (!selectedColorOption) {
      return;
    }
    groupColor = selectedColorOption.colorValue;
  }

  const groupId = await treeDataProvider.addGroup(
    result.name,
    groupColor
  );
  if (!groupId) {
    return;
  }

  for (const uri of fileUris) {
    await treeDataProvider.addToGroup(groupId, uri.fsPath);
  }

  showConfirmation(`Created '${result.name}' and added ${fileUris.length} file(s).`);
}

export async function renameTabGroupCommand(
  treeDataProvider: TabstronautDataProvider,
  item: any
) {
  if (!isGroupContextValue(item.contextValue) || typeof item.label !== 'string') {
    return;
  }

  const group: Group = item;

  const newName = await getNewGroupName(group);
  if (newName === undefined) {
    return;
  }

  const selectedColorOption = (await selectColorOption(
    group.colorName
  )) as ColorOption | undefined;
  treeDataProvider.renameGroup(
    group.id,
    newName,
    selectedColorOption ? selectedColorOption.colorValue : group.colorName
  );
}

export async function getNewGroupName(
  group: Group
): Promise<string | undefined> {
  const currentLabel =
    typeof group.label === 'string' ? group.label : group.label?.label || '';

  const newName = await vscode.window.showInputBox({
    placeHolder: 'Enter a new Tab Group name',
    value: currentLabel,
    valueSelection: [0, currentLabel.length],
  });

  if (newName === undefined) {
    return undefined;
  }
  if (newName.trim() === '') {
    vscode.window.showErrorMessage('Invalid Tab Group name. Please try again.');
    return undefined;
  }

  return newName;
}

export async function selectColorOption(currentColorName: string) {
  const colorOptions = COLORS.map((color, index) => ({
    label: COLOR_LABELS[index] || color,
    description: currentColorName === color ? '●' : '',
    colorValue: color,
    color: new vscode.ThemeColor(color),
  }));

  const defaultColorOptionIndex = colorOptions.findIndex(
    (option) => option.colorValue === currentColorName
  );
  const defaultColorOption = colorOptions[defaultColorOptionIndex];

  const reorderedOptions = [
    { ...defaultColorOption, description: '' },
    { label: '', kind: vscode.QuickPickItemKind.Separator },
    ...colorOptions,
  ];

  return await vscode.window.showQuickPick(reorderedOptions, {
    placeHolder:
      "Choose a Tab Group color. Press 'Enter' without changing to use the default.",
  });
}

export async function addAllOpenTabsToGroup(
  treeDataProvider: TabstronautDataProvider,
  group: Group
): Promise<void> {
  const allTabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
  const addedFiles = new Set<string>();
  let count = 0;

  for (const tab of allTabs) {
    const filePath = getTabFilePath(tab);
    if (!filePath || addedFiles.has(filePath)) {
      continue;
    }
    await treeDataProvider.addToGroup(group.id, filePath);
    addedFiles.add(filePath);
    count++;
  }

  showConfirmation(`Added ${count} open tab(s) to Tab Group '${group.label}'.`);
}

/**
 * Adds every file tab from the active editor split (the editor column
 * containing the currently focused tab) to the given group.
 */
export async function addCurrentSplitToGroup(
  treeDataProvider: TabstronautDataProvider,
  group: Group
): Promise<void> {
  const activeTabGroup = vscode.window.tabGroups.activeTabGroup;
  const tabs = activeTabGroup?.tabs ?? [];
  const addedFiles = new Set<string>();
  let count = 0;

  for (const tab of tabs) {
    const filePath = getTabFilePath(tab);
    if (!filePath || addedFiles.has(filePath)) {
      continue;
    }
    await treeDataProvider.addToGroup(group.id, filePath);
    addedFiles.add(filePath);
    count++;
  }

  showConfirmation(`Added ${count} tab(s) from the current split to Tab Group '${group.label}'.`);
}

export async function addFilesToGroupCommand(
  treeDataProvider: TabstronautDataProvider,
  uris: vscode.Uri[]
): Promise<void> {
  const fileUris = await gatherFileUris(uris);

  if (fileUris.length === 0) {
    showConfirmation('No files found to add to Tab Group.');
    return;
  }

  const selectedGroup = await selectTabGroup(treeDataProvider, true);
  if (!selectedGroup) {
    return;
  }

  if (
    selectedGroup.label === 'New Tab Group from current tab...' ||
    selectedGroup.label === 'New Tab Group from all tabs...'
  ) {
    await handleNewGroupCreationFromMultipleFiles(
      treeDataProvider,
      selectedGroup.label,
      fileUris
    );
    return;
  }

  if (!selectedGroup.id) {
    return;
  }

  for (const file of fileUris) {
    await treeDataProvider.addToGroup(selectedGroup.id, file.fsPath);
  }

  showConfirmation(
    `Added ${fileUris.length} file(s) to Tab Group '${selectedGroup.label}'.`
  );
}

export async function handleAddSubGroup(
  treeDataProvider: TabstronautDataProvider,
  parentGroup: Group
): Promise<void> {
  const allGroups = treeDataProvider.getGroups();
  const result = await getGroupName(treeDataProvider);
  if (!result.name) {
    return;
  }

  const defaultColor = COLORS[allGroups.length % COLORS.length];
  let groupColor = defaultColor;
  if (!result.useDefaults) {
    const selectedColorOption = (await selectColorOption(defaultColor)) as
      | ColorOption
      | undefined;
    if (!selectedColorOption) {
      return;
    }
    groupColor = selectedColorOption.colorValue;
  }

  const groupId = await treeDataProvider.addSubGroup(
    parentGroup.id,
    result.name,
    groupColor
  );
  if (!groupId) {
    vscode.window.showErrorMessage(
      `Cannot create Sub-Group with name: ${result.name}.`
    );
    return;
  }

  showConfirmation(`Created Sub-Group '${result.name}' inside '${parentGroup.label}'.`);
}

export async function sortTabGroupCommand(
  treeDataProvider: TabstronautDataProvider,
  item: any
): Promise<void> {
  if (!isGroupContextValue(item.contextValue)) {
    return;
  }

  const picked = await vscode.window.showQuickPick(
    ['Name A → Z', 'By Folder', 'By File Type'],
    { placeHolder: 'Sort Tabs in Group' }
  );

  if (!picked) {
    return;
  }

  let mode: 'folder' | 'fileType' | 'alphabetical' = 'folder';
  if (picked === 'By File Type') {
    mode = 'fileType';
  } else if (picked === 'Name A → Z') {
    mode = 'alphabetical';
  }
  await treeDataProvider.sortGroup(item.id, mode);
}

export async function sortAllGroupsCommand(
  treeDataProvider: TabstronautDataProvider
): Promise<void> {
  const picked = await vscode.window.showQuickPick(
    ['Name A → Z', 'Name Z → A', 'Last Active (Oldest First)', 'Last Active (Newest First)'],
    { placeHolder: 'Sort Tab Groups' }
  );

  if (!picked) {
    return;
  }

  let mode: 'name-asc' | 'name-desc' | 'time-asc' | 'time-desc' = 'name-asc';
  if (picked === 'Name Z → A') {
    mode = 'name-desc';
  } else if (picked === 'Last Active (Oldest First)') {
    mode = 'time-asc';
  } else if (picked === 'Last Active (Newest First)') {
    mode = 'time-desc';
  }

  await treeDataProvider.sortRootGroups(mode);

  const moveOnChange = vscode.workspace
    .getConfiguration('tabstronaut')
    .get<boolean>('moveTabGroupOnTabChange', true);
  if (moveOnChange) {
    vscode.window.showInformationMessage(
      'Tab Groups sorted. Tip: disable "Move Tab Group on Tab Change" in settings to preserve this order.'
    );
  }
}

export type GroupQuickPickItem = vscode.QuickPickItem & {
  group: Group;
  buttons?: vscode.QuickInputButton[];
};

export type OpenGroupSelection = {
  group: Group;
  /** true = open this group's tabs and all nested sub-group tabs recursively */
  recursive: boolean;
};

const openRecursiveButton: vscode.QuickInputButton = {
  iconPath: new vscode.ThemeIcon('list-tree'),
  tooltip: 'Open with all sub-groups',
};

export async function openGroupQuickPick(
  treeDataProvider: TabstronautDataProvider
): Promise<OpenGroupSelection | undefined> {
  const rootGroups = treeDataProvider.getRootGroups();

  if (rootGroups.length === 0) {
    vscode.window.showWarningMessage(
      'No Tab Groups found. Create a group first using Ctrl+Alt+A.'
    );
    return undefined;
  }

  const buildItems = (groups: Group[], prefix = ''): GroupQuickPickItem[] => {
    const items: GroupQuickPickItem[] = [];
    for (const group of groups) {
      const name =
        typeof group.label === 'string' ? group.label : group.label?.label ?? '';
      const label = prefix ? `${prefix} > ${name}` : name;
      const tabCount = group.items.length;
      items.push({
        label,
        description: `${tabCount} tab${tabCount !== 1 ? 's' : ''}`,
        group,
        buttons: group.children.length > 0 ? [openRecursiveButton] : [],
      });
      // Tab Snapshot columns are restored as part of the snapshot itself, not
      // individually, so don't list them as separate entries.
      if (group.children.length > 0 && !group.isSnapshot) {
        items.push(...buildItems(group.children, label));
      }
    }
    return items;
  };

  const quickPick = vscode.window.createQuickPick<GroupQuickPickItem>();
  quickPick.items = buildItems(rootGroups);
  quickPick.placeholder = 'Select a Tab Group to open';

  return await new Promise<OpenGroupSelection | undefined>((resolve) => {
    let settled = false;
    const finish = (result: OpenGroupSelection | undefined) => {
      if (settled) { return; }
      settled = true;
      resolve(result);
    };

    quickPick.onDidAccept(() => {
      const selected = quickPick.selectedItems[0];
      quickPick.hide();
      finish(selected ? { group: selected.group, recursive: false } : undefined);
    });

    quickPick.onDidHide(() => {
      finish(undefined);
      quickPick.dispose();
    });

    quickPick.onDidTriggerItemButton((e) => {
      quickPick.hide();
      finish({ group: (e.item as GroupQuickPickItem).group, recursive: true });
    });

    quickPick.show();
  });
}

export async function filterTabGroupsCommand(
  treeDataProvider: TabstronautDataProvider
): Promise<void> {
  const filter = await vscode.window.showInputBox({
    value: treeDataProvider.getGroupFilter(),
    placeHolder: "Filter Tab Groups by name",
    prompt: "Enter text to filter Tab Groups. Leave empty to clear the filter.",
  });

  if (filter === undefined) {
    return;
  }

  const trimmed = filter.trim();
  treeDataProvider.setGroupFilter(trimmed === "" ? undefined : trimmed);
}

// ── Quick-pick helpers shared by Save / Remove / Delete commands ──────────────

type GroupPickItem = vscode.QuickPickItem & { groupId: string };

const CREATE_NEW_GROUP_ID = '__create_new__';

function buildGroupHierarchyItems(
  groups: Group[],
  predicate: (group: Group) => boolean,
  prefix = '',
  secondaryButton?: { icon: string; tooltip: string }
): GroupPickItem[] {
  const result: GroupPickItem[] = [];
  for (const group of groups) {
    if (isSnapshotManaged(group)) {
      // Tab Snapshots are managed via their own refresh/restore/rename/delete
      // controls, not generic group pickers.
      continue;
    }
    const name = typeof group.label === 'string' ? group.label : '';
    const label = prefix ? `${prefix} > ${name}` : name;
    if (predicate(group)) {
      const tabCount = group.items.length;
      const childCount = group.children.length;
      const descParts = [`${tabCount} tab${tabCount !== 1 ? 's' : ''}`];
      if (childCount > 0) {
        descParts.push(`${childCount} sub-group${childCount !== 1 ? 's' : ''}`);
      }
      const item: GroupPickItem = { label, description: descParts.join(', '), groupId: group.id };
      if (secondaryButton) {
        item.buttons = [
          {
            iconPath: new vscode.ThemeIcon(secondaryButton.icon, new vscode.ThemeColor(group.colorName)),
            tooltip: secondaryButton.tooltip,
          },
        ];
      }
      result.push(item);
    }
    if (group.children.length > 0) {
      result.push(...buildGroupHierarchyItems(group.children, predicate, label, secondaryButton));
    }
  }
  return result;
}

/**
 * Add the current tab to a group (no direct keybinding — behaviour merged
 * into Ctrl+Alt+A via selectTabGroup filtering as of v1.5.6).
 * Shows only groups where the file is NOT already present, plus a
 * "Create new group…" option at the top.
 */
export async function addCurrentTabToGroupQuickPick(
  treeDataProvider: TabstronautDataProvider,
  filePath: string
): Promise<void> {
  const availableGroups = buildGroupHierarchyItems(
    treeDataProvider.getRootGroups(),
    (g) => !g.containsFile(filePath)
  );

  const items: GroupPickItem[] = [
    { label: '$(add) Create new group...', description: '', groupId: CREATE_NEW_GROUP_ID },
  ];

  if (availableGroups.length > 0) {
    items.push({ label: '', kind: vscode.QuickPickItemKind.Separator, description: '', groupId: '' });
    items.push(...availableGroups);
  }

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Add current tab to a Tab Group',
  });

  if (!selected) {
    return;
  }

  if (selected.groupId === CREATE_NEW_GROUP_ID) {
    await handleNewGroupCreation(treeDataProvider, 'New Tab Group from current tab...', filePath);
    return;
  }

  await handleAddToExistingGroup(treeDataProvider, selected.groupId, filePath);
}

/**
 * Ctrl+Alt+R — remove the current tab from one of the groups it belongs to.
 * Shows only groups where the file IS present.
 */
export async function removeCurrentTabFromGroupQuickPick(
  treeDataProvider: TabstronautDataProvider,
  filePath: string
): Promise<void> {
  const containingGroups = buildGroupHierarchyItems(
    treeDataProvider.getRootGroups(),
    (g) => g.containsFile(filePath)
  );

  if (containingGroups.length === 0) {
    vscode.window.showWarningMessage('Current file is not in any Tab Group.');
    return;
  }

  const selected = await vscode.window.showQuickPick(containingGroups, {
    placeHolder: 'Remove current tab from a Tab Group',
  });

  if (!selected) {
    return;
  }

  const group = treeDataProvider.findGroupById(selected.groupId);
  await treeDataProvider.removeFromGroup(selected.groupId, filePath, { skipConfirmation: true });
  if (group) {
    showConfirmation(`Removed from Tab Group '${group.label}'.`);
  }
}

/**
 * Ctrl+Alt+G — add every currently open file tab to an existing or new group.
 * Ctrl+Alt+Shift+G — same picker, but adds only the tabs from the current
 * editor split by default. Either way, each item has an inline button to
 * perform the other action instead.
 */
export async function addAllTabsToGroupQuickPick(
  treeDataProvider: TabstronautDataProvider,
  primaryMode: 'all' | 'split' = 'all'
): Promise<void> {
  const rootGroups = treeDataProvider.getRootGroups();
  const splitIsPrimary = primaryMode === 'split';

  const secondaryButton = splitIsPrimary
    ? { icon: 'new-folder', tooltip: 'Add all tabs to Tab Group' }
    : { icon: 'split-horizontal', tooltip: 'Add current split to Tab Group' };
  const secondaryCreateTooltip = splitIsPrimary
    ? 'Create new group from all tabs'
    : 'Create new group from current split';

  const quickPick = vscode.window.createQuickPick<GroupPickItem>();

  const items: GroupPickItem[] = [
    {
      label: '$(add) Create new group...',
      description: '',
      groupId: CREATE_NEW_GROUP_ID,
      buttons: [
        {
          iconPath: new vscode.ThemeIcon(secondaryButton.icon),
          tooltip: secondaryCreateTooltip,
        },
      ],
    },
  ];

  if (rootGroups.length > 0) {
    items.push({ label: '', kind: vscode.QuickPickItemKind.Separator, description: '', groupId: '' });
    items.push(...buildGroupHierarchyItems(rootGroups, () => true, '', secondaryButton));
  }

  quickPick.items = items;
  quickPick.placeholder = splitIsPrimary
    ? "Add current split's tabs to a Tab Group"
    : 'Add all open tabs to a Tab Group';

  const createNewGroup = async (fromCurrentSplit: boolean): Promise<void> => {
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
    if (fromCurrentSplit) {
      const group = treeDataProvider.findGroupById(groupId);
      if (group) {
        await addCurrentSplitToGroup(treeDataProvider, group);
      }
    } else {
      await vscode.commands.executeCommand('tabstronaut.addAllToNewGroup', groupId);
    }
  };

  quickPick.onDidAccept(async () => {
    const selected = quickPick.selectedItems[0];
    quickPick.hide();
    if (!selected || !selected.groupId) {
      return;
    }
    if (selected.groupId === CREATE_NEW_GROUP_ID) {
      await createNewGroup(splitIsPrimary);
      return;
    }
    const group = treeDataProvider.findGroupById(selected.groupId);
    if (group) {
      await (splitIsPrimary ? addCurrentSplitToGroup : addAllOpenTabsToGroup)(treeDataProvider, group);
    }
  });

  quickPick.onDidTriggerItemButton(async (e) => {
    quickPick.hide();
    if (e.item.groupId === CREATE_NEW_GROUP_ID) {
      await createNewGroup(!splitIsPrimary);
      return;
    }
    const group = treeDataProvider.findGroupById(e.item.groupId);
    if (group) {
      await (splitIsPrimary ? addAllOpenTabsToGroup : addCurrentSplitToGroup)(treeDataProvider, group);
    }
  });

  quickPick.show();
}

/**
 * Ctrl+Alt+N — create a new empty Tab Group.
 * When promptForGroupDetails is off (the default) the group is created
 * silently with the next auto-generated name; when on, name and color
 * pickers are shown.
 */
export async function createNewGroupCommand(
  treeDataProvider: TabstronautDataProvider
): Promise<void> {
  const result = await getGroupName(treeDataProvider);
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
  if (groupId) {
    showConfirmation(`Created Tab Group '${result.name}'.`);
  }
}

/**
 * Ctrl+Alt+E — rename a Tab Group via a quick-pick.
 */
export async function renameGroupQuickPick(
  treeDataProvider: TabstronautDataProvider
): Promise<void> {
  const rootGroups = treeDataProvider.getRootGroups();

  if (rootGroups.length === 0) {
    vscode.window.showWarningMessage('No Tab Groups to rename.');
    return;
  }

  const items = buildGroupHierarchyItems(rootGroups, () => true);

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a Tab Group to rename',
  });

  if (!selected) {
    return;
  }

  const group = treeDataProvider.findGroupById(selected.groupId);
  if (!group) {
    return;
  }

  const newName = await getNewGroupName(group);
  if (newName === undefined) {
    return;
  }

  const colorOption = (await selectColorOption(group.colorName)) as ColorOption | undefined;

  await treeDataProvider.renameGroup(group.id, newName, colorOption ? colorOption.colorValue : group.colorName);
  showConfirmation(`Renamed Tab Group to '${newName}'.`);
}

/**
 * Ctrl+Alt+Shift+R — pick a group to delete.
 * Returns the group so the caller can run the existing removeTabGroup command
 * (which handles the confirmation prompt and undo support).
 */
export async function pickGroupToDelete(
  treeDataProvider: TabstronautDataProvider
): Promise<Group | undefined> {
  const rootGroups = treeDataProvider.getRootGroups();

  if (rootGroups.length === 0) {
    vscode.window.showWarningMessage('No Tab Groups to delete.');
    return undefined;
  }

  const items = buildGroupHierarchyItems(rootGroups, () => true);

  const selected = await vscode.window.showQuickPick(items, {
    placeHolder: 'Select a Tab Group to delete',
  });

  if (!selected) {
    return undefined;
  }

  return treeDataProvider.findGroupById(selected.groupId);
}

/**
 * Builds the confirmation message for "add all open tabs to a new group",
 * accounting for whether tabstronaut.addAllToNewGroup captured the current
 * editor layout as a Tab Snapshot (multiple columns) or did a flat add.
 */
export function describeAddAllResult(
  treeDataProvider: TabstronautDataProvider,
  groupId: string,
  groupName: string
): string {
  const group = treeDataProvider.findGroupById(groupId);
  if (group?.isSnapshot) {
    return `Created '${groupName}' and saved the current editor layout as a Tab Snapshot (${group.children.length} columns).`;
  }
  return `Created '${groupName}' and added all open tabs.`;
}

export async function confirmIfRequired(placeHolder: string): Promise<boolean> {
  const shouldConfirm = vscode.workspace
    .getConfiguration('tabstronaut')
    .get('confirmRemoveAndClose', true);
  if (!shouldConfirm) {
    return true;
  }
  const answer = await vscode.window.showQuickPick(['Yes', 'No'], { placeHolder });
  return answer === 'Yes';
}
