import * as vscode from 'vscode';

export class Group extends vscode.TreeItem {
    items: vscode.TreeItem[] = [];
    id: string; // Add this line to create an id property

    constructor(label: string, id?: string) { // Make id optional
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'group';
        this.id = id || ''; // If id is undefined, set it as an empty string
    }

    addItem(label: string) {
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('file');
        this.items.push(item);
    }
}
