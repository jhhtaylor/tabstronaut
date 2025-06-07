import * as vscode from 'vscode';
import { TabstronautDataProvider } from './tabstronautDataProvider';
import { Group } from './models/Group';
import { COLORS, COLOR_LABELS, showConfirmation } from './utils';
import { gatherFileUris } from './fileOperations';

export async function getGroupName(
  treeDataProvider: TabstronautDataProvider,
  prompt: string | undefined = undefined
): Promise<string | undefined> {
  const groupName = await vscode.window.showInputBox({
    placeHolder:
      "Enter a Tab Group name. Press 'Enter' without typing to use the default.",
    prompt,
  });

  if (groupName === undefined) {
    return undefined;
  } else if (groupName.trim() === '') {
    return `Group ${treeDataProvider.getGroups().length + 1}`;
  } else {
    return groupName;
  }
}

export async function getGroupNameForAllToNewGroup(
  treeDataProvider: TabstronautDataProvider
): Promise<string | undefined> {
  const prompt =
    "Please ensure that all non-source code file tabs are closed before proceeding.";
  return await getGroupName(treeDataProvider, prompt);
}

export type CustomQuickPickItem = vscode.QuickPickItem & {
  id?: string;
  buttons?: vscode.QuickInputButton[];
};

export async function selectTabGroup(
  treeDataProvider: TabstronautDataProvider
): Promise<CustomQuickPickItem | undefined> {
  const quickPick = vscode.window.createQuickPick<CustomQuickPickItem>();

  quickPick.items = [
    {
      label: 'New Tab Group from current tab...',
      buttons: [
        {
          iconPath: new vscode.ThemeIcon('new-folder'),
          tooltip: 'New Tab Group from all tabs...',
        },
      ],
    },
    { label: '', kind: vscode.QuickPickItemKind.Separator },
    ...treeDataProvider.getGroups().map((group) => ({
      label: typeof group.label === 'string' ? group.label : '',
      id: group.id,
      buttons: [
        {
          iconPath: new vscode.ThemeIcon(
            'new-folder',
            new vscode.ThemeColor(group.colorName)
          ),
          tooltip: 'Add all tabs to Tab Group',
        },
      ],
    })),
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

      if (item.label === 'New Tab Group from current tab...') {
        const newGroupName = await getGroupNameForAllToNewGroup(treeDataProvider);
        if (!newGroupName) {
          return;
        }

        const color = COLORS[treeDataProvider.getGroups().length % COLORS.length];
        const selectedColorOption = await selectColorOption(color);
        if (!selectedColorOption) {
          return;
        }

        if (!('colorValue' in selectedColorOption)) {
          return;
        }
        const groupId = await treeDataProvider.addGroup(
          newGroupName,
          selectedColorOption.colorValue
        );

        if (!groupId) {
          return;
        }

        await vscode.commands.executeCommand(
          'tabstronaut.addAllToNewGroup',
          groupId
        );
        showConfirmation(`Created '${newGroupName}' and added all open tabs.`);
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

        const allTabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
        const addedFiles = new Set<string>();
        let count = 0;

        for (const tab of allTabs) {
          if (
            !tab.input ||
            typeof tab.input !== 'object' ||
            !('uri' in tab.input)
          ) {
            continue;
          }
          const uri = (tab.input as any).uri;
          if (!(uri instanceof vscode.Uri) || uri.scheme !== 'file') {
            continue;
          }

          const filePath = uri.fsPath;
          if (!addedFiles.has(filePath)) {
            await treeDataProvider.addToGroup(group.id, filePath);
            addedFiles.add(filePath);
            count++;
          }
        }

        showConfirmation(`Added ${count} open tab(s) to Tab Group '${group.label}'.`);
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
  let newGroupName: string | undefined;
  if (groupLabel === 'New Tab Group from current tab...') {
    newGroupName = await getGroupName(treeDataProvider);
  } else if (groupLabel === 'New Tab Group from all tabs...') {
    newGroupName = await getGroupNameForAllToNewGroup(treeDataProvider);
  }
  if (newGroupName === undefined) {
    return;
  }

  const defaultColor = COLORS[treeDataProvider.getGroups().length % COLORS.length];
  const selectedColorOption = (await selectColorOption(defaultColor)) as
    | ColorOption
    | undefined;
  if (!selectedColorOption) {
    return;
  }
  const groupColor = selectedColorOption?.colorValue || defaultColor;

  const groupId = await treeDataProvider.addGroup(newGroupName, groupColor);
  if (!groupId) {
    vscode.window.showErrorMessage(
      `Failed to create Tab Group with name: ${newGroupName}.`
    );
    return;
  }

  if (groupLabel === 'New Tab Group from current tab...') {
    treeDataProvider.addToGroup(groupId, filePath);
    showConfirmation(`Created '${newGroupName}' and added 1 file.`);
  } else if (groupLabel === 'New Tab Group from all tabs...') {
    await vscode.commands.executeCommand('tabstronaut.addAllToNewGroup', groupId);
    showConfirmation(`Created '${newGroupName}' and added all open tabs.`);
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
  const selectedGroup = await selectTabGroup(treeDataProvider);

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

  const newGroupName = isAll
    ? await getGroupNameForAllToNewGroup(treeDataProvider)
    : await getGroupName(treeDataProvider);
  if (!newGroupName) {
    return;
  }

  const defaultColor = COLORS[treeDataProvider.getGroups().length % COLORS.length];
  const selectedColorOption = (await selectColorOption(defaultColor)) as
    | ColorOption
    | undefined;
  if (!selectedColorOption) {
    return;
  }

  const groupId = await treeDataProvider.addGroup(
    newGroupName,
    selectedColorOption.colorValue
  );
  if (!groupId) {
    return;
  }

  for (const uri of fileUris) {
    await treeDataProvider.addToGroup(groupId, uri.fsPath);
  }

  showConfirmation(`Created '${newGroupName}' and added ${fileUris.length} file(s).`);
}

export async function renameTabGroupCommand(
  treeDataProvider: TabstronautDataProvider,
  item: any
) {
  if (item.contextValue !== 'group' || typeof item.label !== 'string') {
    return;
  }

  const group: Group = item;

  const newName = await getNewGroupName(group);
  if (newName === undefined) {
    return;
  }

  const selectedColorOption = (await selectColorOption(
    group.colorName
  )) as ColorOption;
  if (selectedColorOption) {
    treeDataProvider.renameGroup(
      group.id,
      newName,
      selectedColorOption.colorValue
    );
  }
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
    if (
      !tab.input ||
      typeof tab.input !== 'object' ||
      !('uri' in tab.input)
    ) {
      continue;
    }
    const uri = (tab.input as any).uri;
    if (!(uri instanceof vscode.Uri) || uri.scheme !== 'file') {
      continue;
    }
    const filePath = uri.fsPath;
    if (!addedFiles.has(filePath)) {
      await treeDataProvider.addToGroup(group.id, filePath);
      addedFiles.add(filePath);
      count++;
    }
  }

  showConfirmation(`Added ${count} open tab(s) to Tab Group '${group.label}'.`);
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

  const selectedGroup = await selectTabGroup(treeDataProvider);
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
