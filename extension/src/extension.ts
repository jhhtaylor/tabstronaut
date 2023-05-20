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
		vscode.commands.registerCommand("tabstronaut.authenticate", () => {
			try {
				authenticate();
			} catch (err) {
				console.log(err);
			}
		})
	);

	getCurrentUser().then(user => {
		if (user) {
			treeDataProvider.addUserItem(user.name);
		}
	});
}

async function getCurrentUser() {
	try {
		const token = await TokenManager.getToken(); // Get the stored token

		const response = await axios.get(`${apiBaseUrl}/me`, {
			headers: { Authorization: `Bearer ${token}` } // Send the token in the Authorization header
		});

		return response.data.user;
	} catch (err) {
		console.error(err);
	}

	return null;
}

export function deactivate() { }
