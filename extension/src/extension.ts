import * as vscode from 'vscode';
import * as path from 'path';
import axios from 'axios';
import { authenticate } from "./authenticate";
import { TabstronautDataProvider } from './tabstronautDataProvider';
import { TokenManager } from "./TokenManager";
import { apiBaseUrl } from './constants';

let treeDataProvider: TabstronautDataProvider;

export function activate(context: vscode.ExtensionContext) {

	TokenManager.globalState = context.globalState;

	treeDataProvider = new TabstronautDataProvider();
	vscode.window.createTreeView('tabstronaut', { treeDataProvider });

	const statusBarCommand = 'tabstronaut.addCurrentTab';
	const statusBarButtonText = '$(plus) Add to Tabstronaut';

	let statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
	statusBarItem.text = statusBarButtonText;
	statusBarItem.command = statusBarCommand;
	statusBarItem.show();

	context.subscriptions.push(
		statusBarItem
	);

	context.subscriptions.push(
		vscode.commands.registerCommand(statusBarCommand, () => {
			const activeEditor = vscode.window.activeTextEditor;
			if (activeEditor) {
				const filePath = activeEditor.document.fileName;
				const fileName = path.basename(filePath);
				treeDataProvider.addItem(fileName);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("tabstronaut.authenticate", async () => {
			try {
				const user = await authenticate();
				if (user) {
					treeDataProvider.addUserItem(user.name);
				}
			} catch (err) {
				console.log(err);
			}
		})
	);

	context.subscriptions.push(
		vscode.commands.registerCommand("tabstronaut.logout", async (name: string) => {
			TokenManager.setToken(""); // Invalidate the token
			treeDataProvider.addUserItem(name); // Update the tree view item
		})
	);

	getCurrentUser().then(user => {
		if (user) {
			treeDataProvider.addUserItem(user.name);
		}
	});
}

async function getCurrentUser(): Promise<{ name: string } | undefined> {
	try {
		const token = await TokenManager.getToken(); // Get the stored token

		if (!token) {
			return undefined; // No token available, return undefined
		}

		const response = await axios.get(`${apiBaseUrl}/me`, {
			headers: { authorization: `Bearer ${token}` } // Send the token in the Authorization header
		});

		if (!response.data.user) {
			return undefined; // User not found, return undefined
		}

		return response.data.user;
	} catch (err) {
		console.error(err);
		return undefined;
	}
}


export function deactivate() { }
