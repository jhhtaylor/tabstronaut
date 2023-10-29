import * as vscode from 'vscode';
import * as path from 'path';
import { Group } from './models/Group';
import { generateUuidv4, generateRelativeTime, generateNormalizedPath, COLORS } from './utils';

export class TabstronautDataProvider implements vscode.TreeDataProvider<Group | vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<Group | vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<Group | vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<Group | vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    private groupsMap: Map<string, Group> = new Map();
    private refreshIntervalId?: NodeJS.Timeout;

    constructor(private workspaceState: vscode.Memento) {
        const groupData = this.workspaceState.get<{ [id: string]: { label: string, items: string[], creationTime: string, colorName: string } }>('tabGroups', {});
        for (const id in groupData) {
            let newGroup = new Group(groupData[id].label, id, new Date(groupData[id].creationTime), groupData[id].colorName);
            groupData[id].items.forEach(filePath => newGroup.addItem(filePath));
            this.groupsMap.set(id, newGroup);
        }

        this.refreshIntervalId = setInterval(() => this.refreshCreationTimes(), 300000);
    }

    private refreshCreationTimes(): void {
        this.groupsMap.forEach(group => {
            group.description = generateRelativeTime(group.creationTime);
        });
        this.refresh();
    }

    public clearRefreshInterval(): void {
        if (this.refreshIntervalId) {
            clearInterval(this.refreshIntervalId);
            this.refreshIntervalId = undefined;
        }
    }

    getTreeItem(element: Group | vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    private createInstructionItem(): vscode.TreeItem {
        const instructionItem = new vscode.TreeItem('Click the \'+\' icon to create a new Tab Group');
        instructionItem.contextValue = 'instruction';
        instructionItem.iconPath = new vscode.ThemeIcon('info');
        return instructionItem;
    }

    getChildren(element?: Group | vscode.TreeItem): Thenable<(Group | vscode.TreeItem)[]> {
        if (element instanceof Group) {
            return Promise.resolve(element.items);
        }

        const groups = Array.from(this.groupsMap.values());
        if (groups.length === 0) {
            return Promise.resolve([this.createInstructionItem()]);
        }

        return Promise.resolve(groups);
    }

    getParent(element: Group): vscode.ProviderResult<Group> {
        return null;
    }

    async addGroup(label: string, colorName?: string): Promise<string | undefined> {
        const newGroup = new Group(label, generateUuidv4(), new Date(), colorName);

        const newGroupsMap = new Map<string, Group>();
        newGroupsMap.set(newGroup.id, newGroup);

        this.groupsMap.forEach((group, id) => {
            newGroupsMap.set(id, group);
        });

        this.groupsMap = newGroupsMap;

        await this.updateWorkspaceState();
        this._onDidChangeTreeData.fire();
        return newGroup.id;
    }

    getGroup(groupName: string): Group | undefined {
        const groups = this.workspaceState.get<Group[]>('tabGroups', []);
        return groups.find(group => group.label === groupName);
    }

    public getGroups(): Group[] {
        const groupData = this.workspaceState.get<{ [id: string]: { label: string, items: string[], creationTime?: string } }>('tabGroups', {});
        const groups: Group[] = [];
        for (const id in groupData) {
            const creationTime = groupData[id].creationTime
                ? new Date(groupData[id].creationTime as string)
                : new Date();
            const group = new Group(groupData[id].label, id, creationTime);
            groupData[id].items.forEach(filePath => group.addItem(filePath));
            groups.push(group);
        }
        return groups;
    }

    async addToGroup(groupId: string, filePath: string) {
        const group = this.groupsMap.get(groupId);
        if (!group) return;

        const normalizedFilePath = generateNormalizedPath(filePath);
        const fileName = path.basename(filePath);
        const newItemId = groupId + filePath;

        const existingItem = group.items.find(item => generateNormalizedPath(item.resourceUri?.path || '') === normalizedFilePath);

        let itemPosition: number | null = null;

        if (existingItem) {
            vscode.window.showWarningMessage(`${fileName} is already in this Tab Group.`);
            if (existingItem.id === newItemId) {
                return;
            } else {
                const existingItemIndex = group.items.findIndex(item => item.id === existingItem.id);
                if (existingItemIndex !== -1) {
                    itemPosition = existingItemIndex;
                    group.items.splice(existingItemIndex, 1);
                }
            }
        } else {
            const shouldMoveGroup = vscode.workspace.getConfiguration('tabstronaut').get('moveTabGroupOnTabChange', true);
            if (shouldMoveGroup) {
                this.moveGroupToTopAndUpdateTimestamp(groupId);
            }
        }

        const newItem = group.createTabItem(filePath);
        if (itemPosition !== null) {
            group.items.splice(itemPosition, 0, newItem);
        } else {
            group.items.push(newItem);
        }

        await this.updateWorkspaceState();
        this._onDidChangeTreeData.fire();
    }

    private moveGroupToTopAndUpdateTimestamp(groupId: string) {
        const group = this.groupsMap.get(groupId);
        if (!group) return;

        this.groupsMap.delete(groupId);
        const newGroupsMap = new Map([[groupId, group], ...this.groupsMap.entries()]);
        this.groupsMap = newGroupsMap;

        group.creationTime = new Date();
        group.description = generateRelativeTime(group.creationTime);
    }


    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    rebuildAndRefresh(): void {
        this.groupsMap.forEach(group => {
            const items = [...group.items];
            group.items = [];
            items.forEach(itemPath => group.addItem(itemPath.resourceUri?.path as string));
        });

        this._onDidChangeTreeData.fire(undefined);
    }

    async renameGroup(groupId: string, newName: string, newColor: string): Promise<void> {
        const group = this.groupsMap.get(groupId);
        if (group) {
            const isNameChanged = group.label !== newName;
            const isColorChanged = group.colorName !== newColor;

            group.label = newName;
            group.colorName = COLORS.includes(newColor) ? newColor : COLORS[0];
            group.iconPath = new vscode.ThemeIcon('circle-filled', new vscode.ThemeColor(group.colorName));

            const shouldMoveGroup = vscode.workspace.getConfiguration('tabstronaut').get('moveTabGroupOnTabChange', true);
            if (shouldMoveGroup && (isNameChanged || isColorChanged)) {
                this.moveGroupToTopAndUpdateTimestamp(groupId);
            }

            await this.updateWorkspaceState();
            this._onDidChangeTreeData.fire();
        }
    }

    async deleteGroup(groupId: string): Promise<void> {
        this.groupsMap.delete(groupId);
        await this.updateWorkspaceState();
        this._onDidChangeTreeData.fire();
    }

    async removeFromGroup(groupId: string, filePath: string): Promise<void> {
        const group = this.groupsMap.get(groupId);
        if (!group || !filePath) return;

        const shouldConfirm = vscode.workspace.getConfiguration('tabstronaut').get('confirmRemoveAndClose', true);

        if (group.items.length === 1 && group.items[0].resourceUri?.path === filePath && shouldConfirm) {
            const shouldDelete: string | undefined = await vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: 'This is the last Tab in the Tab Group. Removing this Tab will also remove the Tab Group. Proceed?' });

            if (!shouldDelete || shouldDelete === 'No') {
                return;
            }
        }

        group.items = group.items.filter(item => item.resourceUri?.path !== filePath);

        const shouldMoveGroup = vscode.workspace.getConfiguration('tabstronaut').get('moveTabGroupOnTabChange', true);
        if (group.items.length > 0 && shouldMoveGroup) {
            this.moveGroupToTopAndUpdateTimestamp(groupId);
        } else if (group.items.length === 0) {
            this.groupsMap.delete(groupId);
        }

        await this.updateWorkspaceState();
        this._onDidChangeTreeData.fire();
    }

    public getFirstGroup(): Group | undefined {
        return Array.from(this.groupsMap.values())[0];
    }

    async updateWorkspaceState(): Promise<void> {
        let groupData: { [key: string]: { label: string, items: string[], creationTime: string, colorName: string } } = {};
        this.groupsMap.forEach((group, id) => {
            if (typeof group.label === 'string') {
                let items = group.items.map(item => item.resourceUri?.path as string);
                groupData[id] = { label: group.label, items: items, creationTime: group.creationTime.toISOString(), colorName: group.colorName };
            } else {
                vscode.window.showErrorMessage('Invalid Tab Group name. Please try again.');
            }
        });
        await this.workspaceState.update('tabGroups', groupData);
        this._onDidChangeTreeData.fire();
    }

    handleFileRename(oldPath: string, newPath: string) {
        const normalizedOldPath = generateNormalizedPath(oldPath);

        let found = false;
        this.groupsMap.forEach(group => {
            for (let i = 0; i < group.items.length; i++) {
                const item = group.items[i];
                const itemPath = item.resourceUri?.path;

                if (itemPath && generateNormalizedPath(itemPath) === normalizedOldPath) {
                    item.resourceUri = vscode.Uri.file(newPath);
                    item.label = path.basename(newPath);
                    item.id = generateUuidv4();

                    found = true;
                    break;
                }
            }

            if (found) return;
        });

        this.updateWorkspaceState().catch(err => { });
        this.refresh();
    }

    getGroupByOrder(order: number): Group {
        const allGroups: Group[] = this.getGroups();

        const isDescending = vscode.workspace.getConfiguration('tabstronaut').get<boolean>('keybindingOrder', true);

        if (isDescending) {
            return allGroups[order - 1];
        } else {
            return allGroups[allGroups.length - order];
        }
    }
}
