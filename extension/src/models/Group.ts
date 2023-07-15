import * as vscode from 'vscode';
import * as path from 'path';

export class Group extends vscode.TreeItem {
    items: vscode.TreeItem[] = [];
    id: string;

    constructor(label: string, id?: string) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'group';
        this.id = id || '';
    }

    addItem(filePath: string) {
        console.log(`In addItem with filePath: ${filePath}, type: ${typeof filePath}`);
        const baseName = path.basename(filePath);
        const item = new vscode.TreeItem(baseName, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('file');
        item.description = filePath;
        item.id = filePath;
        this.items.push(item);
    }

}
