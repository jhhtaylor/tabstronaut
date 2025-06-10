import * as vscode from 'vscode';
import * as path from 'path';

export async function handleOpenTab(item: any, fromButton: boolean) {
  if (item.contextValue !== 'tab') {
    return;
  }
  const uri = item.resourceUri;
  if (!uri) {
    return;
  }
  try {
    const isNotebook = uri.fsPath.endsWith('.ipynb');
    if (isNotebook) {
      await vscode.commands.executeCommand(
        'vscode.openWith',
        uri,
        'jupyter-notebook'
      );
    } else {
      const currentEditor = vscode.window.activeTextEditor;
      const isCurrentActiveTab = currentEditor?.document.uri.fsPath === uri.fsPath;
      const preview = !isCurrentActiveTab && fromButton;
      const doc = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(doc, { preview });
    }
  } catch {
    vscode.window.showErrorMessage(`Cannot open '${path.basename(uri.fsPath)}'.`);
  }
}

export async function openFileSmart(filePath: string): Promise<void> {
  const uri = vscode.Uri.file(filePath);
  try {
    if (filePath.endsWith('.ipynb')) {
      await vscode.commands.executeCommand(
        'vscode.openWith',
        uri,
        'jupyter-notebook'
      );
    } else {
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document, { preview: false });
    }
  } catch {
    vscode.window.showErrorMessage(
      `Cannot open '${path.basename(filePath)}'. Please check if the file exists and try again.`
    );
  }
}

