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

	const statusBarCommand = 'tabstronaut.addCurrentTab';
	const statusBarButtonText = '$(plus) Tabstronaut';

	let statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
	statusBarItem.text = statusBarButtonText;
	statusBarItem.command = statusBarCommand;
	statusBarItem.show();

	context.subscriptions.push(statusBarItem);

	context.subscriptions.push(
		vscode.commands.registerCommand(statusBarCommand, async () => {
			console.log('Add Current Tab command triggered.');
			const activeEditor = vscode.window.activeTextEditor;
			if (activeEditor) {
				const filePath = activeEditor.document.fileName;
				const fileName = path.basename(filePath);

				// Show input box if there are no groups yet
				let groupName: string | undefined;
				if (treeDataProvider.getGroups().length === 0) {
					groupName = await vscode.window.showInputBox({ prompt: 'Enter group name:' });
					if (!groupName) {
						return;
					}
				} else {
					// Show quick pick dialog for group selection
					const options: string[] = treeDataProvider.getGroups().map(group => typeof group.label === 'string' ? group.label : '').filter(label => label);
					options.push('New Group...'); // Option to create a new group
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
					treeDataProvider.addUserItem(user.name); // Pass the user name to the addUserItem method
				}
			} catch (err) {
				console.log(err);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("tabstronaut.openContextMenu", async (item: vscode.TreeItem) => {
			console.log('Open Context Menu command triggered.');

			if (item.contextValue === "loggedInUser") {
				const choice = await vscode.window.showQuickPick(["Logout"], {
					placeHolder: "Select an action"
				});

				if (choice === "Logout") {
					vscode.commands.executeCommand("tabstronaut.logout", item.label);
				}
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("tabstronaut.logout", async (name: string) => {
			console.log('Logout command triggered for user:', name);
			TokenManager.setToken(""); // Invalidate the token
			loggedInUser = undefined; // Reset the logged-in user
			treeDataProvider.addUserItem(''); // Pass an empty string to the addUserItem method
		})
	);

	getLoggedInUser().then(user => {
		if (user) {
			loggedInUser = user.name;
			treeDataProvider.addUserItem(user.name); // Pass the user name to the addUserItem method
		}
	});
}

export function deactivate() { }
