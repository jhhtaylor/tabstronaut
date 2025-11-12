import * as vscode from 'vscode';
import { TabstronautDataProvider } from './tabstronautDataProvider';
import { Group } from './models/Group';
import { COLORS, COLOR_LABELS, showConfirmation } from './utils';
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
      name: `Group ${treeDataProvider.getGroups().length + 1}`,
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
    inputBox.onDidAccept(() => {
      const value = inputBox.value;
      inputBox.hide();
      if (value.trim() === '') {
        resolve({
          name: `Group ${treeDataProvider.getGroups().length + 1}`,
          useDefaults: false,
        });
      } else {
        resolve({ name: value, useDefaults: false });
      }
    });

    inputBox.onDidTriggerButton((button) => {
      if (button === defaultButton) {
        inputBox.hide();
        resolve({
          name: `Group ${treeDataProvider.getGroups().length + 1}`,
          useDefaults: true,
        });
      }
    });

    inputBox.onDidHide(() => {
      resolve({ name: undefined, useDefaults: false });
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
  useSelectedFiles = false
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
      if (useSelectedFiles) {
        resolve(item);
        quickPick.hide();
        return;
      }

      if (item.label === 'New Tab Group from current tab...') {
        const result = await getGroupNameForAllToNewGroup(treeDataProvider);
        if (!result.name) {
          return;
        }

        const color = COLORS[treeDataProvider.getGroups().length % COLORS.length];
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

        await vscode.commands.executeCommand(
          'tabstronaut.addAllToNewGroup',
          groupId
        );
        showConfirmation(`Created '${result.name}' and added all open tabs.`);
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
  let result: GroupNameResult;
  if (groupLabel === 'New Tab Group from current tab...') {
    result = await getGroupName(treeDataProvider);
  } else {
    result = await getGroupNameForAllToNewGroup(treeDataProvider);
  }
  if (!result.name) {
    return;
  }

  const defaultColor = COLORS[treeDataProvider.getGroups().length % COLORS.length];
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
    showConfirmation(`Created '${result.name}' and added all open tabs.`);
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

  const result = isAll
    ? await getGroupNameForAllToNewGroup(treeDataProvider)
    : await getGroupName(treeDataProvider);
  if (!result.name) {
    return;
  }

  const defaultColor = COLORS[treeDataProvider.getGroups().length % COLORS.length];
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

  const activeEditor = vscode.window.activeTextEditor;
  if (activeEditor && activeEditor.document.uri.scheme === 'file') {
    await treeDataProvider.updateActiveFileForGroups(
      activeEditor.document.uri.fsPath
    );
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

export async function sortTabGroupCommand(
  treeDataProvider: TabstronautDataProvider,
  item: any
): Promise<void> {
  if (item.contextValue !== 'group') {
    return;
  }

  const picked = await vscode.window.showQuickPick(
    ['Sort Alphabetically', 'Sort by Folder', 'Sort by File Type'],
    { placeHolder: 'Sort Tab Group' }
  );

  if (!picked) {
    return;
  }

  let mode: 'folder' | 'fileType' | 'alphabetical' = 'folder';
  if (picked === 'Sort by File Type') {
    mode = 'fileType';
  } else if (picked === 'Sort Alphabetically') {
    mode = 'alphabetical';
  }
  await treeDataProvider.sortGroup(item.id, mode);
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
