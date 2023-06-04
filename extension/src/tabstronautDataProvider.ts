import * as vscode from 'vscode';
import { Group } from './models/Group';
import { TokenManager } from "./TokenManager";
import axios from 'axios';

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

    addGroup(label: string) {
        const group = new Group(label);
        this.groups.push(group);
        this._onDidChangeTreeData.fire();
    }

    getGroup(groupName: string): Group | undefined {
        return this.groups.find(g => g.label === groupName);
    }

    public getGroups(): Group[] {
        return this.groups;
    }

    addToGroup(groupName: string, label: string) {
        let group = this.getGroup(groupName);
        if (!group) {
            this.addGroup(groupName);
            group = this.getGroup(groupName);
        }
        group?.addItem(label);
        this._onDidChangeTreeData.fire();
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
            existingItem.label = name ? `Logged in as ${name}` : 'Click me to log in';
            existingItem.tooltip = name ? `Logged in as ${name}` : '';
            existingItem.command = name ? {
                title: 'Logout',
                command: 'tabstronaut.openContextMenu',
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

    private createLoggedInItem(name?: string): vscode.TreeItem {
        if (!name) {
            const item = new vscode.TreeItem('Click me to log in', vscode.TreeItemCollapsibleState.None);
            item.command = {
                title: 'Log in',
                command: 'tabstronaut.authenticate'
            };
            return item;
        }

        const item = new vscode.TreeItem(`Logged in as ${name}`, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('account');
        item.contextValue = 'loggedInUser';
        item.tooltip = `Logged in as ${name}`;
        item.command = {
            title: 'Logout',
            command: 'tabstronaut.openContextMenu',
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
                const group = new Group(groupData.name);
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
}
