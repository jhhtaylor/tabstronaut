import * as vscode from "vscode";
import { TabstronautDataProvider } from "./tabstronautDataProvider";

export class UngroupedProvider implements vscode.TreeDataProvider<vscode.TreeItem> {
  constructor(private mainProvider: TabstronautDataProvider) {}

  readonly onDidChangeTreeData: vscode.Event<vscode.TreeItem | undefined> =
    this.mainProvider.onDidChangeTreeData;

  getTreeItem(element: vscode.TreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(): vscode.ProviderResult<vscode.TreeItem[]> {
    return Promise.resolve(this.mainProvider.getUngroupedItems());
  }
}
