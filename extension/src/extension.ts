import * as vscode from 'vscode';
import * as path from 'path';
import { TabstronautDataProvider } from './tabstronautDataProvider';
import { Group } from './models/Group';

let treeDataProvider: TabstronautDataProvider;
let treeView: vscode.TreeView<vscode.TreeItem>;

export function activate(context: vscode.ExtensionContext) {
	treeDataProvider = new TabstronautDataProvider(context.workspaceState);
	treeView = vscode.window.createTreeView('tabstronaut', { treeDataProvider });

	async function getGroupName(): Promise<string> {
		let groupName: string | undefined = await vscode.window.showInputBox({ prompt: 'Enter new group name:' });
		return groupName === undefined ? `Group ${treeDataProvider.getGroups().length + 1}` : groupName.trim() !== '' ? groupName : `Group ${treeDataProvider.getGroups().length + 1}`;
	}

	context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.openTabGroupContextMenu', async () => {
			const activeEditor = vscode.window.activeTextEditor;
			if (activeEditor) {
				const filePath = activeEditor.document.fileName;

				let groupName: string | undefined;
				let options: string[] = ['New Group from Current Tab...', 'New Group from All Tabs...'];
				options.push(...treeDataProvider.getGroups().map(group => typeof group.label === 'string' ? group.label : '').filter(label => label));
				groupName = await vscode.window.showQuickPick(options, { placeHolder: 'Select a group' });
				if (!groupName) {
					return;
				}
				if (groupName === 'New Group from Current Tab...') {
					groupName = await getGroupName();
					const group = await treeDataProvider.addGroup(groupName);
					if (!group) {
						vscode.window.showErrorMessage(`Failed to create group with name: ${groupName}`);
						return;
					}
				}
				if (groupName === 'New Group from All Tabs...') {
					vscode.commands.executeCommand('tabstronaut.addAllToNewGroup');
					return;
				}

				if (groupName) {
					treeDataProvider.addToGroup(groupName, filePath);
				}
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.addAllToNewGroup', async () => {
			let groupName: string | undefined = await getGroupName();

			if (!groupName) {
				return;
			}

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
						await treeDataProvider.addToGroup(groupName, filePath);
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
						console.error(`Failed to open file: ${filePath}`);
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

			let newName: string | undefined = await vscode.window.showInputBox({ prompt: 'Enter new group name:' });
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
