import * as vscode from 'vscode';

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
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('file');
        this.items.push(item);
        this._onDidChangeTreeData.fire();
    }

    addUserItem(name: string) {
        const item = new vscode.TreeItem(`Logged in as ${name}`, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('account');
        this.items.unshift(item);
        this._onDidChangeTreeData.fire();
    }
}
