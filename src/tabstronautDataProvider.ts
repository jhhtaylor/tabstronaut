import * as vscode from "vscode";
import * as path from "path";
import { Group, TabItem } from "./models/Group";
import {
  generateUuidv4,
  generateRelativeTime,
  generateNormalizedPath,
  showConfirmation,
  COLORS,
  labelForTopFolder,
} from "./utils";

interface GroupStorageData {
  label: string;
  items: string[];
  children?: { [id: string]: GroupStorageData };
  creationTime: string;
  colorName: string;
}

export class TabstronautDataProvider
  implements
    vscode.TreeDataProvider<Group | vscode.TreeItem>,
    vscode.TreeDragAndDropController<Group | vscode.TreeItem>
{
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
  private ungroupedGroup: Group;
  private groupFilter?: string;

  constructor(private workspaceState: vscode.Memento) {
    const groupData = this.workspaceState.get<{
      [id: string]: GroupStorageData;
    }>("tabGroups", {});
    for (const id in groupData) {
      const group = this.deserializeGroup(id, groupData[id]);
      this.groupsMap.set(id, group);
    }

    this.ungroupedGroup = new Group("Ungrouped Tabs", "ungrouped", new Date(), undefined, true);
    this.ungroupedGroup.contextValue = "ungrouped";
    this.ungroupedGroup.description = "";
    this.refreshUngroupedTabs();

    this.refreshIntervalId = setInterval(
      () => this.refreshCreationTimes(),
      300000
    );

    vscode.commands.executeCommand(
      "setContext",
      "tabstronaut:hasGroupFilter",
      false
    );
  }

  private deserializeGroup(id: string, data: GroupStorageData, parentId?: string): Group {
    const group = new Group(
      data.label,
      id,
      new Date(data.creationTime),
      data.colorName
    );
    group.parentId = parentId;
    data.items.forEach((filePath) => group.addItem(filePath));

    const childrenData = data.children || {};
    for (const childId in childrenData) {
      const childGroup = this.deserializeGroup(childId, childrenData[childId], id);
      group.children.push(childGroup);
    }

    return group;
  }

  private serializeGroup(group: Group): GroupStorageData | undefined {
    if (typeof group.label !== "string") {
      vscode.window.showErrorMessage(
        "Invalid Tab Group name. Please try again."
      );
      return undefined;
    }
    const children: { [id: string]: GroupStorageData } = {};
    for (const child of group.children) {
      const childData = this.serializeGroup(child);
      if (childData) {
        children[child.id] = childData;
      }
    }
    return {
      label: group.label,
      items: group.items.map((item) => item.resourceUri?.fsPath as string),
      children,
      creationTime: group.creationTime.toISOString(),
      colorName: group.colorName,
    };
  }

  public findGroupById(id: string): Group | undefined {
    for (const group of this.groupsMap.values()) {
      const found = this.findInTree(group, id);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  private findInTree(group: Group, id: string): Group | undefined {
    if (group.id === id) {
      return group;
    }
    for (const child of group.children) {
      const found = this.findInTree(child, id);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  public findParentGroup(childId: string): Group | undefined {
    for (const group of this.groupsMap.values()) {
      const found = this.findParentInTree(group, childId);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  private findParentInTree(group: Group, childId: string): Group | undefined {
    for (const child of group.children) {
      if (child.id === childId) {
        return group;
      }
      const found = this.findParentInTree(child, childId);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  private findSourceGroupForTab(tabId: string): Group | undefined {
    for (const group of this.groupsMap.values()) {
      const found = this.findSourceGroupForTabInTree(group, tabId);
      if (found) {
        return found;
      }
    }
    // Also check ungrouped
    if (this.ungroupedGroup.items.some((i) => i.id === tabId)) {
      return this.ungroupedGroup;
    }
    return undefined;
  }

  private findSourceGroupForTabInTree(group: Group, tabId: string): Group | undefined {
    if (group.items.some((i) => i.id === tabId)) {
      return group;
    }
    for (const child of group.children) {
      const found = this.findSourceGroupForTabInTree(child, tabId);
      if (found) {
        return found;
      }
    }
    return undefined;
  }

  private getAllGroupsFlat(): Group[] {
    const result: Group[] = [];
    for (const group of this.groupsMap.values()) {
      this.collectGroupsFlat(group, result);
    }
    return result;
  }

  private collectGroupsFlat(group: Group, result: Group[]): void {
    result.push(group);
    for (const child of group.children) {
      this.collectGroupsFlat(child, result);
    }
  }

  private removeGroupFromTree(groupId: string): boolean {
    // Check if it's a root group
    if (this.groupsMap.has(groupId)) {
      this.groupsMap.delete(groupId);
      return true;
    }
    // Check nested groups
    for (const group of this.groupsMap.values()) {
      if (this.removeFromChildren(group, groupId)) {
        return true;
      }
    }
    return false;
  }

  private removeFromChildren(parent: Group, childId: string): boolean {
    const index = parent.children.findIndex((c) => c.id === childId);
    if (index !== -1) {
      parent.children.splice(index, 1);
      return true;
    }
    for (const child of parent.children) {
      if (this.removeFromChildren(child, childId)) {
        return true;
      }
    }
    return false;
  }

  async handleDrag(
    source: (Group | vscode.TreeItem)[],
    dataTransfer: vscode.DataTransfer,
    token: vscode.CancellationToken
  ): Promise<void> {
    const ids = source
      .filter((item) => !(item instanceof Group && item.isPinned))
      .map((item) => {
        return item instanceof Group ? `group:${item.id}` : `tab:${item.id}`;
      });

    dataTransfer.set(
      "application/vnd.code.tree.tabstronaut",
      new vscode.DataTransferItem(JSON.stringify(ids))
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

    let draggedIds: string[] = [];
    const raw = transferItem.value as string;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        draggedIds = parsed as string[];
      } else {
        draggedIds = raw.split(",");
      }
    } catch {
      draggedIds = raw.split(",");
    }

    for (const id of draggedIds) {
      if (id.startsWith("group:")) {
        const groupId = id.replace("group:", "");
        const draggedGroup = this.findGroupById(groupId);
        if (!draggedGroup || draggedGroup.isPinned) {
          return;
        }

        // Determine if dropped on a group, a tab, or empty space
        const isDropOnGroup = target instanceof Group;
        const isDropOnTab =
          target instanceof vscode.TreeItem &&
          target.contextValue === "tab";

        if (!isDropOnGroup && !isDropOnTab) {
          // Drop on empty space: promote to root level
          if (!draggedGroup.parentId) {
            return;
          }
          this.removeGroupFromTree(draggedGroup.id);
          draggedGroup.parentId = undefined;
          this.groupsMap.set(draggedGroup.id, draggedGroup);
          this.refresh();
          await this.updateWorkspaceState();
          showConfirmation(`Moved '${draggedGroup.label}' to top level.`);
          return;
        }

        if (isDropOnTab) {
          // Drop on a tab: nest inside that tab's parent group
          const targetTabId = target!.id as string;
          const nestTarget = this.findSourceGroupForTab(targetTabId);
          if (!nestTarget || nestTarget.isPinned) {
            return;
          }
          if (draggedGroup.id === nestTarget.id) {
            return;
          }
          // Prevent nesting a group inside itself or its descendants
          if (this.findInTree(draggedGroup, nestTarget.id)) {
            return;
          }
          this.removeGroupFromTree(draggedGroup.id);
          draggedGroup.parentId = nestTarget.id;
          nestTarget.children.push(draggedGroup);
          this.refresh();
          await this.updateWorkspaceState();
          showConfirmation(
            `Moved '${draggedGroup.label}' into '${nestTarget.label}'.`
          );
          return;
        }

        // Drop on a group: reorder (place next to target at the same level)
        const targetGroup = target as Group;

        if (
          draggedGroup.id === targetGroup.id ||
          targetGroup.isPinned
        ) {
          return;
        }

        // Prevent nesting a group inside itself or its descendants
        if (this.findInTree(draggedGroup, targetGroup.id)) {
          return;
        }

        // Remove from current location
        this.removeGroupFromTree(draggedGroup.id);

        // Insert at the same level as the target group, next to it
        const targetParentId = targetGroup.parentId;
        const siblings = targetParentId
          ? this.findGroupById(targetParentId)?.children
          : Array.from(this.groupsMap.values());

        if (!siblings) {
          return;
        }

        const targetIndex = siblings.findIndex(
          (g) => g.id === targetGroup.id
        );
        if (targetIndex === -1) {
          return;
        }

        draggedGroup.parentId = targetParentId;
        siblings.splice(targetIndex + 1, 0, draggedGroup);

        if (!targetParentId) {
          this.groupsMap = new Map(siblings.map((g) => [g.id, g]));
        }
        this.refresh();
        await this.updateWorkspaceState();
        showConfirmation(`Reordered Tab Group '${draggedGroup.label}'.`);
      }

      if (id.startsWith("tab:") && target instanceof Group) {
        const tabId = id.replace("tab:", "");
        const sourceGroup = this.findSourceGroupForTab(tabId);

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

        sourceGroup.items = sourceGroup.items.filter((i) => i.id !== tabId);

        if (!(target instanceof Group && target.isPinned)) {
          const newItem = target.createTabItem(tabPath);
          target.items.push(newItem);
        }

        this.refreshUngroupedTabs();
        await this.updateWorkspaceState();

        if (!(target instanceof Group && target.isPinned)) {
          showConfirmation(
            `Moved '${tab.label}' to Tab Group '${target.label}'.`
          );
        } else {
          showConfirmation(`Removed '${tab.label}' from Tab Group.`);
        }
      } else if (
        id.startsWith("tab:") &&
        (!target ||
          (target instanceof vscode.TreeItem &&
            target.contextValue === "instruction"))
      ) {
        const tabId = id.replace("tab:", "");
        const sourceGroup = this.findSourceGroupForTab(tabId);
        const tab = sourceGroup?.items.find((i) => i.id === tabId) as
          | TabItem
          | undefined;
        if (!tab || !sourceGroup) {
          return;
        }

        const tabPath = tab.resourceUri?.fsPath || "";
        const initialCount = this.groupsMap.size;
        const newName = `Group ${initialCount + 1}`;
        const newColor = COLORS[initialCount % COLORS.length];

        sourceGroup.items = sourceGroup.items.filter((i) => i.id !== tabId);

        const newGroupId = await this.addGroup(newName, newColor);
        if (!newGroupId) {
          return;
        }
        const newGroup = this.groupsMap.get(newGroupId)!;
        const newItem = newGroup.createTabItem(tabPath);
        newGroup.items.push(newItem);

        this.refreshUngroupedTabs();
        await this.updateWorkspaceState();

        showConfirmation(`Created '${newName}' and added 1 file.`);
      } else if (
        id.startsWith("tab:") &&
        target instanceof vscode.TreeItem &&
        target.contextValue === "tab"
      ) {
        const tabId = id.replace("tab:", "");
        const sourceGroup = this.findSourceGroupForTab(tabId);
        const draggedTab = sourceGroup?.items.find((i) => i.id === tabId) as
          | TabItem
          | undefined;
        if (!draggedTab || !sourceGroup) {
          return;
        }

        const targetTabId = target.id as string;
        const targetGroup = this.findSourceGroupForTab(targetTabId);
        if (!targetGroup) {
          return;
        }

        const targetIndex = targetGroup.items.findIndex((i) => i.id === targetTabId);

        const draggedPath = draggedTab.resourceUri?.fsPath || "";
        const normalizedDragged = generateNormalizedPath(draggedPath);
        let existingItem: TabItem | undefined;
        if (!targetGroup.isPinned) {
          existingItem = targetGroup.items.find(
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
        }

        sourceGroup.items = sourceGroup.items.filter((i) => i.id !== tabId);

        if (targetGroup === sourceGroup) {
          const adjustedIndex = targetIndex;
          targetGroup.items.splice(adjustedIndex, 0, draggedTab);
        } else if (!targetGroup.isPinned) {
          const newItem = targetGroup.createTabItem(draggedPath);
          targetGroup.items.splice(targetIndex, 0, newItem);
        }

        this.refreshUngroupedTabs();
        await this.updateWorkspaceState();

        if (targetGroup === sourceGroup) {
          showConfirmation(`Reordered tab '${draggedTab.label}'.`);
        } else if (!targetGroup.isPinned) {
          showConfirmation(
            `Moved '${draggedTab.label}' to Tab Group '${targetGroup.label}'.`
          );
        } else {
          showConfirmation(`Removed '${draggedTab.label}' from Tab Group.`);
        }
      }
    }
  }

  private refreshCreationTimes(): void {
    const allGroups = this.getAllGroupsFlat();
    for (const group of allGroups) {
      group.description = generateRelativeTime(group.creationTime);
    }
    this.refresh();
  }

  public refreshUngroupedTabs(): void {
    const allTabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
    const seen = new Set<string>();
    const ungrouped: string[] = [];

    for (const tab of allTabs) {
      if (!tab.input || typeof tab.input !== "object" || !("uri" in tab.input)) {
        continue;
      }
      const uri = (tab.input as any).uri as vscode.Uri;
      if (!(uri instanceof vscode.Uri) || uri.scheme !== "file") {
        continue;
      }
      const filePath = uri.fsPath;
      const normalized = generateNormalizedPath(filePath);
      if (seen.has(normalized)) {
        continue;
      }
      seen.add(normalized);
      const inGroup = Array.from(this.groupsMap.values()).some((g) =>
        g.containsFileRecursive(filePath)
      );
      if (!inGroup) {
        ungrouped.push(filePath);
      }
    }

    this.ungroupedGroup.items = ungrouped.map((p) =>
      this.ungroupedGroup.createTabItem(p)
    );
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

  private createNoMatchItem(): vscode.TreeItem {
    const noMatchItem = new vscode.TreeItem(
      "No Tab Groups match the current filter"
    );
    noMatchItem.contextValue = "instruction";
    noMatchItem.iconPath = new vscode.ThemeIcon("warning");
    return noMatchItem;
  }

  public setGroupFilter(filter: string | undefined): void {
    this.groupFilter = filter;
    vscode.commands.executeCommand(
      "setContext",
      "tabstronaut:hasGroupFilter",
      !!filter
    );
    this._onDidChangeTreeData.fire();
  }

  public getGroupFilter(): string | undefined {
    return this.groupFilter;
  }

  getChildren(
    element?: Group | vscode.TreeItem
  ): Thenable<(Group | vscode.TreeItem)[]> {
    if (element instanceof Group) {
      return Promise.resolve([...element.children, ...element.items]);
    }

    let groups = Array.from(this.groupsMap.values());
    if (this.groupFilter) {
      const filter = this.groupFilter.toLowerCase();
      groups = groups.filter(
        (g) =>
          typeof g.label === "string" &&
          g.label.toLowerCase().includes(filter)
      );
    }
    const result: (Group | vscode.TreeItem)[] = [];
    if (groups.length === 0) {
      result.push(
        this.groupFilter ? this.createNoMatchItem() : this.createInstructionItem()
      );
    } else {
      result.push(...groups);
    }
    return Promise.resolve(result);
  }

  public getUngroupedItems(): vscode.TreeItem[] {
    return this.ungroupedGroup.items;
  }

  getParent(element: Group | vscode.TreeItem): vscode.ProviderResult<Group> {
    if (element instanceof Group && element.parentId) {
      return this.findGroupById(element.parentId) || null;
    }
    if (element instanceof TabItem && element.groupId) {
      return this.findGroupById(element.groupId) || null;
    }
    return null;
  }

  async addGroup(
    label: string,
    colorName?: string,
    position?: number
  ): Promise<string | undefined> {
    const newGroup = new Group(label, generateUuidv4(), new Date(), colorName);

    const entries = Array.from(this.groupsMap.entries());
    const newGroupsMap = new Map<string, Group>();

    if (position === undefined) {
      const setting = vscode.workspace
        .getConfiguration("tabstronaut")
        .get<"top" | "bottom">("newTabGroupPosition", "bottom");
      position = setting === "top" ? 0 : entries.length;
    }

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

  async addSubGroup(
    parentGroupId: string,
    label: string,
    colorName?: string
  ): Promise<string | undefined> {
    const parentGroup = this.findGroupById(parentGroupId);
    if (!parentGroup) {
      return undefined;
    }

    const newGroup = new Group(label, generateUuidv4(), new Date(), colorName);
    newGroup.parentId = parentGroupId;
    parentGroup.children.push(newGroup);

    await this.updateWorkspaceState();
    this._onDidChangeTreeData.fire();
    return newGroup.id;
  }

  getGroup(groupName: string): Group | undefined {
    const allGroups = this.getAllGroupsFlat();
    return allGroups.find(
      (g) => typeof g.label === "string" && g.label === groupName
    );
  }

  public getGroups(): Group[] {
    return this.getAllGroupsFlat();
  }

  public getRootGroups(): Group[] {
    return Array.from(this.groupsMap.values());
  }

  async addToGroup(
    groupId: string,
    filePath: string,
    moveGroup = true
  ) {
    const group = this.findGroupById(groupId);
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
      if (shouldMoveGroup && moveGroup && !group.parentId) {
        this.moveGroupToTopAndUpdateTimestamp(groupId);
      }
    }

    const newItem = group.createTabItem(filePath);
    if (itemPosition !== null) {
      group.items.splice(itemPosition, 0, newItem);
    } else {
      group.items.push(newItem);
    }

    // Remove the file from ancestor groups (move, not copy within hierarchy)
    this.removeFileFromAncestors(group, normalizedFilePath);

    await this.updateWorkspaceState();
    this.refreshUngroupedTabs();
    this._onDidChangeTreeData.fire();
  }

  private removeFileFromAncestors(group: Group, normalizedFilePath: string): void {
    let ancestorId = group.parentId;
    while (ancestorId) {
      const ancestor = this.findGroupById(ancestorId);
      if (!ancestor) {
        break;
      }
      ancestor.items = ancestor.items.filter(
        (item) =>
          generateNormalizedPath(item.resourceUri?.fsPath || "") !== normalizedFilePath
      );
      ancestorId = ancestor.parentId;
    }
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
    const rebuildGroup = (group: Group) => {
      const items = [...group.items];
      group.items = [];
      items.forEach((itemPath) =>
        group.addItem(itemPath.resourceUri?.fsPath as string)
      );
      for (const child of group.children) {
        rebuildGroup(child);
      }
    };

    this.groupsMap.forEach((group) => {
      rebuildGroup(group);
    });

    this.refreshUngroupedTabs();
    this._onDidChangeTreeData.fire(undefined);
  }

  async renameGroup(
    groupId: string,
    newName: string,
    newColor: string
  ): Promise<void> {
    const group = this.findGroupById(groupId);
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
      if (shouldMoveGroup && (isNameChanged || isColorChanged) && !group.parentId) {
        this.moveGroupToTopAndUpdateTimestamp(groupId);
      }

      await this.updateWorkspaceState();
      this._onDidChangeTreeData.fire();
    }
  }

  async deleteGroup(groupId: string): Promise<void> {
    const group = this.findGroupById(groupId);
    if (!group) {
      return;
    }
    this.removeGroupFromTree(groupId);
    await this.updateWorkspaceState();
    this.refreshUngroupedTabs();
    this._onDidChangeTreeData.fire();
  }

  async removeFromGroup(
    groupId: string,
    filePath: string,
    options?: { skipConfirmation?: boolean }
  ): Promise<void> {
    const group = this.findGroupById(groupId);
    if (!group || !filePath) {
      return;
    }

    group.items = group.items.filter(
      (item) => item.resourceUri?.fsPath !== filePath
    );

    const shouldMoveGroup = vscode.workspace
      .getConfiguration("tabstronaut")
      .get("moveTabGroupOnTabChange", true);

    if (shouldMoveGroup && !group.parentId && (group.items.length > 0 || group.children.length > 0)) {
      this.moveGroupToTopAndUpdateTimestamp(groupId);
    }

    await this.updateWorkspaceState();
    this._onDidChangeTreeData.fire();
  }

  public getFirstGroup(): Group | undefined {
    return Array.from(this.groupsMap.values())[0];
  }

  async removeFileFromAllGroups(
    filePath: string,
    options?: { skipConfirmation?: boolean }
  ): Promise<void> {
    if (!filePath) {
      return;
    }

    const allGroups = this.getAllGroupsFlat();
    const groupsWithFile = allGroups.filter((group) =>
      group.containsFile(filePath)
    );

    for (const group of groupsWithFile) {
      await this.removeFromGroup(group.id, filePath, options);
    }
  }

  public getGroupIndex(groupId: string): number {
    return Array.from(this.groupsMap.keys()).indexOf(groupId);
  }

  public getGroupIdByIndex(index: number): string | undefined {
    return Array.from(this.groupsMap.keys())[index];
  }

  async updateWorkspaceState(): Promise<void> {
    const groupData: { [key: string]: GroupStorageData } = {};
    this.groupsMap.forEach((group, id) => {
      const data = this.serializeGroup(group);
      if (data) {
        groupData[id] = data;
      }
    });
    await this.workspaceState.update("tabGroups", groupData);
    this.refreshUngroupedTabs();
    this._onDidChangeTreeData.fire();
  }

  handleFileRename(oldPath: string, newPath: string) {
    const normalizedOldPath = generateNormalizedPath(oldPath);

    const renameInGroup = (group: Group): boolean => {
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
          return true;
        }
      }
      for (const child of group.children) {
        if (renameInGroup(child)) {
          return true;
        }
      }
      return false;
    };

    for (const group of this.groupsMap.values()) {
      if (renameInGroup(group)) {
        break;
      }
    }

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

  private getImportExportDirectory(): string {
    const configuredPath = vscode.workspace
      .getConfiguration("tabstronaut")
      .get<string>("importExportDirectory", "")
      .trim();

    if (configuredPath === "") {
      // No configuration - use workspace root or home directory
      return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath ||
        require("os").homedir();
    }

    // Check if path is absolute
    if (path.isAbsolute(configuredPath)) {
      return configuredPath;
    }

    // Relative path - resolve relative to workspace root
    const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
    if (workspaceRoot) {
      return path.resolve(workspaceRoot, configuredPath);
    }

    // No workspace - treat as absolute from home directory
    return path.resolve(require("os").homedir(), configuredPath);
  }

  async exportGroupsToFile(): Promise<void> {
    const defaultPath = this.getImportExportDirectory();

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
    const defaultPath = this.getImportExportDirectory();

    const [uri] =
      (await vscode.window.showOpenDialog({
        canSelectMany: false,
        filters: { jsonFiles: ["json"] },
        openLabel: "Import Tab Groups",
        defaultUri: vscode.Uri.file(defaultPath),
      })) || [];

    if (!uri) {
      return;
    }

    const contentBytes = await vscode.workspace.fs.readFile(uri);
    const content = contentBytes.toString();

    try {
      const importedGroups: { [id: string]: any } = JSON.parse(content);

      const isValid = this.validateImportData(importedGroups);

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

  private validateImportData(data: { [id: string]: any }): boolean {
    return Object.entries(data).every(([id, group]) => {
      if (
        typeof id !== "string" ||
        typeof group.label !== "string" ||
        !Array.isArray(group.items) ||
        !group.items.every((item: any) => typeof item === "string") ||
        typeof group.creationTime !== "string" ||
        typeof group.colorName !== "string"
      ) {
        return false;
      }
      // Validate children recursively if present
      if (group.children && typeof group.children === "object") {
        return this.validateImportData(group.children);
      }
      return true;
    });
  }

  async sortGroup(
    groupId: string,
    mode: "folder" | "fileType" | "alphabetical"
  ): Promise<void> {
    const group = this.findGroupById(groupId);
    if (!group) {
      return;
    }

    const getKey = (filePath: string): string => {
      if (mode === "fileType") {
        return path.extname(filePath).toLowerCase();
      }
      if (mode === "alphabetical") {
        return path.basename(filePath).toLowerCase();
      }
      return labelForTopFolder(filePath).toLowerCase();
    };

    group.items.sort((a, b) => {
      const aPath = a.resourceUri?.fsPath || "";
      const bPath = b.resourceUri?.fsPath || "";
      const keyA = getKey(aPath);
      const keyB = getKey(bPath);
      if (keyA === keyB) {
        return aPath.localeCompare(bPath);
      }
      return keyA.localeCompare(keyB);
    });

    await this.updateWorkspaceState();
    this._onDidChangeTreeData.fire(group);
  }


  async sortRootGroups(mode: 'name-asc' | 'name-desc' | 'time-asc' | 'time-desc'): Promise<void> {
    const entries = Array.from(this.groupsMap.entries());
    entries.sort(([, a], [, b]) => {
      switch (mode) {
        case 'name-asc':  return (a.label as string).localeCompare(b.label as string);
        case 'name-desc': return (b.label as string).localeCompare(a.label as string);
        case 'time-asc':  return a.creationTime.getTime() - b.creationTime.getTime();
        case 'time-desc': return b.creationTime.getTime() - a.creationTime.getTime();
      }
    });
    this.groupsMap = new Map(entries);
    await this.updateWorkspaceState();
  }

  private rebuildStateFromStorage(): void {
    this.groupsMap.clear();
    const groupData = this.workspaceState.get<{
      [id: string]: GroupStorageData;
    }>("tabGroups", {});
    for (const id in groupData) {
      const group = this.deserializeGroup(id, groupData[id]);
      this.groupsMap.set(id, group);
    }
  }
}
