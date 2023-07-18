import * as vscode from 'vscode';
import * as path from 'path';
import { Group } from './models/Group';

export class TabstronautDataProvider implements vscode.TreeDataProvider<Group | vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<Group | vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<Group | vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<Group | vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    private groupsMap: Map<string, Group> = new Map();
    private groupSortOrder: boolean;

    constructor(private workspaceState: vscode.Memento) {
        this.groupSortOrder = this.workspaceState.get('groupSortOrder', false);

        const groupData = this.workspaceState.get<{ [id: string]: { label: string, items: string[] } }>('tabGroups', {});
        for (const id in groupData) {
            let newGroup = new Group(groupData[id].label, id);
            groupData[id].items.forEach(filePath => newGroup.addItem(filePath));
            this.groupsMap.set(id, newGroup);
        }

        this.sortGroups(this.groupSortOrder);
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
        this.groupsMap.set(newGroup.id, newGroup);

        this.sortGroups(this.groupSortOrder);

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
        const groupData = this.workspaceState.get<{ [id: string]: { label: string, items: string[] } }>('tabGroups', {});
        const groups: Group[] = [];
        for (const id in groupData) {
            const group = new Group(groupData[id].label, id);
            groupData[id].items.forEach(filePath => group.addItem(filePath));
            groups.push(group);
        }
        return groups;
    }

    async addToGroup(groupId: string, filePath: string) {
        const group = this.groupsMap.get(groupId);
        if (group) {
            if (group.items.some(item => item.description === filePath)) {
                vscode.window.showWarningMessage(`${path.basename(filePath)} is already in this group.`);
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
        let groupData: { [key: string]: { label: string, items: string[] } } = {};
        this.groupsMap.forEach((group, id) => {
            if (typeof group.label === 'string') {
                let items = group.items.map(item => item.description as string);
                groupData[id] = { label: group.label, items: items };
            } else {
                vscode.window.showErrorMessage('Invalid group name. Please try again.');
            }
        });
        await this.workspaceState.update('tabGroups', groupData);
        this._onDidChangeTreeData.fire();
    }

    public sortGroups(desc: boolean) {
        this.groupSortOrder = desc;
        this.workspaceState.update('groupSortOrder', this.groupSortOrder);

        const sortedGroups = Array.from(this.groupsMap.values()).sort((a, b) => {
            if (typeof a.label === "string" && typeof b.label === "string") {
                return desc ? b.label.localeCompare(a.label) : a.label.localeCompare(b.label);
            }
            return 0;
        });
        this.groupsMap = new Map(sortedGroups.map(group => [group.id, group]));
        this._onDidChangeTreeData.fire();
    }
}
