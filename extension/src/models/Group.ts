import * as vscode from 'vscode';
import * as path from 'path';

export class Group extends vscode.TreeItem {
    items: vscode.TreeItem[] = [];
    id: string; // Add this line to create an id property

    constructor(label: string, id?: string) { // Make id optional
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'group';
        this.id = id || ''; // If id is undefined, set it as an empty string
    }

    addItem(filePath: string) {
        const baseName = path.basename(filePath); // Extract the base name from the file path
        const item = new vscode.TreeItem(baseName, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('file');
        item.description = filePath; // Add this line to store the full path in description property
        this.items.push(item);
    }
}
