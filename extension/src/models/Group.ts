import * as vscode from 'vscode';
import * as path from 'path';
import { toRelativeTime, getRelativeDescription } from '../utils';

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
        const relativePath = getRelativeDescription(filePath);

        const item = new TabItem(baseName, vscode.TreeItemCollapsibleState.None);
        item.resourceUri = vscode.Uri.file(filePath);
        item.description = relativePath;
        item.id = this.id + filePath;
        item.contextValue = 'tab';
        item.groupId = this.id;

        item.command = {
            command: 'tabstronaut.previewSpecificTab',
            title: 'Open Specific Tab',
            arguments: [item]
        };

        this.items.push(item);
    }
}

class TabItem extends vscode.TreeItem {
    groupId?: string;
}
