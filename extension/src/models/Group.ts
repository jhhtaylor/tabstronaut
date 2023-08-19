import * as vscode from 'vscode';
import * as path from 'path';
import { toRelativeTime, getTrimmedDirectoryPath } from '../utils';

export class Group extends vscode.TreeItem {
    items: vscode.TreeItem[] = [];
    id: string;
    creationTime: Date;

    constructor(label: string, id?: string, creationTime?: Date) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'group';
        this.id = id || '';
        this.creationTime = creationTime || new Date();
        this.description = toRelativeTime(this.creationTime);
    }

    addItem(filePath: string) {
        if (!filePath) {
            vscode.window.showErrorMessage('Filepath is corrupted. You may need to delete the group and try again.');
            return;
        }
        const baseName = path.basename(filePath);
        let relativePath = vscode.workspace.asRelativePath(filePath, true);
        relativePath = getTrimmedDirectoryPath(relativePath);

        const item = new vscode.TreeItem(baseName, vscode.TreeItemCollapsibleState.None);
        item.resourceUri = vscode.Uri.file(filePath);
        item.description = relativePath;
        item.id = this.id + filePath;
        item.contextValue = 'tab';

        // Add the command to open the tab when the item is clicked
        item.command = {
            command: 'tabstronaut.openSpecificTab',
            title: 'Open Specific Tab',
            arguments: [item]
        };

        this.items.push(item);
    }
}
