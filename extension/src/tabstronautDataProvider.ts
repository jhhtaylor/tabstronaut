import * as vscode from "vscode";
import * as path from "path";
import { Group, TabItem } from "./models/Group";
import {
  generateUuidv4,
  generateRelativeTime,
  generateNormalizedPath,
  showConfirmation,
  COLORS,
  labelForFileType,
  labelForTopFolder,
} from "./utils";

export class TabstronautDataProvider
  implements
    vscode.TreeDataProvider<Group | vscode.TreeItem>,
    vscode.TreeDragAndDropController<Group | vscode.TreeItem>
{
  onGroupAutoDeleted?: (group: Group) => void;

  readonly dropMimeTypes = [
    "application/vnd.code.tree.tabstronaut",
    "text/uri-list",
  ];
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
    const uriItem = dataTransfer.get("text/uri-list");
    if (uriItem && target instanceof Group) {
      const uriList = (uriItem.value as string)
        .split(/\r?\n/)
        .map((s) => s.trim())
        .filter((s) => s.length > 0);
      let count = 0;
      for (const uriString of uriList) {
        try {
          const uri = vscode.Uri.parse(uriString);
          if (uri.scheme === "file") {
            await this.addToGroup(target.id, uri.fsPath);
            count++;
          }
        } catch {
          continue;
        }
      }
      if (count > 0) {
        showConfirmation(`Added ${count} file(s) to Tab Group '${target.label}'.`);
      }
      return;
    }

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
        const draggedGroup = this.groupsMap.get(groupId);
        const targetGroup = target instanceof Group ? target : undefined;

        if (!draggedGroup || !targetGroup || draggedGroup.id === targetGroup.id) {
          return;
        }

        const groups = Array.from(this.groupsMap.values());
        const draggedIndex = groups.findIndex((g) => g.id === draggedGroup.id);
        const targetIndex = groups.findIndex((g) => g.id === targetGroup.id);

        if (draggedIndex === -1 || targetIndex === -1) {
          return;
        }

        groups.splice(draggedIndex, 1);
        const insertPos = groups.findIndex((g) => g.id === targetGroup.id);
        const adjustedIndex =
          draggedIndex < targetIndex ? insertPos + 1 : insertPos;
        groups.splice(adjustedIndex, 0, draggedGroup);

        this.groupsMap = new Map(groups.map((g) => [g.id, g]));
        this.refresh();
        await this.updateWorkspaceState();
        showConfirmation(`Reordered Tab Group '${draggedGroup.label}'.`);
      }

      if (id.startsWith("tab:") && target instanceof Group) {
        const tabId = id.replace("tab:", "");
        const sourceGroup = Array.from(this.groupsMap.values()).find((g) =>
          g.items.some((i) => i.id === tabId)
        );

        const tab = sourceGroup?.items.find((i) => i.id === tabId) as
          | TabItem
          | undefined;
        if (!tab || !sourceGroup) {
          return;
        }

        const tabPath = tab.resourceUri?.fsPath || "";
        const normalizedFilePath = generateNormalizedPath(tabPath);
        const existingItem = target.items.find(
          (item) =>
            generateNormalizedPath(item.resourceUri?.fsPath || "") ===
            normalizedFilePath
        );

        if (existingItem) {
          vscode.window.showWarningMessage(
            `${path.basename(tabPath)} is already in this Tab Group.`
          );
          continue;
        }

        const wasLastTab = sourceGroup.items.length === 1;
        let backupGroup: Group | undefined;
        if (wasLastTab) {
          backupGroup = {
            ...sourceGroup,
            items: [...sourceGroup.items],
            createTabItem: sourceGroup.createTabItem.bind(sourceGroup),
            addItem: sourceGroup.addItem.bind(sourceGroup),
            containsFile: sourceGroup.containsFile.bind(sourceGroup),
          };
        }

        sourceGroup.items = sourceGroup.items.filter((i) => i.id !== tabId);

        if (wasLastTab) {
          if (this.onGroupAutoDeleted && backupGroup) {
            this.onGroupAutoDeleted(backupGroup);
          }
          this.groupsMap.delete(sourceGroup.id);
        }

        const newItem = target.createTabItem(tabPath);
        target.items.push(newItem);

        this.refresh();
        await this.updateWorkspaceState();

        showConfirmation(
          `Moved '${tab.label}' to Tab Group '${target.label}'.`
        );
      } else if (id.startsWith("tab:") && target instanceof vscode.TreeItem && target.contextValue === "tab") {
        const tabId = id.replace("tab:", "");
        const sourceGroup = Array.from(this.groupsMap.values()).find((g) =>
          g.items.some((i) => i.id === tabId)
        );
        const draggedTab = sourceGroup?.items.find((i) => i.id === tabId) as
          | TabItem
          | undefined;
        if (!draggedTab || !sourceGroup) {
          return;
        }

        const targetTabId = target.id as string;
        const targetGroup = Array.from(this.groupsMap.values()).find((g) =>
          g.items.some((i) => i.id === targetTabId)
        );
        if (!targetGroup) {
          return;
        }

        const targetIndex = targetGroup.items.findIndex((i) => i.id === targetTabId);

        const draggedPath = draggedTab.resourceUri?.fsPath || "";
        const normalizedDragged = generateNormalizedPath(draggedPath);
        const existingItem = targetGroup.items.find(
          (item) =>
            generateNormalizedPath(item.resourceUri?.fsPath || "") ===
            normalizedDragged
        );

        if (existingItem && targetGroup !== sourceGroup) {
          vscode.window.showWarningMessage(
            `${path.basename(draggedPath)} is already in this Tab Group.`
          );
          continue;
        }

        const wasLastTab = sourceGroup.items.length === 1;
        let backupGroup: Group | undefined;
        if (wasLastTab) {
          backupGroup = {
            ...sourceGroup,
            items: [...sourceGroup.items],
            createTabItem: sourceGroup.createTabItem.bind(sourceGroup),
            addItem: sourceGroup.addItem.bind(sourceGroup),
            containsFile: sourceGroup.containsFile.bind(sourceGroup),
          };
        }

        sourceGroup.items = sourceGroup.items.filter((i) => i.id !== tabId);

        if (wasLastTab) {
          if (this.onGroupAutoDeleted && backupGroup) {
            this.onGroupAutoDeleted(backupGroup);
          }
          this.groupsMap.delete(sourceGroup.id);
        }

        if (targetGroup === sourceGroup) {
          const adjustedIndex = targetIndex;
          targetGroup.items.splice(adjustedIndex, 0, draggedTab);
        } else {
          const newItem = targetGroup.createTabItem(draggedPath);
          targetGroup.items.splice(targetIndex, 0, newItem);
        }

        this.refresh();
        await this.updateWorkspaceState();

        if (targetGroup === sourceGroup) {
          showConfirmation(`Reordered '${draggedTab.label}'.`);
        } else {
          showConfirmation(
            `Moved '${draggedTab.label}' to Tab Group '${targetGroup.label}'.`
          );
        }
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
        generateNormalizedPath(item.resourceUri?.fsPath || "") ===
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
        group.addItem(itemPath.resourceUri?.fsPath as string)
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
      group.items[0].resourceUri?.fsPath === filePath;
  
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
      const backupGroup: Group = {
        ...group,
        items: [...group.items],
        createTabItem: group.createTabItem.bind(group),
        addItem: group.addItem.bind(group),
        containsFile: group.containsFile.bind(group),
      };
      this.onGroupAutoDeleted(backupGroup);
    }
  
    group.items = group.items.filter(
      (item) => item.resourceUri?.fsPath !== filePath
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
        let items = group.items.map((item) => item.resourceUri?.fsPath as string);
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
        const itemPath = item.resourceUri?.fsPath;

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

  async autoGroupFile(filePath: string, mode: "fileType" | "folder"): Promise<void> {
    if (!filePath) {
      return;
    }

    const already = Array.from(this.groupsMap.values()).some((g) =>
      g.containsFile(filePath)
    );
    if (already) {
      return;
    }

    let label: string;
    if (mode === "fileType") {
      label = labelForFileType(filePath);
    } else {
      label = labelForTopFolder(filePath);
    }

    let group = Array.from(this.groupsMap.values()).find(
      (g) => g.label === label
    );
    if (!group) {
      const color = COLORS[this.groupsMap.size % COLORS.length];
      const id = await this.addGroup(label, color, this.groupsMap.size);
      if (!id) {
        return;
      }
      group = this.groupsMap.get(id);
    }

    if (group) {
      await this.addToGroup(group.id, filePath);
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
