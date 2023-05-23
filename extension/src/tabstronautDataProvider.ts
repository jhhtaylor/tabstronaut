import * as vscode from 'vscode';

export class TabstronautDataProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
    private _onDidChangeTreeData: vscode.EventEmitter<vscode.TreeItem | undefined | null | void> = new vscode.EventEmitter<vscode.TreeItem | undefined | null | void>();
    readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined | null | void> = this._onDidChangeTreeData.event;

    private items: vscode.TreeItem[] = [];
    private loggedInUser: string | null = null;

    getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
        return element;
    }

    getChildren(element?: vscode.TreeItem): Thenable<vscode.TreeItem[]> {
        if (!element) {
            // Return the top-level items
            return Promise.resolve(this.items);
        }

        return Promise.resolve([]);
    }

    addItem(label: string) {
        const item = new vscode.TreeItem(label, vscode.TreeItemCollapsibleState.None);
        item.iconPath = new vscode.ThemeIcon('file');
        this.items.push(item);
        this._onDidChangeTreeData.fire();
    }

    addUserItem(name?: string) {
        this.loggedInUser = name !== undefined ? name : null;

        // Update the existing "Logged in as" item if it exists
        const existingItem = this.items.find(item => item.contextValue === 'loggedInUser');

        if (existingItem) {
            existingItem.label = name ? `Logged in as ${name}` : 'Click me to log in';
            existingItem.tooltip = name ? `Logged in as ${name}` : '';
            existingItem.command = name ? {
                title: 'Logout',
                command: 'tabstronaut.openContextMenu',
                arguments: [existingItem] // Pass the item as an argument to the command
            } : {
                title: 'Log in',
                command: 'tabstronaut.authenticate'
            };
        } else {
            // Create a new "Logged in as" or "Click me to log in" item
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
            arguments: [item] // Pass the item as an argument to the command
        };

        return item;
    }

    getLoggedInUser(): string | null {
        return this.loggedInUser;
    }
}
