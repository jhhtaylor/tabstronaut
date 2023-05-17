import * as vscode from 'vscode';
import * as path from 'path';

// const fileIcons: { [extension: string]: vscode.ThemeIcon } = {
//     '.js': new vscode.ThemeIcon('file-type-javascript'),
//     '.ts': new vscode.ThemeIcon('file-type-typescript'),
//     '.sql': new vscode.ThemeIcon('file-type-sql'),
//     // add more mappings as needed
// };

export class TabstronautDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private items: vscode.TreeItem[] = [];

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        return Promise.resolve(this.items);
    }

    addItem(label: string) {
        //const extension = path.extname(label);
        //const icon = fileIcons[extension] || new vscode.ThemeIcon('file');
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('file');
        this.items.push(item);
        this._onDidChangeTreeData.fire();
    }
}
