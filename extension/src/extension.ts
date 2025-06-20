import * as vscode from "vscode";
import * as path from "path";
import { TabstronautDataProvider } from "./tabstronautDataProvider";
import { UngroupedProvider } from "./ungroupedProvider";
import { Group } from "./models/Group";
import { showConfirmation } from "./utils";
import { handleOpenTab, openFileSmart } from "./fileOperations";
import {
  handleTabGroupAction,
  renameTabGroupCommand,
  addAllOpenTabsToGroup,
  addFilesToGroupCommand,
  sortTabGroupCommand,
} from "./groupOperations";

let treeDataProvider: TabstronautDataProvider;

export function activate(context: vscode.ExtensionContext) {

  const config = vscode.workspace.getConfiguration("tabstronaut");
  config.get("addPaths");
  config.get("keybindingOrder");
  config.get("confirmRemoveAndClose");
  config.get("moveTabGroupOnTabChange");
  config.get("autoCloseOnRestore");
  config.get("showConfirmationMessages");

  treeDataProvider = new TabstronautDataProvider(context.workspaceState);

  vscode.window.tabGroups.onDidChangeTabs(() => {
    treeDataProvider.refreshUngroupedTabs();
  });

  treeDataProvider.onGroupAutoDeleted = (group: Group) => {
    const index = treeDataProvider.getGroupIndex(group.id);
    const prevId = treeDataProvider.getGroupIdByIndex(index - 1);
    recentlyDeletedGroup = {
      ...group,
      index,
      previousGroupId: prevId,
      createTabItem: group.createTabItem.bind(group),
      addItem: group.addItem.bind(group),
      containsFile: group.containsFile.bind(group),
    };

    vscode.commands.executeCommand(
      "setContext",
      "tabstronaut:canUndoDelete",
      true
    );

    if (undoTimeout) {
      clearTimeout(undoTimeout);
    }

    undoTimeout = setTimeout(() => {
      recentlyDeletedGroup = null;
      treeDataProvider.refresh();

      vscode.commands.executeCommand(
        "setContext",
        "tabstronaut:canUndoDelete",
        false
      );
    }, 5000);
  };

  const treeView = vscode.window.createTreeView("tabstronaut", {
    treeDataProvider: treeDataProvider,
    showCollapseAll: false,
    dragAndDropController: treeDataProvider,
  });

  const ungroupedProvider = new UngroupedProvider(treeDataProvider);
  vscode.window.createTreeView("tabstronautUngrouped", {
    treeDataProvider: ungroupedProvider,
    showCollapseAll: false,
    dragAndDropController: treeDataProvider,
  });

  let recentlyDeletedGroup:
    | (Group & { index: number; previousGroupId?: string })
    | null = null;
  let undoTimeout: NodeJS.Timeout | undefined;
  let recentlyClosedEditors: string[] | null = null;
  let undoCloseTimeout: NodeJS.Timeout | undefined;

  function getOpenEditorFilePaths(): string[] {
    const allTabs = vscode.window.tabGroups.all.flatMap((g) => g.tabs);
    const paths: string[] = [];
    for (const tab of allTabs) {
      const input = (tab as any).input;
      if (input && typeof input === "object" && "uri" in input) {
        const uri = input.uri;
        if (uri instanceof vscode.Uri && uri.scheme === "file") {
          paths.push(uri.fsPath);
        }
      }
    }
    return paths;
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("tabstronaut.collapseAll", async () => {
      const firstGroup = treeDataProvider.getFirstGroup();
      if (!firstGroup) {
        return;
      }

      await treeView.reveal(firstGroup, {
        select: false,
        focus: true,
        expand: false,
      });
      vscode.commands.executeCommand("list.collapseAll");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "tabstronaut.confirmCloseAllEditors",
      async () => {
        const shouldConfirm = vscode.workspace
          .getConfiguration("tabstronaut")
          .get("confirmRemoveAndClose", true);

        if (shouldConfirm) {
          let shouldClose: string | undefined =
            await vscode.window.showQuickPick(["Yes", "No"], {
              placeHolder:
                "Are you sure you want to close all open editor tabs?",
            });

          if (!shouldClose || shouldClose === "No") {
            return;
          }
        }

        recentlyClosedEditors = getOpenEditorFilePaths();
        vscode.commands.executeCommand(
          "setContext",
          "tabstronaut:canUndoClose",
          true
        );

        if (undoCloseTimeout) {
          clearTimeout(undoCloseTimeout);
        }

        undoCloseTimeout = setTimeout(() => {
          recentlyClosedEditors = null;
          vscode.commands.executeCommand(
            "setContext",
            "tabstronaut:canUndoClose",
            false
          );
        }, 5000);

        vscode.commands.executeCommand("workbench.action.closeAllEditors");
      }
    )
  );


  context.subscriptions.push(
    vscode.commands.registerCommand(
      "tabstronaut.openTabGroupContextMenu",
      async () => {
        const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;

        if (
          !activeTab?.input ||
          typeof activeTab.input !== "object" ||
          !("uri" in activeTab.input)
        ) {
          vscode.window.showWarningMessage(
            "Add to Tab Group is only available when an editor tab is active."
          );
          return;
        }

        let filePath: string | undefined;
        if (
          activeTab.input &&
          "uri" in activeTab.input &&
          activeTab.input.uri instanceof vscode.Uri
        ) {
          filePath = activeTab.input.uri.fsPath;
        } else {
          vscode.window.showWarningMessage(
            "No valid file URI found for the selected tab."
          );
          return;
        }
        if (filePath) {
          await handleTabGroupAction(treeDataProvider, filePath);
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "tabstronaut.openTabGroupContextMenuFromEditorTabRightClick",
      async (contextSelection: vscode.Uri) => {
        const INVALID_TAB_MESSAGE = `Cannot add this selection to a Tab Group. Please ensure you select a valid source code file tab.`;
        const filePath = contextSelection.fsPath;

        try {
          const document = await vscode.workspace.openTextDocument(
            contextSelection
          );

          if (document.uri.scheme !== "file") {
            vscode.window.showWarningMessage(INVALID_TAB_MESSAGE);
            return;
          }
        } catch (error) {
          vscode.window.showWarningMessage(INVALID_TAB_MESSAGE);
          return;
        }

        await handleTabGroupAction(treeDataProvider, filePath);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "tabstronaut.addAllToNewGroup",
      async (groupId: string) => {
        const allTabs = vscode.window.tabGroups.all.flatMap(
          (group) => group.tabs
        );

        const addedFiles = new Set<string>();

        for (const tab of allTabs) {
          if (
            !tab.input ||
            typeof tab.input !== "object" ||
            !("uri" in tab.input)
          ) {
            continue;
          }

          const uri = tab.input.uri;
          if (!(uri instanceof vscode.Uri) || uri.scheme !== "file") {
            continue;
          }

          const filePath = uri.fsPath;
          if (!addedFiles.has(filePath)) {
            await treeDataProvider.addToGroup(groupId, filePath);
            addedFiles.add(filePath);
          }
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "tabstronaut.restoreAllTabsInGroup",
      async (item: any) => {
        if (item.contextValue !== "group") {
          return;
        }
        const group: Group = item;

        const autoClose = vscode.workspace
          .getConfiguration("tabstronaut")
          .get<boolean>("autoCloseOnRestore", false);
        if (autoClose) {
          recentlyClosedEditors = getOpenEditorFilePaths();
          vscode.commands.executeCommand(
            "setContext",
            "tabstronaut:canUndoClose",
            true
          );

          if (undoCloseTimeout) {
            clearTimeout(undoCloseTimeout);
          }

          undoCloseTimeout = setTimeout(() => {
            recentlyClosedEditors = null;
            vscode.commands.executeCommand(
              "setContext",
              "tabstronaut:canUndoClose",
              false
            );
          }, 5000);

          await vscode.commands.executeCommand(
            "workbench.action.closeAllEditors"
          );
        }

        for (const tabItem of group.items) {
          const filePath = tabItem.resourceUri?.fsPath;
          if (filePath) {
            try {
              await openFileSmart(filePath);
            } catch {
              vscode.window.showErrorMessage(
                `Cannot open '${path.basename(
                  filePath
                )}'. Please check if the file exists and try again.`
              );
            }
          }
        }
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "tabstronaut.restoreTabsByGroupNumber",
      async (groupNumber: number) => {
        const group: Group = treeDataProvider.getGroupByOrder(groupNumber);
        if (!group || group.contextValue !== "group") {
          return;
        }

        const autoClose = vscode.workspace
          .getConfiguration("tabstronaut")
          .get<boolean>("autoCloseOnRestore", false);
        if (autoClose) {
          recentlyClosedEditors = getOpenEditorFilePaths();
          vscode.commands.executeCommand(
            "setContext",
            "tabstronaut:canUndoClose",
            true
          );

          if (undoCloseTimeout) {
            clearTimeout(undoCloseTimeout);
          }

          undoCloseTimeout = setTimeout(() => {
            recentlyClosedEditors = null;
            vscode.commands.executeCommand(
              "setContext",
              "tabstronaut:canUndoClose",
              false
            );
          }, 5000);

          await vscode.commands.executeCommand(
            "workbench.action.closeAllEditors"
          );
        }

        for (const tabItem of group.items) {
          const filePath = tabItem.resourceUri?.fsPath;
          if (filePath) {
            try {
              await openFileSmart(filePath);
            } catch {
              vscode.window.showErrorMessage(
                `Cannot open '${path.basename(
                  filePath
                )}'. Please check if the file exists and try again.`
              );
            }
          }
        }
      }
    )
  );


  context.subscriptions.push(
    vscode.commands.registerCommand(
      "tabstronaut.editTabGroup",
      (item: any) => renameTabGroupCommand(treeDataProvider, item)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "tabstronaut.sortTabGroup",
      (item: any) => sortTabGroupCommand(treeDataProvider, item)
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "tabstronaut.removeTabGroup",
      async (item: any) => {
        if (item.contextValue !== "group") {
          return;
        }
        const group: Group = item;

        const shouldConfirm = vscode.workspace
          .getConfiguration("tabstronaut")
          .get("confirmRemoveAndClose", true);

        if (shouldConfirm) {
          let shouldDelete: string | undefined =
            await vscode.window.showQuickPick(["Yes", "No"], {
              placeHolder: "Are you sure you want to remove this Tab Group?",
            });

          if (!shouldDelete || shouldDelete === "No") {
            return;
          }
        }

        const index = treeDataProvider.getGroupIndex(group.id);
        const prevId = treeDataProvider.getGroupIdByIndex(index - 1);
        recentlyDeletedGroup = {
          ...group,
          index,
          previousGroupId: prevId,
          createTabItem: group.createTabItem.bind(group),
          addItem: group.addItem.bind(group),
          containsFile: group.containsFile.bind(group),
        };
        treeDataProvider.deleteGroup(group.id);

        vscode.commands.executeCommand(
          "setContext",
          "tabstronaut:canUndoDelete",
          true
        );

        if (undoTimeout) {
          clearTimeout(undoTimeout);
        }
        undoTimeout = setTimeout(() => {
          recentlyDeletedGroup = null;
          treeDataProvider.refresh();

          vscode.commands.executeCommand(
            "setContext",
            "tabstronaut:canUndoDelete",
            false
          );
        }, 5000);

        treeDataProvider.refresh();
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "tabstronaut.previewSpecificTab",
      async (item: any) => {
        handleOpenTab(item, true);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "tabstronaut.restoreSpecificTab",
      async (item: any) => {
        handleOpenTab(item, false);
      }
    )
  );


  context.subscriptions.push(
    vscode.commands.registerCommand(
      "tabstronaut.removeSpecificTab",
      async (item: any) => {
        if (item.contextValue !== "tab") {
          return;
        }

        treeDataProvider.removeFromGroup(item.groupId, item.resourceUri?.fsPath);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "tabstronaut.addCurrentTabToGroup",
      async (group: Group) => {
        const activeTab = vscode.window.tabGroups.activeTabGroup?.activeTab;

        if (
          !activeTab?.input ||
          typeof activeTab.input !== "object" ||
          !("uri" in activeTab.input)
        ) {
          vscode.window.showWarningMessage(
            "No supported file tab selected to add to Tab Group."
          );
          return;
        }

        const uri = activeTab.input.uri;
        if (!(uri instanceof vscode.Uri)) {
          vscode.window.showWarningMessage(
            "No valid file URI found for the selected tab."
          );
          return;
        }

        const filePath = uri.fsPath;
        await treeDataProvider.addToGroup(group.id, filePath);

        showConfirmation(`Added 1 file to Tab Group '${group.label}'.`);
      }
    )
  );

  vscode.workspace.onDidChangeConfiguration((e) => {
    if (e.affectsConfiguration("tabstronaut.addPaths")) {
      treeDataProvider.rebuildAndRefresh();
      vscode.window.showInformationMessage(
        "Tabstronaut paths setting updated."
      );
    }
    if (e.affectsConfiguration("tabstronaut.keybindingOrder")) {
      vscode.window.showInformationMessage(
        "Tabstronaut key binding order setting updated."
      );
    }
    if (e.affectsConfiguration("tabstronaut.confirmRemoveAndClose")) {
      vscode.window.showInformationMessage(
        "Tabstronaut show confirmation setting updated."
      );
    }
    if (e.affectsConfiguration("tabstronaut.moveTabGroupOnTabChange")) {
      vscode.window.showInformationMessage(
        "Tabstronaut move Tab Group on Tab add, edit or remove setting updated."
      );
    }
    if (e.affectsConfiguration("tabstronaut.autoCloseOnRestore")) {
      vscode.window.showInformationMessage(
        "Tabstronaut auto-close setting updated."
      );
    }
    if (e.affectsConfiguration("tabstronaut.showConfirmationMessages")) {
      vscode.window.showInformationMessage(
        "Tabstronaut confirmation message setting updated."
      );
    }
  });

  vscode.workspace.onDidRenameFiles((event) => {
    for (const file of event.files) {
      treeDataProvider.handleFileRename(file.oldUri.fsPath, file.newUri.fsPath);
    }
  });

  vscode.commands.registerCommand("tabstronaut.showMoreOptions", async () => {
    const picked = await vscode.window.showQuickPick(
      [
        "Export Tab Groups",
        "Import Tab Groups",
        "Get Started",
        "Settings",
        "Feedback",
        "Support",
      ],
      { placeHolder: "Select an option" }
    );

    switch (picked) {
      case "Export Tab Groups":
        await treeDataProvider.exportGroupsToFile();
        break;
      case "Import Tab Groups":
        await treeDataProvider.importGroupsFromFile();
        break;
      case "Get Started":
        await vscode.commands.executeCommand(
          "extension.open",
          "jhhtaylor.tabstronaut"
        );
        break;
      case "Settings":
        await vscode.commands.executeCommand(
          "workbench.action.openSettings",
          "@ext:jhhtaylor.tabstronaut"
        );
        break;
      case "Feedback":
        await vscode.env.openExternal(
          vscode.Uri.parse("https://github.com/jhhtaylor/tabstronaut/issues")
        );
        break;
      case "Support":
        await vscode.env.openExternal(
          vscode.Uri.parse("https://www.buymeacoffee.com/jhhtaylor")
        );
        break;
    }
  });

  context.subscriptions.push(
    vscode.commands.registerCommand("tabstronaut.exportTabGroups", async () => {
      await treeDataProvider.exportGroupsToFile();
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("tabstronaut.importTabGroups", async () => {
      await treeDataProvider.importGroupsFromFile();
    })
  );


  context.subscriptions.push(
    vscode.commands.registerCommand(
      "tabstronaut.addAllOpenTabsToGroup",
      async (item: any) => {
        if (item.contextValue !== "group") {
          return;
        }
        const group: Group = item;
        await addAllOpenTabsToGroup(treeDataProvider, group);
      }
    )
  );

  context.subscriptions.push(
    vscode.commands.registerCommand(
      "tabstronaut.addFilesToGroup",
      async (uri: vscode.Uri, uris?: vscode.Uri[]) => {
        const allUris = uris && uris.length > 1 ? uris : [uri];
        await addFilesToGroupCommand(treeDataProvider, allUris);
      }
    )
  );



  context.subscriptions.push(
    vscode.commands.registerCommand("tabstronaut.undoDelete", async () => {
      if (!recentlyDeletedGroup) {
        return;
      }

      let insertIndex = recentlyDeletedGroup.index;
      if (recentlyDeletedGroup.previousGroupId) {
        const prevIdx = treeDataProvider.getGroupIndex(
          recentlyDeletedGroup.previousGroupId
        );
        if (prevIdx !== -1) {
          insertIndex = prevIdx + 1;
        }
      }

      const restored = await treeDataProvider.addGroup(
        recentlyDeletedGroup.label as string,
        recentlyDeletedGroup.colorName,
        insertIndex
      );

      if (!restored) {
        vscode.window.showErrorMessage("Cannot restore Tab Group.");
        return;
      }

      for (const tab of recentlyDeletedGroup.items) {
        const uri = tab.resourceUri;
        if (uri) {
          await treeDataProvider.addToGroup(restored, uri.fsPath, false);
        }
      }

      recentlyDeletedGroup = null;
      if (undoTimeout) {
        clearTimeout(undoTimeout);
      }

      vscode.commands.executeCommand(
        "setContext",
        "tabstronaut:canUndoDelete",
        false
      );

      treeDataProvider.refresh();
      showConfirmation("Tab Group restored.");
    })
  );

  context.subscriptions.push(
    vscode.commands.registerCommand("tabstronaut.undoCloseEditors", async () => {
      if (!recentlyClosedEditors) {
        return;
      }

      for (const filePath of recentlyClosedEditors) {
        await openFileSmart(filePath);
      }

      recentlyClosedEditors = null;
      if (undoCloseTimeout) {
        clearTimeout(undoCloseTimeout);
      }

      vscode.commands.executeCommand(
        "setContext",
        "tabstronaut:canUndoClose",
        false
      );

      showConfirmation("Restored closed tabs.");
    })
  );
}

export function deactivate() {
  treeDataProvider.clearRefreshInterval();
}
