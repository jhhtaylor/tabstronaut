import * as vscode from 'vscode';
import { TabstronautDataProvider } from './tabstronautDataProvider';
import { Group } from './models/Group';
import { DEFAULT_COLOR, COLORS, COLOR_LABELS } from './utils';

let treeDataProvider: TabstronautDataProvider;
let treeView: vscode.TreeView<vscode.TreeItem>;

export function activate(context: vscode.ExtensionContext) {
	treeDataProvider = new TabstronautDataProvider(context.workspaceState);
	treeView = vscode.window.createTreeView('tabstronaut', { treeDataProvider });

	async function getGroupName(prompt: string | undefined = undefined): Promise<string | undefined> {
		const groupName: string | undefined = await vscode.window.showInputBox({
			placeHolder: 'Enter a new Tab Group name. Use no input for default name.',
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

	type CustomQuickPickItem = vscode.QuickPickItem & { id?: string };

	async function selectTabGroup(): Promise<CustomQuickPickItem | undefined> {
		let options: CustomQuickPickItem[] = [
			{ label: 'New Tab Group from current tab...' },
			{ label: 'New Tab Group from all tabs...' },
			{ label: '', kind: vscode.QuickPickItemKind.Separator }
		];
		options.push(...treeDataProvider.getGroups().map(group => ({ label: group.label as string, id: group.id })));
		return await vscode.window.showQuickPick(options, { placeHolder: 'Select a Tab Group' });
	}

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

		const selectedColorOption = await selectColorOption(DEFAULT_COLOR);
		if (!selectedColorOption) {
			return;
		}
		const groupColor = selectedColorOption?.colorValue || DEFAULT_COLOR;

		const groupId = await treeDataProvider.addGroup(newGroupName, groupColor);
		if (!groupId) {
			vscode.window.showErrorMessage(`Failed to create Tab Group with name: ${newGroupName}.`);
			return;
		}

		if (groupLabel === 'New Tab Group from current tab...') {
			treeDataProvider.addToGroup(groupId, filePath);
		} else if (groupLabel === 'New Tab Group from all tabs...') {
			vscode.commands.executeCommand('tabstronaut.addAllToNewGroup', groupId);
		}
	}

	async function handleAddToExistingGroup(groupId: string, filePath: string): Promise<void> {
		treeDataProvider.addToGroup(groupId, filePath);
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.openTabGroupContextMenu', async () => {
			const activeEditor = vscode.window.activeTextEditor;
			if (!activeEditor) {
				vscode.window.showWarningMessage('To create a Tab Group, please ensure that at least one source code file tab is active and close all non-source code file tabs.');
				return;
			}

			const filePath = activeEditor.document.fileName;
			const selectedGroup = await selectTabGroup();

			if (!selectedGroup) {
				return;
			}

			if (selectedGroup.label === 'New Tab Group from current tab...' || selectedGroup.label === 'New Tab Group from all tabs...') {
				await handleNewGroupCreation(selectedGroup.label, filePath);
			} else if (selectedGroup.id) {
				await handleAddToExistingGroup(selectedGroup.id, filePath);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.addAllToNewGroup', async (groupId: string) => {
			let initialTab = vscode.window.activeTextEditor;
			let initialTabFilePath = initialTab?.document.fileName;

			await vscode.commands.executeCommand('workbench.action.firstEditorInGroup');

			let startingTab = vscode.window.activeTextEditor;
			if (!startingTab) {
				return;
			}

			let addedFiles = new Set<string>();

			let editor: vscode.TextEditor | undefined = startingTab;
			let startFilePath = startingTab.document.fileName;
			do {
				if (editor) {
					const filePath = editor.document.fileName;

					if (!addedFiles.has(filePath)) {
						await treeDataProvider.addToGroup(groupId, filePath);
						addedFiles.add(filePath);
					}
				}

				await vscode.commands.executeCommand('workbench.action.nextEditor');
				editor = vscode.window.activeTextEditor;
			} while (editor && editor.document.fileName !== startFilePath);

			if (initialTabFilePath) {
				editor = vscode.window.activeTextEditor;
				startFilePath = editor?.document.fileName || '';
				while (editor && editor.document.fileName !== initialTabFilePath) {
					await vscode.commands.executeCommand('workbench.action.nextEditor');
					editor = vscode.window.activeTextEditor;
				}
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.restoreAllTabsInGroup', async (item: any) => {
			if (item.contextValue !== 'group') {
				return;
			}
			const group: Group = item;

			for (let i = 0; i < group.items.length; i++) {
				const filePath = group.items[i].resourceUri?.path as string;
				if (filePath) {
					try {
						const document = await vscode.workspace.openTextDocument(filePath);
						await vscode.window.showTextDocument(document, { preview: false });
					} catch (error) {
						vscode.window.showErrorMessage(`Failed to open file: ${filePath}. Please check if the file exists and try again.`);
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
		if (newName === undefined) return;

		const selectedColorOption = await selectColorOption(group.colorName);
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

		if (newName === undefined) return undefined;
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

		return await vscode.window.showQuickPick(colorOptions, {
			placeHolder: 'Select a new color for the Tab Group. Use no input for default color.'
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

			let shouldDelete: string | undefined = await vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: 'Are you sure you want to remove this Tab Group?' });

			if (!shouldDelete || shouldDelete === 'No') {
				return;
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
		if (item.contextValue !== 'tab') {
			return;
		}

		const currentEditor = vscode.window.activeTextEditor;

		let isCurrentActiveTab = false;
		if (currentEditor && item.resourceUri) {
			isCurrentActiveTab = currentEditor.document.uri.fsPath === item.resourceUri.fsPath;
		}

		if (item.resourceUri) {
			try {
				const document = await vscode.workspace.openTextDocument(item.resourceUri);
				const preview = !isCurrentActiveTab && fromButton;
				await vscode.window.showTextDocument(document, { preview: preview });
			} catch (error) {
				vscode.window.showErrorMessage(`Failed to open file: ${item.resourceUri.fsPath}. Please check if the file exists and try again.`);
			}
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
			const activeEditor = vscode.window.activeTextEditor;
			if (!activeEditor) {
				vscode.window.showWarningMessage('No current tab to add to Tab Group or current tab is a non-source code file.');
				return;
			}

			const filePath = activeEditor.document.fileName;
			if (group.id) {
				treeDataProvider.addToGroup(group.id, filePath);
			}
		})
	);

}

export function deactivate() {
	treeDataProvider.clearRefreshInterval();
}
