import * as vscode from 'vscode';
import * as path from 'path';
import { Group } from './models/Group';

export class TabstronautDataProvider implements vscode.TreeDataProvider<Group | vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<Group | vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<Group | vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<Group | vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    private groupsMap: Map<string, Group> = new Map();

    constructor(private workspaceState: vscode.Memento) {
        const groupData = this.workspaceState.get<{ [id: string]: { label: string, items: string[], creationTime: string } }>('tabGroups', {});
        for (const id in groupData) {
            let newGroup = new Group(groupData[id].label, id, new Date(groupData[id].creationTime));
            groupData[id].items.forEach(filePath => newGroup.addItem(filePath));
            this.groupsMap.set(id, newGroup);
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
        const groupData = this.workspaceState.get<{ [id: string]: { label: string, items: string[], creationTime: string } }>('tabGroups', {});
        const groups: Group[] = [];
        for (const id in groupData) {
            const group = new Group(groupData[id].label, id, new Date(groupData[id].creationTime));
            groupData[id].items.forEach(filePath => group.addItem(filePath));
            groups.push(group);
        }
        return groups;
    }

    async addToGroup(groupId: string, filePath: string) {
        const group = this.groupsMap.get(groupId);
        if (group) {
            if (group.items.some(item => item.description === filePath)) {
                vscode.window.showWarningMessage(`${path.basename(filePath)} is already in this Tab Group.`);
                return;
            }
            group.addItem(filePath);
            await this.updateWorkspaceState();
            this._onDidChangeTreeData.fire();
        }
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    async renameGroup(groupId: string, newName: string): Promise<void> {
        const group = this.groupsMap.get(groupId);
        if (group) {
            group.label = newName;
            await this.updateWorkspaceState();
            this._onDidChangeTreeData.fire();
        }
    }

    async deleteGroup(groupId: string): Promise<void> {
        this.groupsMap.delete(groupId);
        await this.updateWorkspaceState();
        this._onDidChangeTreeData.fire();
    }

    async updateWorkspaceState(): Promise<void> {
        let groupData: { [key: string]: { label: string, items: string[], creationTime: string } } = {};
        this.groupsMap.forEach((group, id) => {
            if (typeof group.label === 'string') {
                let items = group.items.map(item => item.description as string);
                groupData[id] = { label: group.label, items: items, creationTime: group.creationTime.toISOString() };
            } else {
                vscode.window.showErrorMessage('Invalid Tab Group name. Please try again.');
            }
        });
        await this.workspaceState.update('tabGroups', groupData);
        this._onDidChangeTreeData.fire();
    }
}