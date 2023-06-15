import * as vscode from 'vscode';
import { Group } from './models/Group';
import { TokenManager } from "./TokenManager";
import axios from 'axios';
import * as path from 'path';

export class TabstronautDataProvider implements vscode.TreeDataProvider<Group | vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<Group | vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<Group | vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<Group | vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private groups: Group[] = [];

    private items: vscode.TreeItem[] = [];
    private loggedInUser: string | null = null;

    getTreeItem(element: Group | vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: Group | vscode.TreeItem): Thenable<(Group | vscode.TreeItem)[]> {
        if (element instanceof Group) {
            return Promise.resolve(element.items);
        }
        const userItem = this.createLoggedInItem(this.loggedInUser || undefined);
        return Promise.resolve([userItem, ...this.groups]);
    }

    async addGroup(label: string): Promise<Group | undefined> {
        console.log(`Attempting to add group with label: ${label}`);
        try {
            const response = await axios.post('http://localhost:3002/tabGroups', { name: label }, {
                headers: {
                    Authorization: `Bearer ${TokenManager.getToken()}`,
                },
            });

            console.log('addGroup response', response.data);

            const groupId = response.data.newGroup.id;

            const group = new Group(label, groupId);

            this.groups.unshift(group);

            this._onDidChangeTreeData.fire();

            console.log(`Group added: ${JSON.stringify(group)}`);

            return group;
        } catch (error) {
            console.error('Error occurred while adding group:', error);
            return undefined;
        }
    }

    getGroup(groupName: string): Group | undefined {
        console.log(`Attempting to get group with name: ${groupName}`);
        let group = this.groups.find(g => g.label === groupName);
        console.log(`Group added: ${JSON.stringify(group)}`);
        return group;
    }

    public getGroups(): Group[] {
        return this.groups;
    }

    async addToGroup(groupName: string, filePath: string) {
        console.log(`Attempting to add tab with label: ${filePath} to group with name: ${groupName}`);

        let group = this.getGroup(groupName);
        if (!group) {
            group = await this.addGroup(groupName);
            if (!group) {
                vscode.window.showErrorMessage(`Failed to create group with name: ${groupName}`);
                return;
            }
        }

        if (group.items.some(item => item.description === filePath)) {
            vscode.window.showWarningMessage(`Tab ${path.basename(filePath)} is already in the group.`);
            return;
        }

        const groupId = group?.id;
        if (group && groupId) {
            await this.updateGroup(Number(groupId), filePath);
            group?.addItem(filePath);
            this._onDidChangeTreeData.fire();
        }
        console.log(`Tab added to group: ${JSON.stringify(group)}`);
    }

    addItem(label: string) {
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('file');
        this.items.push(item);
        this._onDidChangeTreeData.fire();
    }

    setLoggedInContext(name?: string) {
        this.loggedInUser = name !== undefined ? name : null;
        vscode.commands.executeCommand('setContext', 'isLoggedIn', !!this.loggedInUser);
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    private createLoggedInItem(name?: string): vscode.TreeItem {
        if (!name) {
            console.log("No user name. Creating log in item.");
            const item = new vscode.TreeItem('Log in with GitHub', vscode.TreeItemCollapsibleState.None);
            item.command = {
                title: 'Log in',
                command: 'tabstronaut.authenticate'
            };

            item.iconPath = new vscode.ThemeIcon('github-inverted');
            return item;
        }

        const item = new vscode.TreeItem(`${name}`, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('account');
        item.contextValue = 'loggedInUser';
        item.tooltip = `${name}`;
        item.command = {
            title: 'Logout',
            command: 'tabstronaut.openProfileContextMenu',
            arguments: [item]
        };

        return item;
    }

    getLoggedInUser(): string | null {
        return this.loggedInUser;
    }

    async fetchGroups() {
        console.log("fetchGroups function triggered.");
        try {
            const response = await axios.get('http://localhost:3002/tabGroups', {
                headers: {
                    Authorization: `Bearer ${TokenManager.getToken()}`,
                },
            });

            this.groups = response.data.tabGroups.map((groupData: any) => {
                const group = new Group(groupData.name, groupData.id);
                groupData.tabs.forEach((tabData: any) => {
                    group.addItem(tabData.name);
                });
                return group;
            }).reverse();

            this._onDidChangeTreeData.fire();
        } catch (error) {
            console.error(error);
        }
    }

    clearGroups() {
        this.groups = [];
        this._onDidChangeTreeData.fire();
    }

    async updateGroup(groupId: number, tabLabel: string) {
        console.log(`Attempting to update group with id: ${groupId} by adding tab with label: ${tabLabel}`);
        try {
            const response = await axios.put(`http://localhost:3002/tabGroups/${groupId}`, { tabLabel }, {
                headers: {
                    Authorization: `Bearer ${TokenManager.getToken()}`,
                },
            });

            console.log('updateGroup response', response.data);

            this.fetchGroups();

        } catch (error) {
            console.error(error);
        }
    }

    async renameGroup(groupId: string, newName: string): Promise<void> {
        try {
            const response = await axios.patch('http://localhost:3002/tabGroups/' + groupId, {
                newName: newName
            }, {
                headers: {
                    'Authorization': `Bearer ${TokenManager.getToken()}`
                }
            });

            if (response.status === 200) {
                console.log('Group renamed successfully: ', response.data);
                await this.fetchGroups();
            } else {
                console.log('Failed to rename group: ', response.data);
            }
        } catch (err) {
            console.error('Failed to rename group: ', err);
        }
    }

    async deleteGroup(groupId: string): Promise<void> {
        try {
            const response = await axios.delete('http://localhost:3002/tabGroups/' + groupId, {
                headers: {
                    'Authorization': `Bearer ${TokenManager.getToken()}`
                }
            });

            if (response.status === 200) {
                console.log('Group deleted successfully: ', response.data);
                await this.fetchGroups();
            } else {
                console.log('Failed to delete group: ', response.data);
            }
        } catch (err) {
            console.error('Failed to delete group: ', err);
        }
    }

}
