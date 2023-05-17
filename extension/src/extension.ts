import * as vscode from 'vscode';
import { TabstronautDataProvider } from './tabstronautDataProvider';

export function activate(context: vscode.ExtensionContext) {
	const treeDataProvider = new TabstronautDataProvider();
	vscode.window.createTreeView('tabstronaut', { treeDataProvider });
}
