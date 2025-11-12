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
    if (await revealExistingTab(uri)) {
      return;
    }

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

export async function openFileSmart(
  filePath: string,
  options?: { preserveFocus?: boolean }
): Promise<void> {
  const uri = vscode.Uri.file(filePath);
  try {
    if (await revealExistingTab(uri, options)) {
      return;
    }

    if (filePath.endsWith('.ipynb')) {
      await vscode.commands.executeCommand(
        'vscode.openWith',
        uri,
        'jupyter-notebook'
      );
    } else {
      const document = await vscode.workspace.openTextDocument(uri);
      await vscode.window.showTextDocument(document, {
        preview: false,
        preserveFocus: options?.preserveFocus,
      });
    }
  } catch {
    vscode.window.showErrorMessage(
      `Cannot open '${path.basename(filePath)}'. Please check if the file exists and try again.`
    );
  }
}

async function revealExistingTab(
  uri: vscode.Uri,
  options?: { preserveFocus?: boolean }
): Promise<boolean> {
  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = (tab as any).input;
      if (!input || typeof input !== 'object' || !('uri' in input)) {
        continue;
      }
      const tabUri = (input as any).uri;
      if (tabUri instanceof vscode.Uri && tabUri.fsPath === uri.fsPath) {
        const isNotebook = uri.fsPath.endsWith('.ipynb');
        if (isNotebook) {
          await vscode.commands.executeCommand(
            'vscode.openWith',
            uri,
            'jupyter-notebook'
          );
        } else {
          const document = await vscode.workspace.openTextDocument(uri);
          await vscode.window.showTextDocument(document, {
            viewColumn: group.viewColumn,
            preview: false,
            preserveFocus: options?.preserveFocus,
          });
        }
        return true;
      }
    }
  }
  return false;
}

export async function collectFilesRecursively(
  uri: vscode.Uri,
  fs: Pick<vscode.FileSystem, 'readDirectory'> = vscode.workspace.fs
): Promise<vscode.Uri[]> {
  const collected: vscode.Uri[] = [];
  const entries = await fs.readDirectory(uri);
  for (const [name, type] of entries) {
    const entryUri = vscode.Uri.joinPath(uri, name);
    if (type === vscode.FileType.File) {
      collected.push(entryUri);
    } else if (type === vscode.FileType.Directory) {
      const subFiles = await collectFilesRecursively(entryUri, fs);
      collected.push(...subFiles);
    }
  }
  return collected;
}

export async function collectFilesFirstLevel(
  uri: vscode.Uri,
  fs: Pick<vscode.FileSystem, 'readDirectory'> = vscode.workspace.fs
): Promise<vscode.Uri[]> {
  const collected: vscode.Uri[] = [];
  const entries = await fs.readDirectory(uri);
  for (const [name, type] of entries) {
    if (type === vscode.FileType.File) {
      collected.push(vscode.Uri.joinPath(uri, name));
    }
  }
  return collected;
}
export async function gatherFileUris(
  uris: vscode.Uri[],
  {
    fs = vscode.workspace.fs,
    showQuickPick = vscode.window.showQuickPick,
  }: {
    fs?: Pick<vscode.FileSystem, 'stat' | 'readDirectory'>;
    showQuickPick?: typeof vscode.window.showQuickPick;
  } = {}
): Promise<vscode.Uri[]> {
  const fileUris: vscode.Uri[] = [];

  for (const u of uris) {
    try {
      const stat = await fs.stat(u);
      if (stat.type === vscode.FileType.File) {
        fileUris.push(u);
      } else if (stat.type === vscode.FileType.Directory) {
        const hasSubFolders = (await fs.readDirectory(u)).some(
          ([, type]) => type === vscode.FileType.Directory
        );
        let collected: vscode.Uri[] = [];

        if (hasSubFolders) {
          const choice = await showQuickPick(
            [
              { label: 'Add first-level files only', value: 'first' },
              { label: 'Add all files recursively', value: 'recursive' },
            ],
            { placeHolder: 'Select how to add files from the folder' }
          );

          if (!choice) {
            continue;
          }

          if (choice.value === 'first') {
            collected = await collectFilesFirstLevel(u, fs);
          } else {
            collected = await collectFilesRecursively(u, fs);
          }
        } else {
          collected = await collectFilesFirstLevel(u, fs);
        }

        fileUris.push(...collected);
      }
    } catch (err) {
      console.warn(`Skipping invalid URI: ${u.fsPath}`, err);
    }
  }

  return fileUris;
}
