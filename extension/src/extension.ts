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
			placeHolder: 'Enter new group name',
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

	context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.openTabGroupContextMenu', async () => {
			const activeEditor = vscode.window.activeTextEditor;
			if (activeEditor) {
				const filePath = activeEditor.document.fileName;

				let group: { label: string, id?: string } | undefined;
				let options: { label: string, id?: string }[] = [
					{ label: 'New Group from Current Tab...' },
					{ label: 'New Group from All Tabs...' }
				];
				options.push(...treeDataProvider.getGroups().map(group => ({ label: group.label as string, id: group.id })));
				group = await vscode.window.showQuickPick(options, { placeHolder: 'Select a group' });
				if (!group) {
					return;
				}

				if (group.label === 'New Group from Current Tab...' || group.label === 'New Group from All Tabs...') {
					let newGroupName: string | undefined;
					if (group.label === 'New Group from Current Tab...') {
						newGroupName = await getGroupName();
					} else if (group.label === 'New Group from All Tabs...') {
						newGroupName = await getGroupNameForAllToNewGroup();
					}

					if (newGroupName === undefined) {
						return;
					}
					const groupId = await treeDataProvider.addGroup(newGroupName);
					if (!groupId) {
						vscode.window.showErrorMessage(`Failed to create group with name: ${newGroupName}`);
						return;
					}

					if (group.label === 'New Group from Current Tab...') {
						treeDataProvider.addToGroup(groupId, filePath);
					} else if (group.label === 'New Group from All Tabs...') {
						vscode.commands.executeCommand('tabstronaut.addAllToNewGroup', groupId);
					}
				} else {
					if (group.id) {
						treeDataProvider.addToGroup(group.id, filePath);
					}
				}
			} else {
				vscode.window.showWarningMessage('To create a group, please ensure that at least one source code file tab is active and close all non-source code file tabs.');
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

			let newName: string | undefined = await vscode.window.showInputBox({ placeHolder: 'Enter new group name' });
			if (newName === undefined) {
				return;
			}
			if (!newName || newName.trim() === '') {
				vscode.window.showErrorMessage('Invalid group name. Please try again.');
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

			let shouldDelete: string | undefined = await vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: 'Are you sure you want to delete this group?' });

			if (!shouldDelete || shouldDelete === 'No') {
				return;
			}

			treeDataProvider.deleteGroup(group.id);
		})
	);
}

export function deactivate() { }
