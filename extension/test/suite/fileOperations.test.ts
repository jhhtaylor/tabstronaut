import { strictEqual, deepStrictEqual } from 'assert';
import * as vscode from 'vscode';
import {
  gatherFileUris,
  collectFilesFirstLevel,
  collectFilesRecursively,
} from '../../src/fileOperations';

describe('fileOperations.gatherFileUris', () => {
  const originalStat = vscode.workspace.fs.stat;
  const originalReadDir = vscode.workspace.fs.readDirectory;
  const originalQuickPick = vscode.window.showQuickPick;

  afterEach(() => {
    vscode.workspace.fs.stat = originalStat;
    vscode.workspace.fs.readDirectory = originalReadDir;
    vscode.window.showQuickPick = originalQuickPick;
  });

  it('returns input file uris unchanged', async () => {
    const fileUri = vscode.Uri.file('/tmp/foo.txt');
    vscode.workspace.fs.stat = async () => ({
      type: vscode.FileType.File,
      ctime: 0,
      mtime: 0,
      size: 0,
    });
    const result = await gatherFileUris([fileUri]);
    strictEqual(result.length, 1);
    strictEqual(result[0].fsPath, fileUri.fsPath);
  });

  it('collects first level files when chosen', async () => {
    const dirUri = vscode.Uri.file('/tmp/dir');
    const structure: Record<string, [string, vscode.FileType][]> = {
      '/tmp/dir': [
        ['a.txt', vscode.FileType.File],
        ['sub', vscode.FileType.Directory],
      ],
      '/tmp/dir/sub': [
        ['b.txt', vscode.FileType.File],
      ],
    };
    vscode.workspace.fs.stat = async (uri: vscode.Uri) => ({
      type: structure[uri.fsPath] ? vscode.FileType.Directory : vscode.FileType.File,
      ctime: 0,
      mtime: 0,
      size: 0,
    });
    vscode.workspace.fs.readDirectory = async (uri: vscode.Uri) => structure[uri.fsPath] || [];
    vscode.window.showQuickPick = async () => ({ label: '', value: 'first' } as any);

    const result = await gatherFileUris([dirUri]);
    strictEqual(result.length, 1);
    strictEqual(result[0].fsPath, '/tmp/dir/a.txt');
  });

  it('collects files recursively when chosen', async () => {
    const dirUri = vscode.Uri.file('/tmp/dir');
    const structure: Record<string, [string, vscode.FileType][]> = {
      '/tmp/dir': [
        ['a.txt', vscode.FileType.File],
        ['sub', vscode.FileType.Directory],
      ],
      '/tmp/dir/sub': [
        ['b.txt', vscode.FileType.File],
      ],
    };
    vscode.workspace.fs.stat = async (uri: vscode.Uri) => ({
      type: structure[uri.fsPath] ? vscode.FileType.Directory : vscode.FileType.File,
      ctime: 0,
      mtime: 0,
      size: 0,
    });
    vscode.workspace.fs.readDirectory = async (uri: vscode.Uri) => structure[uri.fsPath] || [];
    vscode.window.showQuickPick = async () => ({ label: '', value: 'recursive' } as any);

    const result = await gatherFileUris([dirUri]);
    const expected = ['/tmp/dir/a.txt', '/tmp/dir/sub/b.txt'];
    deepStrictEqual(result.map((u) => u.fsPath).sort(), expected.sort());
  });
});
