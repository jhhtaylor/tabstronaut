import * as vscode from 'vscode';
import * as path from 'path';
import { TabstronautDataProvider } from './tabstronautDataProvider';

let treeDataProvider: TabstronautDataProvider;

export function activate(context: vscode.ExtensionContext) {
	treeDataProvider = new TabstronautDataProvider();
	vscode.window.createTreeView('tabstronaut', { treeDataProvider });

	const statusBarCommand = 'tabstronaut.addCurrentTab';
	const statusBarButtonText = '$(plus) Add to Tabstronaut';

	let statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Right);
	statusBarItem.text = statusBarButtonText;
	statusBarItem.command = statusBarCommand;
	statusBarItem.show();
	context.subscriptions.push(statusBarItem);

	let disposable = vscode.commands.registerCommand(statusBarCommand, () => {
		const activeEditor = vscode.window.activeTextEditor;
		if (activeEditor) {
			const filePath = activeEditor.document.fileName;
			const fileName = path.basename(filePath);
			treeDataProvider.addItem(fileName);
		}
	});
	context.subscriptions.push(disposable);
}
