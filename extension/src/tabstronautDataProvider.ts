import * as vscode from 'vscode';
import axios from 'axios';
import * as path from 'path';
import { Group } from './models/Group';
import { TokenManager } from "./TokenManager";
import { apiBaseUrl } from './constants';

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
        try {
            const response = await axios.post(`${apiBaseUrl}/tabGroups`, { name: label }, {
                headers: {
                    Authorization: `Bearer ${TokenManager.getToken()}`,
                },
            });

            const groupId = response.data.newGroup.id;

            const group = new Group(label, groupId);

            this.groups.unshift(group);

            this._onDidChangeTreeData.fire();

            return group;
        } catch (error) {
            console.error('Error occurred while adding group:', error);
            vscode.window.showErrorMessage(`Failed to add group with name: ${label}. Please try again with a different name. If the problem persists, please check your network connection and try again.`);
            return undefined;
        }
    }

    getGroup(groupName: string): Group | undefined {
        let group = this.groups.find(g => g.label === groupName);
        return group;
    }

    public getGroups(): Group[] {
        return this.groups;
    }

    async addToGroup(groupName: string, filePath: string) {
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
        try {
            const response = await axios.get(`${apiBaseUrl}/tabGroups`, {
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
            vscode.window.showErrorMessage(`Failed to fetch groups. Please try again. If the problem persists, please check your network connection and try again.`);
        }
    }

    clearGroups() {
        this.groups = [];
        this._onDidChangeTreeData.fire();
    }

    async updateGroup(groupId: number, tabLabel: string) {
        try {
            const response = await axios.put(`${apiBaseUrl}/tabGroups/${groupId}`, { tabLabel }, {
                headers: {
                    Authorization: `Bearer ${TokenManager.getToken()}`,
                },
            });

            this.fetchGroups();

        } catch (error) {
            console.error(error);
            vscode.window.showErrorMessage(`Failed to update group. Please try again with a different name. If the problem persists, please check your network connection and try again.`);
        }
    }

    async renameGroup(groupId: string, newName: string): Promise<void> {
        try {
            const response = await axios.patch(`${apiBaseUrl}/tabGroups/` + groupId, {
                newName: newName
            }, {
                headers: {
                    'Authorization': `Bearer ${TokenManager.getToken()}`
                }
            });

            if (response.status === 200) {
                await this.fetchGroups();
            }
        } catch (err) {
            console.error('Failed to rename group: ', err);
            vscode.window.showErrorMessage(`Failed to rename group. Please try again with a different name. If the problem persists, please check your network connection and try again.`);
        }
    }

    async deleteGroup(groupId: string): Promise<void> {
        try {
            const response = await axios.delete(`${apiBaseUrl}/tabGroups/` + groupId, {
                headers: {
                    'Authorization': `Bearer ${TokenManager.getToken()}`
                }
            });

            if (response.status === 200) {
                await this.fetchGroups();
            }
        } catch (err) {
            console.error('Failed to delete group: ', err);
            vscode.window.showErrorMessage(`Failed to delete group. Please try again. If the problem persists, please check your network connection and try again.`);
        }
    }

}
