import * as vscode from 'vscode';
import * as path from 'path';
import { TabstronautDataProvider } from './tabstronautDataProvider';
import { Group } from './models/Group';
import { COLORS, COLOR_LABELS } from './utils';

let treeDataProvider: TabstronautDataProvider;

export function activate(context: vscode.ExtensionContext) {
	treeDataProvider = new TabstronautDataProvider(context.workspaceState);

	const treeView = vscode.window.createTreeView('tabstronaut', {
		treeDataProvider: treeDataProvider,
		showCollapseAll: false,
		dragAndDropController: treeDataProvider,
	});	

	context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.collapseAll', async () => {
			const firstGroup = treeDataProvider.getFirstGroup();
			if (!firstGroup) {
				return;
			}

			await treeView.reveal(firstGroup, { select: false, focus: true, expand: false });
			vscode.commands.executeCommand('list.collapseAll');
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.confirmCloseAllEditors', async () => {
			const shouldConfirm = vscode.workspace.getConfiguration('tabstronaut').get('confirmRemoveAndClose', true);

			if (shouldConfirm) {
				let shouldClose: string | undefined = await vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: 'Are you sure you want to close all open editor tabs?' });

				if (!shouldClose || shouldClose === 'No') {
					return;
				}
			}

			vscode.commands.executeCommand('workbench.action.closeAllEditors');
		})
	);

	async function getGroupName(prompt: string | undefined = undefined): Promise<string | undefined> {
		const groupName: string | undefined = await vscode.window.showInputBox({
			placeHolder: 'Enter a Tab Group name. Press \'Enter\' without typing to use the default.',
			prompt: prompt,
		});

		if (groupName === undefined) {
			return undefined;
		} else if (groupName.trim() === '') {
			return `Group ${treeDataProvider.getGroups().length + 1}`;
		} else {
			return groupName;
		}
	}

	async function getGroupNameForAllToNewGroup(): Promise<string | undefined> {
		const prompt = 'Please ensure that all non-source code file tabs are closed before proceeding.';
		return await getGroupName(prompt);
	}

	type CustomQuickPickItem = vscode.QuickPickItem & {
		id?: string;
		buttons?: vscode.QuickInputButton[];
	};
	
	async function selectTabGroup(): Promise<CustomQuickPickItem | undefined> {
		const quickPick = vscode.window.createQuickPick<CustomQuickPickItem>();
	
		quickPick.items = [
			{ label: 'New Tab Group from current tab...' },
			{ label: 'New Tab Group from all tabs...' },
			{ label: '', kind: vscode.QuickPickItemKind.Separator },
			...treeDataProvider.getGroups().map(group => ({
				label: typeof group.label === 'string' ? group.label : '',
				id: group.id,
				buttons: [
					{
						iconPath: new vscode.ThemeIcon('new-folder', new vscode.ThemeColor(group.colorName)),
						tooltip: 'Add all open tabs to this Tab Group'
					}
				]
			}))
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
	
			quickPick.onDidTriggerItemButton(async e => {
				const groupId = (e.item as CustomQuickPickItem).id;
				if (!groupId) {return;}
			
				const group = treeDataProvider.getGroups().find(g => g.id === groupId);
				if (!group) {return;}
			
				const allTabs = vscode.window.tabGroups.all.flatMap(g => g.tabs);
				const addedFiles = new Set<string>();
				let count = 0;
			
				for (const tab of allTabs) {
					if (!tab.input || typeof tab.input !== 'object' || !('uri' in tab.input)) {continue;}
					const uri = tab.input.uri;
					if (!(uri instanceof vscode.Uri) || uri.scheme !== 'file') {continue;}
			
					const filePath = uri.fsPath;
					if (!addedFiles.has(filePath)) {
						await treeDataProvider.addToGroup(group.id, filePath);
						addedFiles.add(filePath);
						count++;
					}
				}
			
				vscode.window.showInformationMessage(`Added ${count} open tab(s) to Tab Group '${group.label}'.`);
				quickPick.hide();
			});			
		});
	
		quickPick.show();
		return await selectionPromise;
	}	

	type ColorOption = {
		label: string;
		description: string;
		colorValue: string;
		color: vscode.ThemeColor;
	};

	async function handleNewGroupCreation(groupLabel: string, filePath: string): Promise<void> {
		let newGroupName: string | undefined;
		if (groupLabel === 'New Tab Group from current tab...') {
			newGroupName = await getGroupName();
		} else if (groupLabel === 'New Tab Group from all tabs...') {
			newGroupName = await getGroupNameForAllToNewGroup();
		}
		if (newGroupName === undefined) {
			return;
		}
	
		const defaultColor = COLORS[treeDataProvider.getGroups().length % COLORS.length];
		const selectedColorOption = await selectColorOption(defaultColor) as ColorOption | undefined;
		if (!selectedColorOption) {
			return;
		}
		const groupColor = selectedColorOption?.colorValue || defaultColor;
	
		const groupId = await treeDataProvider.addGroup(newGroupName, groupColor);
		if (!groupId) {
			vscode.window.showErrorMessage(`Failed to create Tab Group with name: ${newGroupName}.`);
			return;
		}
	
		if (groupLabel === 'New Tab Group from current tab...') {
			treeDataProvider.addToGroup(groupId, filePath);
			vscode.window.showInformationMessage(`Created '${newGroupName}' and added 1 file.`);
		} else if (groupLabel === 'New Tab Group from all tabs...') {
			await vscode.commands.executeCommand('tabstronaut.addAllToNewGroup', groupId);
			vscode.window.showInformationMessage(`Created '${newGroupName}' and added all open tabs.`);
		}
	}

	async function handleAddToExistingGroup(groupId: string, filePath: string): Promise<void> {
		await treeDataProvider.addToGroup(groupId, filePath);
		const group = treeDataProvider.getGroups().find(g => g.id === groupId);
		if (group) {
			vscode.window.showInformationMessage(`Added 1 file to Tab Group '${group.label}'.`);
		}
	}

	async function handleTabGroupAction(filePath: string) {
		const selectedGroup = await selectTabGroup();
	
		if (!selectedGroup) {
			return;
		}
	
		if (selectedGroup.label === 'New Tab Group from current tab...' || selectedGroup.label === 'New Tab Group from all tabs...') {
			await handleNewGroupCreation(selectedGroup.label, filePath);
		} else if (selectedGroup.id) {
			await handleAddToExistingGroup(selectedGroup.id, filePath);
		}
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.openTabGroupContextMenu', async () => {
			const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;

			if (!activeTab?.input || typeof activeTab.input !== 'object' || !('uri' in activeTab.input)) {
				vscode.window.showWarningMessage('No supported file tab selected to add to a Tab Group.');
				return;
			}
			
			let filePath: string | undefined;
			if (activeTab.input && 'uri' in activeTab.input && activeTab.input.uri instanceof vscode.Uri) {
				filePath = activeTab.input.uri.fsPath;
			} else {
				vscode.window.showWarningMessage('No valid file URI found for the selected tab.');
				return;
			}
			if (filePath) {
				await handleTabGroupAction(filePath);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.openTabGroupContextMenuFromEditorTabRightClick', async (contextSelection: vscode.Uri) => {
			const INVALID_TAB_MESSAGE = `Can't add this selection to a Tab Group. Please ensure you're selecting a valid source code file tab.`;
			const filePath = contextSelection.fsPath;

			try {
				const document = await vscode.workspace.openTextDocument(contextSelection);

				if (document.uri.scheme !== 'file') {
					vscode.window.showWarningMessage(INVALID_TAB_MESSAGE);
					return;
				}
			} catch (error) {
				vscode.window.showWarningMessage(INVALID_TAB_MESSAGE);
				return;
			}

			await handleTabGroupAction(filePath);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.addAllToNewGroup', async (groupId: string) => {
			const allTabs = vscode.window.tabGroups.all.flatMap(group => group.tabs);
		
			const addedFiles = new Set<string>();
		
			for (const tab of allTabs) {
				if (!tab.input || typeof tab.input !== 'object' || !('uri' in tab.input)) {
					continue;
				}
		
				const uri = tab.input.uri;
				if (!(uri instanceof vscode.Uri) || uri.scheme !== 'file') {
					continue;
				}
		
				const filePath = uri.fsPath;
				if (!addedFiles.has(filePath)) {
					await treeDataProvider.addToGroup(groupId, filePath);
					addedFiles.add(filePath);
				}
			}
		})		
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.restoreAllTabsInGroup', async (item: any) => {
		  if (item.contextValue !== 'group') {return;}
		  const group: Group = item;
	  
		  const autoClose = vscode.workspace.getConfiguration('tabstronaut').get<boolean>('autoCloseOnRestore', false);
		  if (autoClose) {
			await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		  }
	  
		  for (const tabItem of group.items) {
			const filePath = tabItem.resourceUri?.path;
			if (filePath) {
			  try {
				await openFileSmart(filePath);
			  } catch {
				vscode.window.showErrorMessage(`Failed to open '${path.basename(filePath)}'. Please check if the file exists and try again.`);
			  }
			}
		  }
		})
	  );
	  
	  context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.restoreTabsByGroupNumber', async (groupNumber: number) => {
		  const group: Group = treeDataProvider.getGroupByOrder(groupNumber);
		  if (!group || group.contextValue !== 'group') {return;}
	  
		  const autoClose = vscode.workspace.getConfiguration('tabstronaut').get<boolean>('autoCloseOnRestore', false);
		  if (autoClose) {
			await vscode.commands.executeCommand('workbench.action.closeAllEditors');
		  }
	  
		  for (const tabItem of group.items) {
			const filePath = tabItem.resourceUri?.path;
			if (filePath) {
			  try {
				await openFileSmart(filePath);
			  } catch {
				vscode.window.showErrorMessage(`Failed to open '${path.basename(filePath)}'. Please check if the file exists and try again.`);
			  }
			}
		  }
		})
	  );

	const renameTabGroupCommand = async (item: any) => {
		if (item.contextValue !== 'group' || typeof item.label !== 'string') {
			return;
		}

		const group: Group = item;

		const newName = await getNewGroupName(group);
		if (newName === undefined) {return;}

		const selectedColorOption = await selectColorOption(group.colorName) as ColorOption;
		if (selectedColorOption) {
			treeDataProvider.renameGroup(group.id, newName, selectedColorOption.colorValue);
		}
	};

	const getNewGroupName = async (group: Group): Promise<string | undefined> => {
		const currentLabel = typeof group.label === 'string' ? group.label : group.label?.label || '';

		const newName = await vscode.window.showInputBox({
			placeHolder: 'Enter a new Tab Group name',
			value: currentLabel,
			valueSelection: [0, currentLabel.length]
		});

		if (newName === undefined) {return undefined;}
		if (newName.trim() === '') {
			vscode.window.showErrorMessage('Invalid Tab Group name. Please try again.');
			return undefined;
		}

		return newName;
	};

	const selectColorOption = async (currentColorName: string) => {
		const colorOptions = COLORS.map((color, index) => ({
			label: COLOR_LABELS[index] || color,
			description: currentColorName === color ? '●' : '',
			colorValue: color,
			color: new vscode.ThemeColor(color)
		}));

		const defaultColorOptionIndex = colorOptions.findIndex(option => option.colorValue === currentColorName);
		const defaultColorOption = colorOptions[defaultColorOptionIndex];

		const reorderedOptions = [
			{ ...defaultColorOption, description: '' },
			{ label: '', kind: vscode.QuickPickItemKind.Separator },
			...colorOptions
		];

		return await vscode.window.showQuickPick(reorderedOptions, {
			placeHolder: 'Choose a Tab Group color. Press \'Enter\' without changing to use the default.'
		});
	};

	context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.editTabGroup', renameTabGroupCommand)
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.removeTabGroup', async (item: any) => {
			if (item.contextValue !== 'group') {
				return;
			}
			const group: Group = item;

			const shouldConfirm = vscode.workspace.getConfiguration('tabstronaut').get('confirmRemoveAndClose', true);

			if (shouldConfirm) {
				let shouldDelete: string | undefined = await vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: 'Are you sure you want to remove this Tab Group?' });

				if (!shouldDelete || shouldDelete === 'No') {
					return;
				}
			}

			treeDataProvider.deleteGroup(group.id);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.previewSpecificTab', async (item: any) => {
			handleOpenTab(item, true);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.restoreSpecificTab', async (item: any) => {
			handleOpenTab(item, false);
		})
	);

	async function handleOpenTab(item: any, fromButton: boolean) {
		if (item.contextValue !== 'tab') {return;}
	
		const uri = item.resourceUri;
		if (!uri) {return;}
	
		try {
			const isNotebook = uri.fsPath.endsWith('.ipynb');
	
			if (isNotebook) {
				await vscode.commands.executeCommand('vscode.openWith', uri, 'jupyter-notebook');
			} else {
				const currentEditor = vscode.window.activeTextEditor;
				const isCurrentActiveTab = currentEditor?.document.uri.fsPath === uri.fsPath;
				const preview = !isCurrentActiveTab && fromButton;
	
				const doc = await vscode.workspace.openTextDocument(uri);
				await vscode.window.showTextDocument(doc, { preview });
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to open '${path.basename(uri.fsPath)}'.`);
		}
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.removeSpecificTab', async (item: any) => {
			if (item.contextValue !== 'tab') {
				return;
			}

			treeDataProvider.removeFromGroup(item.groupId, item.resourceUri?.path);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.addCurrentTabToGroup', async (group: Group) => {
		  const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;
	  
		  if (!activeTab?.input || typeof activeTab.input !== 'object' || !('uri' in activeTab.input)) {
			vscode.window.showWarningMessage('No supported file tab selected to add to Tab Group.');
			return;
		  }
	  
		  const uri = activeTab.input.uri;
		  if (!(uri instanceof vscode.Uri)) {
			vscode.window.showWarningMessage('No valid file URI found for the selected tab.');
			return;
		  }
	  
		  const filePath = uri.fsPath;
		  await treeDataProvider.addToGroup(group.id, filePath);

		  vscode.window.showInformationMessage(`Added 1 file to Tab Group '${group.label}'.`);
		})
	  );

	vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('tabstronaut.addPaths')) {
			treeDataProvider.rebuildAndRefresh();
			vscode.window.showInformationMessage('Tabstronaut paths setting updated.');
		}
		if (e.affectsConfiguration('tabstronaut.keybindingOrder')) {
			vscode.window.showInformationMessage('Tabstronaut key binding order setting updated.');
		}
		if (e.affectsConfiguration('tabstronaut.confirmRemoveAndClose')) {
			vscode.window.showInformationMessage('Tabstronaut show confirmation setting updated.');
		}
		if (e.affectsConfiguration('tabstronaut.moveTabGroupOnTabChange')) {
			vscode.window.showInformationMessage('Tabstronaut move Tab Group on Tab add, edit or remove setting updated.');
		}
	});

	vscode.workspace.onDidRenameFiles(event => {
		for (const file of event.files) {
			treeDataProvider.handleFileRename(file.oldUri.fsPath, file.newUri.fsPath);
		}
	});

	vscode.commands.registerCommand('tabstronaut.showMoreOptions', async () => {
		const picked = await vscode.window.showQuickPick([
			'Export Tab Groups',
			'Import Tab Groups',
			'Get Started',
			'Settings',
			'Feedback',
			'Support'
		], { placeHolder: 'Select an option' });
	
		switch (picked) {
			case 'Export Tab Groups':
				await treeDataProvider.exportGroupsToFile();
				break;
			case 'Import Tab Groups':
				await treeDataProvider.importGroupsFromFile();
				break;
			case 'Get Started':
				await vscode.commands.executeCommand('extension.open', 'jhhtaylor.tabstronaut');
				break;
			case 'Settings':
				await vscode.commands.executeCommand('workbench.action.openSettings', '@ext:jhhtaylor.tabstronaut');
				break;
			case 'Feedback':
				await vscode.env.openExternal(vscode.Uri.parse('https://github.com/jhhtaylor/tabstronaut/issues'));
				break;
			case 'Support':
				await vscode.env.openExternal(vscode.Uri.parse('https://www.buymeacoffee.com/jhhtaylor'));
				break;
		}
	});	

	context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.exportTabGroups', async () => {
			await treeDataProvider.exportGroupsToFile();
		})
	);
	
	context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.importTabGroups', async () => {
			await treeDataProvider.importGroupsFromFile();
		})
	);

	async function openFileSmart(filePath: string): Promise<void> {
		const uri = vscode.Uri.file(filePath);
	
		try {
			if (filePath.endsWith('.ipynb')) {
				await vscode.commands.executeCommand('vscode.openWith', uri, 'jupyter-notebook');
			} else {
				const document = await vscode.workspace.openTextDocument(uri);
				await vscode.window.showTextDocument(document, { preview: false });
			}
		} catch (error) {
			vscode.window.showErrorMessage(`Failed to open '${path.basename(filePath)}'. Please check if the file exists and try again.`);
		}
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.addAllOpenTabsToGroup', async (item: any) => {
			if (item.contextValue !== 'group') {return;}
			const group: Group = item;
	
			const allTabs = vscode.window.tabGroups.all.flatMap(g => g.tabs);
			const addedFiles = new Set<string>();
			let count = 0;
	
			for (const tab of allTabs) {
				if (!tab.input || typeof tab.input !== 'object' || !('uri' in tab.input)) {
					continue;
				}
				const uri = tab.input.uri;
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
	
			vscode.window.showInformationMessage(`Added ${count} open tab(s) to Tab Group '${group.label}'.`);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.addFilesToGroup', async (uri: vscode.Uri, uris?: vscode.Uri[]) => {
			const allUris = uris && uris.length > 1 ? uris : [uri];
			const fileUris: vscode.Uri[] = [];

			for (const u of allUris) {
				try {
					const stat = await vscode.workspace.fs.stat(u);
					if (stat.type === vscode.FileType.File) {
						fileUris.push(u);
					} else if (stat.type === vscode.FileType.Directory) {
						const hasSubFolders = (await vscode.workspace.fs.readDirectory(u)).some(([, type]) => type === vscode.FileType.Directory);
						let collected: vscode.Uri[] = [];

						if (hasSubFolders) {
							const choice = await vscode.window.showQuickPick([
								{ label: 'Add first-level files only', value: 'first' },
								{ label: 'Add all files recursively', value: 'recursive' }
							], { placeHolder: 'Select how to add files from the folder:' });

							if (!choice) {continue;}

							if (choice.value === 'first') {
								collected = await collectFilesFirstLevel(u);
							} else {
								collected = await collectFilesRecursively(u);
							}
						} else {
							collected = await collectFilesFirstLevel(u);
						}

						fileUris.push(...collected);
					}
				} catch (err) {
					console.warn(`Skipping invalid URI: ${u.fsPath}`, err);
				}
			}

			if (fileUris.length === 0) {
				vscode.window.showInformationMessage('No files found to add to Tab Group.');
				return;
			}

			const selectedGroup = await selectTabGroup();
			if (!selectedGroup) {return;}

			if (selectedGroup.label === 'New Tab Group from current tab...' || selectedGroup.label === 'New Tab Group from all tabs...') {
				await handleNewGroupCreationFromMultipleFiles(selectedGroup.label, fileUris);
				return;
			}

			if (!selectedGroup.id) {return;}

			for (const file of fileUris) {
				await treeDataProvider.addToGroup(selectedGroup.id, file.fsPath);
			}

			vscode.window.showInformationMessage(`Added ${fileUris.length} file(s) to Tab Group '${selectedGroup.label}'.`);
		})
	);

	async function handleNewGroupCreationFromMultipleFiles(groupLabel: string, fileUris: vscode.Uri[]): Promise<void> {
		const isCurrent = groupLabel === 'New Tab Group from current tab...';
		const isAll = groupLabel === 'New Tab Group from all tabs...';
	
		let newGroupName: string | undefined = isAll
			? await getGroupNameForAllToNewGroup()
			: await getGroupName();
		if (!newGroupName) {return;}
	
		const defaultColor = COLORS[treeDataProvider.getGroups().length % COLORS.length];
		const selectedColorOption = await selectColorOption(defaultColor) as ColorOption | undefined;
		if (!selectedColorOption) {return;}
	
		const groupId = await treeDataProvider.addGroup(newGroupName, selectedColorOption.colorValue);
		if (!groupId) {return;}
	
		for (const uri of fileUris) {
			await treeDataProvider.addToGroup(groupId, uri.fsPath);
		}
	
		vscode.window.showInformationMessage(`Created '${newGroupName}' and added ${fileUris.length} file(s).`);
	}	

	async function collectFilesRecursively(uri: vscode.Uri): Promise<vscode.Uri[]> {
		const collected: vscode.Uri[] = [];
		const entries = await vscode.workspace.fs.readDirectory(uri);
		for (const [name, type] of entries) {
			const entryUri = vscode.Uri.joinPath(uri, name);
			if (type === vscode.FileType.File) {
				collected.push(entryUri);
			} else if (type === vscode.FileType.Directory) {
				const subFiles = await collectFilesRecursively(entryUri);
				collected.push(...subFiles);
			}
		}
		return collected;
	}

	async function collectFilesFirstLevel(uri: vscode.Uri): Promise<vscode.Uri[]> {
		const collected: vscode.Uri[] = [];
		const entries = await vscode.workspace.fs.readDirectory(uri);
		for (const [name, type] of entries) {
			if (type === vscode.FileType.File) {
				collected.push(vscode.Uri.joinPath(uri, name));
			}
		}
		return collected;
	}
}

export function deactivate() {
	treeDataProvider.clearRefreshInterval();
}
