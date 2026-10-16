import * as vscode from "vscode";
import * as path from "path";
import { execFile } from "child_process";
import { existsSync } from "fs";
import { promisify } from "util";
import { Group } from "./models/Group";

const execFileAsync = promisify(execFile);

export function extractRepoNameFromUrl(remoteUrl: string): string | undefined {
  return remoteUrl.trim().match(/[/:]([^/:]+?)(\.git)?\/?$/)?.[1];
}

async function git(cwd: string, ...args: string[]): Promise<string | undefined> {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd });
    return stdout.trim() || undefined;
  } catch {
    return undefined;
  }
}

async function getRepoRoot(uri: vscode.Uri): Promise<string | undefined> {
  let dir = path.dirname(uri.fsPath);
  // A grouped file (or its folder) may have been deleted; git needs a real cwd.
  while (!existsSync(dir) && path.dirname(dir) !== dir) {
    dir = path.dirname(dir);
  }
  const root = await git(dir, "rev-parse", "--show-toplevel");
  // git prints forward slashes on Windows
  return root ? path.normalize(root) : vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath;
}

async function getRepoName(uri: vscode.Uri): Promise<string | undefined> {
  const root = await getRepoRoot(uri);
  if (!root) {
    return undefined;
  }
  const remoteUrl = await git(root, "config", "--get", "remote.origin.url");
  return (remoteUrl && extractRepoNameFromUrl(remoteUrl)) || path.basename(root);
}

function relativePath(uri: vscode.Uri): string {
  return vscode.workspace.asRelativePath(uri, false);
}

const FILE_COPIERS: Record<string, { label: string; get: (uri: vscode.Uri) => string | undefined | Promise<string | undefined> }> = {
  copyPath: {
    label: "path",
    get: (uri) => uri.fsPath,
  },
  copyRelativePath: {
    label: "relative path",
    get: relativePath,
  },
  copyFileName: {
    label: "file name",
    get: (uri) => path.parse(uri.fsPath).name,
  },
  copyFileNameWithExtension: {
    label: "file name",
    get: (uri) => path.basename(uri.fsPath),
  },
  copyAtMention: {
    label: "@ mention",
    get: (uri) => `@${relativePath(uri)}`,
  },
  copyRepoName: {
    label: "repo name",
    get: getRepoName,
  },
  copyRepoPath: {
    label: "repo path",
    get: getRepoRoot,
  },
};

async function copy(text: string, what: string): Promise<void> {
  await vscode.env.clipboard.writeText(text);
  vscode.window.setStatusBarMessage(`Tabstronaut: copied ${what}`, 3000);
}

function collectFileUris(group: Group): vscode.Uri[] {
  return [
    ...group.items.flatMap((i) => (i.resourceUri ? [i.resourceUri] : [])),
    ...group.children.flatMap(collectFileUris),
  ];
}

export function registerCopyCommands(context: vscode.ExtensionContext): void {
  for (const [command, copier] of Object.entries(FILE_COPIERS)) {
    context.subscriptions.push(
      vscode.commands.registerCommand(`tabstronaut.${command}`, async (item?: vscode.TreeItem | vscode.Uri) => {
        const uri =
          (item instanceof vscode.Uri ? item : item?.resourceUri) ??
          vscode.window.activeTextEditor?.document.uri;
        if (uri?.scheme !== "file") {
          vscode.window.showWarningMessage("Tabstronaut: the current editor is not a file on disk.");
          return;
        }
        const text = await copier.get(uri);
        if (!text) {
          vscode.window.showWarningMessage(`Tabstronaut: could not determine ${copier.label}.`);
          return;
        }
        await copy(text, `${copier.label}: ${text}`);
      })
    );
  }

  context.subscriptions.push(
    vscode.commands.registerCommand("tabstronaut.copyGroupFilePaths", async (group?: Group) => {
      if (!Array.isArray(group?.items)) {
        return;
      }
      const paths = collectFileUris(group).map(relativePath);
      if (paths.length === 0) {
        vscode.window.showWarningMessage("Tabstronaut: this Tab Group has no files to copy.");
        return;
      }
      await copy(paths.join("\n"), `${paths.length} file path${paths.length === 1 ? "" : "s"}`);
    })
  );
}
