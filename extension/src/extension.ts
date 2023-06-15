import * as vscode from 'vscode';
import * as path from 'path';
import { authenticate, getLoggedInUser } from "./authenticate";
import { TabstronautDataProvider } from './tabstronautDataProvider';
import { TokenManager } from "./TokenManager";
import { Group } from './models/Group';

let treeDataProvider: TabstronautDataProvider;
let loggedInUser: string | undefined;
let treeView: vscode.TreeView<vscode.TreeItem>;

export function activate(context: vscode.ExtensionContext) {
	TokenManager.globalState = context.globalState;

	treeDataProvider = new TabstronautDataProvider();
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
		vscode.commands.registerCommand("tabstronaut.authenticate", async () => {
			try {
				const user = await authenticate();
				if (user) {
					loggedInUser = user.name;
					treeDataProvider.setLoggedInContext(user.name);

					await treeDataProvider.fetchGroups();
				}
			} catch (err) {
				console.error(err);
				vscode.window.showErrorMessage(`Authentication failed. Please check your network connection and try again. If the problem persists, check if the credentials you're using for authentication are valid.`);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("tabstronaut.openProfileContextMenu", async (item: vscode.TreeItem) => {
			if (item.contextValue === "loggedInUser") {
				const choice = await vscode.window.showQuickPick(["Log out"], {
					placeHolder: "Select an action"
				});

				if (choice === "Log out") {
					vscode.commands.executeCommand("tabstronaut.logout", item.label);
				}
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("tabstronaut.logout", async (name: string) => {
			TokenManager.setToken("");
			loggedInUser = undefined;
			treeDataProvider.setLoggedInContext('');
			treeDataProvider.clearGroups();
		})
	);

	getLoggedInUser().then(async (user) => {
		if (user) {
			loggedInUser = user.name;
			treeDataProvider.setLoggedInContext(user.name);
			await treeDataProvider.fetchGroups();
		}
	});

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
