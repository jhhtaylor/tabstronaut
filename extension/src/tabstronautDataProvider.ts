import * as vscode from 'vscode';
import * as path from 'path';
import { Group } from './models/Group';
import { toRelativeTime, normalizePath } from './utils';

export class TabstronautDataProvider implements vscode.TreeDataProvider<Group | vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<Group | vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<Group | vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<Group | vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    private groupsMap: Map<string, Group> = new Map();
    private refreshIntervalId?: NodeJS.Timeout;

    constructor(private workspaceState: vscode.Memento) {
        const groupData = this.workspaceState.get<{ [id: string]: { label: string, items: string[], creationTime: string } }>('tabGroups', {});
        for (const id in groupData) {
            let newGroup = new Group(groupData[id].label, id, new Date(groupData[id].creationTime));
            groupData[id].items.forEach(filePath => newGroup.addItem(filePath));
            this.groupsMap.set(id, newGroup);
        }

        this.refreshIntervalId = setInterval(() => this.refreshCreationTimes(), 300000);
    }

    private refreshCreationTimes(): void {
        this.groupsMap.forEach(group => {
            group.description = toRelativeTime(group.creationTime);
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

    getChildren(element?: Group | vscode.TreeItem): Thenable<(Group | vscode.TreeItem)[]> {
        if (element instanceof Group) {
            return Promise.resolve(element.items);
        }

        const groups = Array.from(this.groupsMap.values());
        return Promise.resolve(groups);
    }

    async addGroup(label: string): Promise<string | undefined> {
        const newGroup = new Group(label, this.uuidv4());

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

    uuidv4() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
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

        const normalizedFilePath = normalizePath(filePath);

        if (group.items.some(item => normalizePath(item.resourceUri?.path || '') === normalizedFilePath)) {
            vscode.window.showWarningMessage(`${path.basename(filePath)} is already in this Tab Group.`);
            return;
        }

        group.addItem(filePath);
        await this.updateWorkspaceState();
        this._onDidChangeTreeData.fire();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    async renameGroup(groupId: string, newName: string, newColor: vscode.ThemeColor): Promise<void> {
        const group = this.groupsMap.get(groupId);
        if (group) {
            group.label = newName;
            group.iconPath = new vscode.ThemeIcon('circle-large-filled', newColor); // Apply the new color here
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

        if (group.items.length === 1 && group.items[0].resourceUri?.path === filePath) {
            const shouldDelete: string | undefined = await vscode.window.showQuickPick(['Yes', 'No'], { placeHolder: 'This is the last Tab in the Tab Group. Removing this Tab will also remove the Tab Group. Proceed?' });

            if (!shouldDelete || shouldDelete === 'No') {
                return;
            }
        }

        group.items = group.items.filter(item => item.resourceUri?.path !== filePath);

        if (group.items.length === 0) {
            this.groupsMap.delete(groupId);
        }

        await this.updateWorkspaceState();
        this._onDidChangeTreeData.fire();
    }

    async updateWorkspaceState(): Promise<void> {
        let groupData: { [key: string]: { label: string, items: string[], creationTime: string } } = {};
        this.groupsMap.forEach((group, id) => {
            if (typeof group.label === 'string') {
                let items = group.items.map(item => item.resourceUri?.path as string);
                groupData[id] = { label: group.label, items: items, creationTime: group.creationTime.toISOString() };
            } else {
                vscode.window.showErrorMessage('Invalid Tab Group name. Please try again.');
            }
        });
        await this.workspaceState.update('tabGroups', groupData);
        this._onDidChangeTreeData.fire();
    }
}