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
            // Post to your backend to create a new group
            const response = await axios.post('http://localhost:3002/tabGroups', { name: label }, {
                headers: {
                    Authorization: `Bearer ${TokenManager.getToken()}`,
                },
            });

            console.log('addGroup response', response.data);

            // Assuming the response data contains the new group's id 
            const groupId = response.data.newGroup.id;

            // Now we can create a new group with the correct id
            const group = new Group(label, groupId);

            // Then we can add this group to our groups array
            this.groups.push(group);

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

    async addToGroup(groupName: string, tabLabel: string) {
        console.log(`Attempting to add tab with label: ${tabLabel} to group with name: ${groupName}`);

        let group = this.getGroup(groupName);
        if (!group) {
            group = await this.addGroup(groupName);
            if (!group) {
                vscode.window.showErrorMessage(`Failed to create group with name: ${groupName}`);
                return;
            }
        }

        // Update the group in the DB
        const groupId = group?.id; // You'll need to fetch and store the group's DB id when fetching groups
        if (group && groupId) {
            await this.updateGroup(Number(groupId), tabLabel); // Send only the new tab's label
            group?.addItem(tabLabel);
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

    addUserItem(name?: string) {
        this.loggedInUser = name !== undefined ? name : null;
        this._onDidChangeTreeData.fire();

        const existingItem = this.items.find(item => item.contextValue === 'loggedInUser');

        if (existingItem) {
            existingItem.label = name ? `${name}` : 'Log in with GitHub';
            existingItem.tooltip = name ? `${name}` : '';
            existingItem.command = name ? {
                title: 'Logout',
                command: 'tabstronaut.openProfileContextMenu',
                arguments: [existingItem]
            } : {
                title: 'Log in',
                command: 'tabstronaut.authenticate'
            };
        } else {
            const item = this.createLoggedInItem(name);
            this.items.push(item);
        }

        this._onDidChangeTreeData.fire();
    }

    refresh(): void {
        this._onDidChangeTreeData.fire();
    }

    private getGithubIconPath(): string | null {
        const extension = vscode.extensions.getExtension('tabstronaut.tabstronaut');
        if (!extension) {
            console.error('Could not find extension');
            return null;
        }
        const extensionDirectoryPath = extension.extensionPath;

        let githubIconPath: string;
        if (vscode.window.activeColorTheme.kind === vscode.ColorThemeKind.Dark) {
            console.log("Dark theme detected. Using light GitHub icon.");
            githubIconPath = path.join(extensionDirectoryPath, 'media', 'github-mark-white.svg');
        } else {
            console.log("Light or high contrast theme detected. Using dark GitHub icon.");
            githubIconPath = path.join(extensionDirectoryPath, 'media', 'github-mark.svg');
        }

        console.log('githubIconPath:', githubIconPath); // Debugging log
        return githubIconPath;
    }

    private createLoggedInItem(name?: string): vscode.TreeItem {
        const githubIconPath = this.getGithubIconPath();
        if (!githubIconPath) {
            console.error('Could not get GitHub icon path');
            const item = new vscode.TreeItem('Error: Could not get GitHub icon path', vscode.TreeItemCollapsibleState.None);
            return item;
        }

        if (!name) {
            console.log("No user name. Creating log in item.");
            const item = new vscode.TreeItem('Log in with GitHub', vscode.TreeItemCollapsibleState.None);
            item.command = {
                title: 'Log in',
                command: 'tabstronaut.authenticate'
            };

            // set the icon to the github logo
            item.iconPath = vscode.Uri.file(githubIconPath);
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
                // Here I'm assuming that groupData.id holds the correct id
                // If not, you need to replace it with the correct property
                const group = new Group(groupData.name, groupData.id);
                groupData.tabs.forEach((tabData: any) => {
                    group.addItem(tabData.name);
                });
                return group;
            });

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

            // Fetch groups again after updating
            this.fetchGroups();

        } catch (error) {
            console.error(error);
        }
    }
}
