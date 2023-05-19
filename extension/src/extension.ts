import * as vscode from 'vscode';
import * as path from 'path';
import { authenticate } from "./authenticate";
import { TabstronautDataProvider } from './tabstronautDataProvider';
import { TokenManager } from "./TokenManager";

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
}

export function deactivate() { }
