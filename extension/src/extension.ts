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
			console.log('Add Current Tab command triggered.');
			const activeEditor = vscode.window.activeTextEditor;
			if (activeEditor) {
				const filePath = activeEditor.document.fileName;
				//const fileName = path.basename(filePath);

				let groupName: string | undefined;
				if (treeDataProvider.getGroups().length === 0) {
					groupName = await getGroupName();
				} else {
					let options: string[] = ['New Group from Current Tab...', 'New Group from All Tabs...']; // Add the options to the top of the list
					options.push(...treeDataProvider.getGroups().map(group => typeof group.label === 'string' ? group.label : '').filter(label => label)); // Then add the group names
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
				}

				if (groupName) {
					treeDataProvider.addToGroup(groupName, filePath);
				}
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
			let groupName: string | undefined = await getGroupName();

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

	context.subscriptions.push(
		vscode.commands.registerCommand('tabstronaut.openAllTabsInGroup', async (item: any) => {
			console.log('Open All Tabs In Group command triggered.');
			if (item.contextValue !== 'group') {
				// If it's not a group, we don't need to proceed further
				console.log(`The clicked item is not a group: ${item.label}`);
				return;
			}
			const group: Group = item; // We now know this is a Group

			for (let i = 0; i < group.items.length; i++) {
				const filePath = group.items[i].label as string;
				if (filePath) {
					try {
						const document = await vscode.workspace.openTextDocument(filePath);
						await vscode.window.showTextDocument(document, { preview: false });
					} catch (error) {
						console.error(`Failed to open file: ${filePath}`);
						console.error(error);
					}
				}
			}
		})
	);
}

export function deactivate() { }
