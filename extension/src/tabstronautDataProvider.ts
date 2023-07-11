import * as vscode from 'vscode';
import * as path from 'path';
import { Group } from './models/Group';

export class TabstronautDataProvider implements vscode.TreeDataProvider<Group | vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<Group | vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<Group | vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<Group | vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;
    private groupsMap: Map<string, Group> = new Map();

    constructor(private workspaceState: vscode.Memento) { }

    getTreeItem(element: Group | vscode.TreeItem): vscode.TreeItem {
        return element;
    }


    // getChildren(element?: Group | vscode.TreeItem): Thenable<(Group | vscode.TreeItem)[]> {
    //     if (element instanceof Group) {
    //         return Promise.resolve(element.items);
    //     }
    //     const groups = this.workspaceState.get<Group[]>('tabGroups', []);
    //     return Promise.resolve(groups);
    // }
    // getChildren(element?: Group | vscode.TreeItem): Thenable<(Group | vscode.TreeItem)[]> {
    //     if (element instanceof Group) {
    //         return Promise.resolve(element.items);
    //     }
    //     const groups = this.workspaceState.get<Group[]>('tabGroups', []);
    //     console.log('Returned groups:', groups.map(group => group.id));
    //     return Promise.resolve(groups);
    // }

    // getChildren(element?: Group | vscode.TreeItem): Thenable<(Group | vscode.TreeItem)[]> {
    //     if (element instanceof Group) {
    //         return Promise.resolve(element.items);
    //     }
    //     const groups = this.workspaceState.get<Group[]>('tabGroups', []);
    //     return Promise.resolve(groups.map(group => new vscode.TreeItem(group.label as string)));
    // }

    getChildren(element?: Group | vscode.TreeItem): Thenable<(Group | vscode.TreeItem)[]> {
        if (element instanceof Group) {
            console.log('Items in group:', element.items.map(item => item.id));
            return Promise.resolve(element.items);
        }
        const groups = this.workspaceState.get<Group[]>('tabGroups', []);
        console.log('Returned groups:', groups.map(group => group.id));
        return Promise.resolve(groups);
    }



    // async addGroup(label: string): Promise<Group | undefined> {
    //     const groups = this.workspaceState.get<Group[]>('tabGroups', []);
    //     const newGroup = new Group(label, this.uuidv4());  // Use uuidv4() to generate a unique id
    //     groups.push(newGroup);
    //     await this.workspaceState.update('tabGroups', groups);
    //     this._onDidChangeTreeData.fire();
    //     return newGroup;
    // }

    async addGroup(label: string): Promise<Group | undefined> {
        const groups = this.workspaceState.get<Group[]>('tabGroups', []);
        const newGroup = new Group(label, this.uuidv4());
        groups.push(newGroup);
        this.groupsMap.set(newGroup.id, newGroup);
        await this.workspaceState.update('tabGroups', groups);
        this._onDidChangeTreeData.fire();
        return newGroup;
    }


    getGroup(groupName: string): Group | undefined {
        const groups = this.workspaceState.get<Group[]>('tabGroups', []);
        return groups.find(group => group.label === groupName);
    }

    public getGroups(): Group[] {
        return this.workspaceState.get<Group[]>('tabGroups', []);
    }

    async addToGroup(groupName: string, filePath: string) {
        const groups = this.workspaceState.get<Group[]>('tabGroups', []);
        const group = groups.find(group => group.label === groupName);
        if (group) {
            if (group.items.some(item => item.description === filePath)) {
                vscode.window.showWarningMessage(`Tab ${path.basename(filePath)} is already in the group.`);
                return;
            }
            group.addItem(filePath);
            await this.workspaceState.update('tabGroups', groups);
            this._onDidChangeTreeData.fire();
        }
    }

    // async addToGroup(groupName: string, filePath: string) {
    //     console.log(`addToGroup called with groupName: ${groupName} and filePath: ${filePath}`);

    //     const groups = this.workspaceState.get<Group[]>('tabGroups', []);
    //     const group = groups.find(group => group.label === groupName);

    //     console.log(`Group found: ${group}`);

    //     if (group) {
    //         if (group.items.some(item => item.description === filePath)) {
    //             vscode.window.showWarningMessage(`Tab ${path.basename(filePath)} is already in the group.`);
    //             return;
    //         }
    //         group.addItem(filePath);
    //         await this.workspaceState.update('tabGroups', groups);

    //         console.log(`Group added to workspaceState: ${groups}`);

    //         this._onDidChangeTreeData.fire();

    //         console.log(`_onDidChangeTreeData.fire called`);
    //     }
    // }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    async renameGroup(groupId: string, newName: string): Promise<void> {
        const groups = this.workspaceState.get<Group[]>('tabGroups', []);
        const group = groups.find(group => group.id === groupId);
        if (group) {
            group.label = newName;
            await this.workspaceState.update('tabGroups', groups);
            this._onDidChangeTreeData.fire();
        }
    }

    async deleteGroup(groupId: string): Promise<void> {
        let groups = this.workspaceState.get<Group[]>('tabGroups', []);
        groups = groups.filter(group => group.id !== groupId);
        await this.workspaceState.update('tabGroups', groups);
        this._onDidChangeTreeData.fire();
    }

    uuidv4() {
        return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
            var r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
            return v.toString(16);
        });
    }

}
