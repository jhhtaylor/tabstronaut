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

    getTrimmedDirectoryPath(filePath: string): string {
        const segments = filePath.split('/');
        if (segments.length > 0) {
            segments.shift();
        }
        if (segments.length > 0) {
            segments.pop();
        }
        const modifiedPath = segments.join('/');

        return modifiedPath;
    }

    addItem(filePath: string) {
        const baseName = path.basename(filePath);
        let relativePath = vscode.workspace.asRelativePath(filePath, true);
        relativePath = getTrimmedDirectoryPath(relativePath);

        const item = new vscode.TreeItem(baseName, vscode.TreeItemCollapsibleState.None);
        item.resourceUri = vscode.Uri.file(filePath);
        item.description = relativePath;
        item.id = this.id + filePath;

        this.items.push(item);
    }
}
