import * as vscode from "vscode";
import * as path from "path";
import { Group } from "./models/Group";
import {
  generateUuidv4,
  generateRelativeTime,
  generateNormalizedPath,
  showConfirmation,
  COLORS,
} from "./utils";

export class TabstronautDataProvider
  implements
    vscode.TreeDataProvider<Group | vscode.TreeItem>,
    vscode.TreeDragAndDropController<Group | vscode.TreeItem>
{
  onGroupAutoDeleted?: (group: Group) => void;

  readonly dropMimeTypes = ["application/vnd.code.tree.tabstronaut"];
  readonly dragMimeTypes = ["text/uri-list"];

  private _onDidChangeTreeData: vscode.EventEmitter<
    Group | vscode.TreeItem | undefined | null | void
  > = new vscode.EventEmitter<
    Group | vscode.TreeItem | undefined | null | void
  >();
  readonly onDidChangeTreeData: vscode.Event<
    Group | vscode.TreeItem | undefined | null | void
  > = this._onDidChangeTreeData.event;
  private groupsMap: Map<string, Group> = new Map();
  private refreshIntervalId?: NodeJS.Timeout;

  constructor(private workspaceState: vscode.Memento) {
    const groupData = this.workspaceState.get<{
      [id: string]: {
        label: string;
        items: string[];
        creationTime: string;
        colorName: string;
      };
    }>("tabGroups", {});
    for (const id in groupData) {
      let newGroup = new Group(
        groupData[id].label,
        id,
        new Date(groupData[id].creationTime),
        groupData[id].colorName
      );
      groupData[id].items.forEach((filePath) => newGroup.addItem(filePath));
      this.groupsMap.set(id, newGroup);
    }

    this.refreshIntervalId = setInterval(
      () => this.refreshCreationTimes(),
      300000
    );
  }

  async handleDrag(
    source: (Group | vscode.TreeItem)[],
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    const ids = source.map((item) => {
      return item instanceof Group ? `group:${item.id}` : `tab:${item.id}`;
    });

    dataTransfer.set(
      "application/vnd.code.tree.tabstronaut",
      new vscode.DataTransferItem(ids.join(","))
    );
  }

  async handleDrop(
    target: Group | vscode.TreeItem | undefined,
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    const transferItem = dataTransfer.get(
      "application/vnd.code.tree.tabstronaut"
    );
    if (!transferItem) {
      return;
    }

    const draggedIds = (transferItem.value as string).split(",");

    for (const id of draggedIds) {
      if (id.startsWith("group:")) {
        const groupId = id.replace("group:", "");
        const groupOrder = Array.from(this.groupsMap.keys());
        const draggedGroup = this.groupsMap.get(groupId);
        const targetGroup = target instanceof Group ? target : undefined;

        if (
          !draggedGroup ||
          !targetGroup ||
          draggedGroup.id === targetGroup.id
        ) {
          return;
        }

        this.groupsMap.delete(groupId);
        const reordered = new Map<string, Group>();
        for (const key of groupOrder) {
          if (key === targetGroup.id) {
            reordered.set(draggedGroup.id, draggedGroup);
          }
          if (this.groupsMap.has(key)) {
            reordered.set(key, this.groupsMap.get(key)!);
          }
        }

        this.groupsMap = reordered;
        this.refresh();
        await this.updateWorkspaceState();
      }

      if (id.startsWith("tab:") && target instanceof Group) {
        const tabId = id.replace("tab:", "");
        const sourceGroup = Array.from(this.groupsMap.values()).find((g) =>
          g.items.some((i) => i.id === tabId)
        );

        const tab = sourceGroup?.items.find((i) => i.id === tabId);
        if (!tab || !sourceGroup) {
          return;
        }

        sourceGroup.items = sourceGroup.items.filter((i) => i.id !== tabId);
        target.items.push(tab);

        this.refresh();
        await this.updateWorkspaceState();

        showConfirmation(
          `Moved '${tab.label}' to Tab Group '${target.label}'.`
        );
      }
    }
  }

  private refreshCreationTimes(): void {
    this.groupsMap.forEach((group) => {
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
    const instructionItem = new vscode.TreeItem(
      "Click the '+' icon to create a new Tab Group"
    );
    instructionItem.contextValue = "instruction";
    instructionItem.iconPath = new vscode.ThemeIcon("info");
    return instructionItem;
  }

  getChildren(
    element?: Group | vscode.TreeItem
  ): Thenable<(Group | vscode.TreeItem)[]> {
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

  async addGroup(
    label: string,
    colorName?: string,
    position = 0
  ): Promise<string | undefined> {
    const newGroup = new Group(label, generateUuidv4(), new Date(), colorName);

    const entries = Array.from(this.groupsMap.entries());
    const newGroupsMap = new Map<string, Group>();

    let inserted = false;
    entries.forEach(([id, group], index) => {
      if (!inserted && index === position) {
        newGroupsMap.set(newGroup.id, newGroup);
        inserted = true;
      }
      newGroupsMap.set(id, group);
    });

    if (!inserted) {
      newGroupsMap.set(newGroup.id, newGroup);
    }

    this.groupsMap = newGroupsMap;

    await this.updateWorkspaceState();
    this._onDidChangeTreeData.fire();
    return newGroup.id;
  }

  getGroup(groupName: string): Group | undefined {
    const tabGroups = this.workspaceState.get<{
      [id: string]: {
        label: string;
        items: string[];
        creationTime?: string;
        colorName?: string;
      };
    }>("tabGroups", {});

    for (const id in tabGroups) {
      const g = tabGroups[id];
      if (g.label === groupName) {
        const creationTime = g.creationTime
          ? new Date(g.creationTime)
          : new Date();
        const group = new Group(g.label, id, creationTime, g.colorName);
        g.items.forEach((filePath) => group.addItem(filePath));
        return group;
      }
    }
    return undefined;
  }

  public getGroups(): Group[] {
    const groupData = this.workspaceState.get<{
      [id: string]: {
        label: string;
        items: string[];
        creationTime?: string;
        colorName?: string;
      };
    }>("tabGroups", {});
    const groups: Group[] = [];
    for (const id in groupData) {
      const creationTime = groupData[id].creationTime
        ? new Date(groupData[id].creationTime as string)
        : new Date();
      const group = new Group(
        groupData[id].label,
        id,
        creationTime,
        groupData[id].colorName
      );
      groupData[id].items.forEach((filePath) => group.addItem(filePath));
      groups.push(group);
    }
    return groups;
  }

  async addToGroup(
    groupId: string,
    filePath: string,
    moveGroup = true
  ) {
    const group = this.groupsMap.get(groupId);
    if (!group) {
      return;
    }

    const normalizedFilePath = generateNormalizedPath(filePath);
    const fileName = path.basename(filePath);
    const newItemId = groupId + filePath;

    const existingItem = group.items.find(
      (item) =>
        generateNormalizedPath(item.resourceUri?.path || "") ===
        normalizedFilePath
    );

    let itemPosition: number | null = null;

    if (existingItem) {
      vscode.window.showWarningMessage(
        `${fileName} is already in this Tab Group.`
      );
      if (existingItem.id === newItemId) {
        return;
      } else {
        const existingItemIndex = group.items.findIndex(
          (item) => item.id === existingItem.id
        );
        if (existingItemIndex !== -1) {
          itemPosition = existingItemIndex;
          group.items.splice(existingItemIndex, 1);
        }
      }
    } else {
      const shouldMoveGroup = vscode.workspace
        .getConfiguration("tabstronaut")
        .get("moveTabGroupOnTabChange", true);
      if (shouldMoveGroup && moveGroup) {
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
    if (!group) {
      return;
    }

    this.groupsMap.delete(groupId);
    const newGroupsMap = new Map([
      [groupId, group],
      ...this.groupsMap.entries(),
    ]);
    this.groupsMap = newGroupsMap;

    group.creationTime = new Date();
    group.description = generateRelativeTime(group.creationTime);
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  rebuildAndRefresh(): void {
    this.groupsMap.forEach((group) => {
      const items = [...group.items];
      group.items = [];
      items.forEach((itemPath) =>
        group.addItem(itemPath.resourceUri?.path as string)
      );
    });

    this._onDidChangeTreeData.fire(undefined);
  }

  async renameGroup(
    groupId: string,
    newName: string,
    newColor: string
  ): Promise<void> {
    const group = this.groupsMap.get(groupId);
    if (group) {
      const isNameChanged = group.label !== newName;
      const isColorChanged = group.colorName !== newColor;

      group.label = newName;
      group.colorName = COLORS.includes(newColor) ? newColor : COLORS[0];
      group.iconPath = new vscode.ThemeIcon(
        "circle-filled",
        new vscode.ThemeColor(group.colorName)
      );

      const shouldMoveGroup = vscode.workspace
        .getConfiguration("tabstronaut")
        .get("moveTabGroupOnTabChange", true);
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
    if (!group || !filePath) {
      return;
    }
  
    const shouldConfirm = vscode.workspace
      .getConfiguration("tabstronaut")
      .get("confirmRemoveAndClose", true);
  
    const isLastTab =
      group.items.length === 1 &&
      group.items[0].resourceUri?.path === filePath;
  
    if (isLastTab && shouldConfirm) {
      const shouldDelete: string | undefined = await vscode.window.showQuickPick(
        ["Yes", "No"],
        {
          placeHolder:
            "This is the last Tab in the Tab Group. Removing this Tab will also remove the Tab Group. Proceed?",
        }
      );
  
      if (!shouldDelete || shouldDelete === "No") {
        return;
      }
    }
  
    if (isLastTab && this.onGroupAutoDeleted) {
      const backupGroup = {
        ...group,
        items: [...group.items],
        createTabItem: group.createTabItem.bind(group),
        addItem: group.addItem.bind(group),
      };
      this.onGroupAutoDeleted(backupGroup);
    }
  
    group.items = group.items.filter(
      (item) => item.resourceUri?.path !== filePath
    );
  
    const shouldMoveGroup = vscode.workspace
      .getConfiguration("tabstronaut")
      .get("moveTabGroupOnTabChange", true);
  
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

  public getGroupIndex(groupId: string): number {
    return Array.from(this.groupsMap.keys()).indexOf(groupId);
  }

  public getGroupIdByIndex(index: number): string | undefined {
    return Array.from(this.groupsMap.keys())[index];
  }

  async updateWorkspaceState(): Promise<void> {
    let groupData: {
      [key: string]: {
        label: string;
        items: string[];
        creationTime: string;
        colorName: string;
      };
    } = {};
    this.groupsMap.forEach((group, id) => {
      if (typeof group.label === "string") {
        let items = group.items.map((item) => item.resourceUri?.path as string);
        groupData[id] = {
          label: group.label,
          items: items,
          creationTime: group.creationTime.toISOString(),
          colorName: group.colorName,
        };
      } else {
        vscode.window.showErrorMessage(
          "Invalid Tab Group name. Please try again."
        );
      }
    });
    await this.workspaceState.update("tabGroups", groupData);
    this._onDidChangeTreeData.fire();
  }

  handleFileRename(oldPath: string, newPath: string) {
    const normalizedOldPath = generateNormalizedPath(oldPath);

    let found = false;
    this.groupsMap.forEach((group) => {
      for (let i = 0; i < group.items.length; i++) {
        const item = group.items[i];
        const itemPath = item.resourceUri?.path;

        if (
          itemPath &&
          generateNormalizedPath(itemPath) === normalizedOldPath
        ) {
          item.resourceUri = vscode.Uri.file(newPath);
          item.label = path.basename(newPath);
          item.id = generateUuidv4();

          found = true;
          break;
        }
      }

      if (found) {
        return;
      }
    });

    this.updateWorkspaceState().catch((err) => {});
    this.refresh();
  }

  getGroupByOrder(order: number): Group {
    const allGroups: Group[] = this.getGroups();

    const isDescending = vscode.workspace
      .getConfiguration("tabstronaut")
      .get<boolean>("keybindingOrder", true);

    if (isDescending) {
      return allGroups[order - 1];
    } else {
      return allGroups[allGroups.length - order];
    }
  }

  async exportGroupsToFile(): Promise<void> {
    const defaultPath =
      vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
      require("os").homedir();

    const uri = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file(
        path.join(defaultPath, "tabGroups-export.json")
      ),
      filters: { jsonFiles: ["json"] },
      saveLabel: "Export Tab Groups",
    });

    if (!uri) {
      return;
    }

    const groupData = this.workspaceState.get<{ [id: string]: any }>(
      "tabGroups",
      {}
    );
    const content = JSON.stringify(groupData, null, 2);

    await vscode.workspace.fs.writeFile(uri, Buffer.from(content, "utf8"));
    showConfirmation("Tab Groups exported successfully.");
  }

  async importGroupsFromFile(): Promise<void> {
    const [uri] =
      (await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { jsonFiles: ["json"] },
        openLabel: "Import Tab Groups",
      })) || [];

    if (!uri) {
      return;
    }

    const contentBytes = await vscode.workspace.fs.readFile(uri);
    const content = contentBytes.toString();

    try {
      const importedGroups: { [id: string]: any } = JSON.parse(content);

      const isValid = Object.entries(importedGroups).every(([id, group]) => {
        return (
          typeof id === "string" &&
          typeof group.label === "string" &&
          Array.isArray(group.items) &&
          group.items.every((item: any) => typeof item === "string") &&
          typeof group.creationTime === "string" &&
          typeof group.colorName === "string"
        );
      });

      if (!isValid) {
        vscode.window.showErrorMessage(
          "Invalid JSON structure. Import aborted."
        );
        return;
      }

      const currentGroups = this.workspaceState.get<{ [id: string]: any }>(
        "tabGroups",
        {}
      );
      const mergedGroups = { ...currentGroups, ...importedGroups };

      await this.workspaceState.update("tabGroups", mergedGroups);
      this.rebuildStateFromStorage();
      this.refresh();
      showConfirmation("Tab Groups imported successfully.");
    } catch (error) {
      vscode.window.showErrorMessage(
        "Cannot import Tab Groups. Invalid JSON file."
      );
    }
  }

  private rebuildStateFromStorage(): void {
    this.groupsMap.clear();
    const groupData = this.workspaceState.get<{ [id: string]: any }>(
      "tabGroups",
      {}
    );
    for (const id in groupData) {
      let newGroup = new Group(
        groupData[id].label,
        id,
        new Date(groupData[id].creationTime),
        groupData[id].colorName
      );
      groupData[id].items.forEach((filePath: string) =>
        newGroup.addItem(filePath)
      );
      this.groupsMap.set(id, newGroup);
    }
  }
}
