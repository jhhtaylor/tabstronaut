import * as vscode from 'vscode';
import { TabstronautDataProvider } from './tabstronautDataProvider';
import { Group } from './models/Group';

let treeDataProvider: TabstronautDataProvider;
let treeView: vscode.TreeView<vscode.TreeItem>;

export function activate(context: vscode.ExtensionContext) {
	treeDataProvider = new TabstronautDataProvider(context.workspaceState);
	treeView = vscode.window.createTreeView('tabstronaut', { treeDataProvider });

	async function getGroupName(prompt: string | undefined = undefined): Promise<string | undefined> {
		const groupName: string | undefined = await vscode.window.showInputBox({
			placeHolder: 'Enter a new Tab Group name',
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

	context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.openTabGroupContextMenu', async () => {
			const activeEditor = vscode.window.activeTextEditor;
			if (activeEditor) {
				const filePath = activeEditor.document.fileName;

				let group: CustomQuickPickItem | undefined;
				let options: CustomQuickPickItem[] = [
					{ label: 'New Tab Group from current tab...' },
					{ label: 'New Tab Group from all tabs...' },
					{ label: '', kind: vscode.QuickPickItemKind.Separator }
				];
				options.push(...treeDataProvider.getGroups().map(group => ({ label: group.label as string, id: group.id })));
				group = await vscode.window.showQuickPick(options, { placeHolder: 'Select a Tab Group' });
				if (!group) {
					return;
				}

				if (group.label === 'New Tab Group from current tab...' || group.label === 'New Tab Group from all tabs...') {
					let newGroupName: string | undefined;
					if (group.label === 'New Tab Group from current tab...') {
						newGroupName = await getGroupName();
					} else if (group.label === 'New Tab Group from all tabs...') {
						newGroupName = await getGroupNameForAllToNewGroup();
					}

					if (newGroupName === undefined) {
						return;
					}
					const groupId = await treeDataProvider.addGroup(newGroupName);
					if (!groupId) {
						vscode.window.showErrorMessage(`Failed to create Tab Group with name: ${newGroupName}.`);
						return;
					}

					if (group.label === 'New Tab Group from current tab...') {
						treeDataProvider.addToGroup(groupId, filePath);
					} else if (group.label === 'New Tab Group from all tabs...') {
						vscode.commands.executeCommand('tabstronaut.addAllToNewGroup', groupId);
					}
				} else {
					if (group.id) {
						treeDataProvider.addToGroup(group.id, filePath);
					}
				}
			} else {
				vscode.window.showWarningMessage('To create a Tab Group, please ensure that at least one source code file tab is active and close all non-source code file tabs.');
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
		vscode.commands.registerCommand('tabstronaut.openAllTabsInGroup', async (item: any) => {
			if (item.contextValue !== 'group') {
				return;
			}
			const group: Group = item;

			for (let i = 0; i < group.items.length; i++) {
				const filePath = group.items[i].description as string;
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

	context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.renameTabGroup', async (item: any) => {
			if (item.contextValue !== 'group') {
				return;
			}
			const group: Group = item;

			if (typeof group.label !== 'string') {
				return;
			}

			let newName: string | undefined = await vscode.window.showInputBox({ placeHolder: 'Enter a new Tab Group name' });
			if (newName === undefined) {
				return;
			}
			if (!newName || newName.trim() === '') {
				vscode.window.showErrorMessage('Invalid Tab Group name. Please try again.');
				return;
			}
			treeDataProvider.renameGroup(group.id, newName);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.deleteTabGroup', async (item: any) => {
			if (item.contextValue !== 'group') {
				return;
			}
			const group: Group = item;

			let shouldDelete: string | undefined = await vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: 'Are you sure you want to delete this Tab Group?' });

			if (!shouldDelete || shouldDelete === 'No') {
				return;
			}

			treeDataProvider.deleteGroup(group.id);
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.sortTabGroups', async () => {
			let options: { label: string, id: string }[] = [
				{ label: 'Sort by Date Added (Oldest First)', id: 'asc' },
				{ label: 'Sort by Date Added (Newest First)', id: 'desc' }
			];

			const sortOrder = context.globalState.get<string>('tabstronaut.sortOrder') || 'asc';
			const selected = options.find(o => o.id === sortOrder);
			if (selected) {
				selected.label = '✓ ' + selected.label;
			}

			const result: { label: string; id: string; } | undefined = await vscode.window.showQuickPick(options, { placeHolder: 'Select a sort order for the Tab Groups' });
			if (result) {
				if (selected) {
					selected.label = selected.label.replace('✓ ', '');
				}

				context.globalState.update('tabstronaut.sortOrder', result.id);

				const newSelected = options.find(o => o.id === result.id);
				if (newSelected) {
					newSelected.label = '✓ ' + newSelected.label;
				}

				treeDataProvider.sortGroups(result.id === 'desc');
			}
		})
	);
}

export function deactivate() { }
