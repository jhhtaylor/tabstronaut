import * as vscode from 'vscode';
import * as path from 'path';
import { authenticate, getLoggedInUser } from "./authenticate";
import { TabstronautDataProvider } from './tabstronautDataProvider';
import { TokenManager } from "./TokenManager";

let treeDataProvider: TabstronautDataProvider;
let loggedInUser: string | undefined;
let treeView: vscode.TreeView<vscode.TreeItem>;

export function activate(context: vscode.ExtensionContext) {
	TokenManager.globalState = context.globalState;

	treeDataProvider = new TabstronautDataProvider();
	treeView = vscode.window.createTreeView('tabstronaut', { treeDataProvider });

	context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.openTabGroupContextMenu', async () => {
			console.log('Add Current Tab command triggered.');
			const activeEditor = vscode.window.activeTextEditor;
			if (activeEditor) {
				const filePath = activeEditor.document.fileName;
				const fileName = path.basename(filePath);

				let groupName: string | undefined;
				if (treeDataProvider.getGroups().length === 0) {
					groupName = await vscode.window.showInputBox({ prompt: 'Enter group name:' });
					if (!groupName) {
						return;
					}
				} else {
					const options: string[] = treeDataProvider.getGroups().map(group => typeof group.label === 'string' ? group.label : '').filter(label => label);
					options.push('New Group...');
					options.push('All to New Group...'); // New option added
					groupName = await vscode.window.showQuickPick(options, { placeHolder: 'Select a group' });
					if (!groupName) {
						return;
					}
					if (groupName === 'New Group...') {
						groupName = await vscode.window.showInputBox({ prompt: 'Enter new group name:' });
						if (!groupName) {
							return;
						}
					}
					if (groupName === 'All to New Group...') {
						vscode.commands.executeCommand('tabstronaut.addAllToNewGroup');
						return;
					}
				}
				treeDataProvider.addToGroup(groupName, fileName);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("tabstronaut.authenticate", async () => {
			console.log('Authenticate command triggered.');
			try {
				const user = await authenticate();
				if (user) {
					loggedInUser = user.name;
					treeDataProvider.setLoggedInContext(user.name);

					await treeDataProvider.fetchGroups();
				}
			} catch (err) {
				console.log(err);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("tabstronaut.openProfileContextMenu", async (item: vscode.TreeItem) => {
			console.log('Open Context Menu command triggered.');

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
			console.log('Logout command triggered for user:', name);
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
			let groupName: string | undefined = await vscode.window.showInputBox({ prompt: 'Enter new group name:' });
			if (!groupName) {
				return;
			}

			let startingTab = vscode.window.activeTextEditor;
			if (!startingTab) {
				// If there are no editors open, there's nothing to do
				return;
			}

			let addedFiles = new Set<string>();

			let editor: vscode.TextEditor | undefined = startingTab;
			let startFilePath = startingTab.document.fileName;
			do {
				if (editor) {
					const filePath = editor.document.fileName;
					const fileName = path.basename(filePath);

					if (!addedFiles.has(fileName)) {
						await treeDataProvider.addToGroup(groupName, fileName);
						addedFiles.add(fileName);
					}
				}

				await vscode.commands.executeCommand('workbench.action.nextEditor');
				editor = vscode.window.activeTextEditor;
			} while (editor && editor.document.fileName !== startFilePath);
		})
	);
}

export function deactivate() { }
