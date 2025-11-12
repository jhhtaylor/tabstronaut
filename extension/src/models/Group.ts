import * as vscode from 'vscode';
import * as path from 'path';
import { generateRelativeTime, generateRelativeDescription, generateColorHash, COLORS, generateNormalizedPath } from '../utils';

export class Group extends vscode.TreeItem {
    items: TabItem[] = [];
    id: string;
    creationTime: Date;
    colorName: string;
    isPinned: boolean;
    activeFilePath?: string;

    constructor(
        label: string,
        id: string = '',
        creationTime: Date = new Date(),
        colorName?: string,
        isPinned = false,
    ) {
        super(label, vscode.TreeItemCollapsibleState.Collapsed);
        this.contextValue = 'group';
        this.id = id;
        this.creationTime = creationTime;
        this.description = generateRelativeTime(this.creationTime);
        this.colorName = colorName || COLORS[Math.abs(generateColorHash(this.id)) % COLORS.length];
        this.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor(this.colorName));
        this.isPinned = isPinned;
    }

    createTabItem(filePath: string): TabItem {
        const baseName = path.basename(filePath);
        const relativePath = generateRelativeDescription(filePath);
        const item = new TabItem(baseName, vscode.TreeItemCollapsibleState.None);
        item.resourceUri = vscode.Uri.file(filePath);
        const ADD_PATHS_SETTING: boolean = vscode.workspace.getConfiguration('tabstronaut').get('addPaths', true);
        item.description = ADD_PATHS_SETTING ? relativePath : '';
        item.id = this.id + filePath;
        item.contextValue = 'tab';
        item.groupId = this.id;
        item.command = {
            command: 'tabstronaut.previewSpecificTab',
            title: 'Open Specific Tab',
            arguments: [item]
        };
        return item;
    }

    containsFile(filePath: string): boolean {
        const normalized = generateNormalizedPath(filePath);
        return this.items.some(
            (i) =>
                generateNormalizedPath(i.resourceUri?.fsPath || '') === normalized
        );
    }

    addItem(filePath: string) {
        if (!filePath) {
            vscode.window.showErrorMessage(`Cannot interpret file path. You may need to delete the Tab Group and try again.`);
            return;
        }
        this.items.push(this.createTabItem(filePath));
    }
}

export class TabItem extends vscode.TreeItem {
    groupId?: string;
}
