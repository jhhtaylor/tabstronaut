import { strictEqual, deepStrictEqual } from 'assert';
import * as vscode from 'vscode';
import { gatherFileUris } from '../../src/fileOperations';

describe('fileOperations.gatherFileUris', () => {
  function createFs(structure: Record<string, [string, vscode.FileType][]>) {
    return {
      async stat(uri: vscode.Uri) {
        return {
          type: structure[uri.fsPath]
            ? vscode.FileType.Directory
            : vscode.FileType.File,
          ctime: 0,
          mtime: 0,
          size: 0,
        } as vscode.FileStat;
      },
      async readDirectory(uri: vscode.Uri) {
        return structure[uri.fsPath] || [];
      },
    } as Pick<vscode.FileSystem, 'stat' | 'readDirectory'>;
  }

  it('returns input file uris unchanged', async () => {
    const fileUri = vscode.Uri.file('/tmp/foo.txt');
    const fs = createFs({});
    const result = await gatherFileUris([fileUri], { fs });
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
      '/tmp/dir/sub': [['b.txt', vscode.FileType.File]],
    };
    const fs = createFs(structure);
    const result = await gatherFileUris([dirUri], {
      fs,
      showQuickPick: async () => ({ label: '', value: 'first' } as any),
    });
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
      '/tmp/dir/sub': [['b.txt', vscode.FileType.File]],
    };
    const fs = createFs(structure);
    const result = await gatherFileUris([dirUri], {
      fs,
      showQuickPick: async () => ({ label: '', value: 'recursive' } as any),
    });
    const expected = ['/tmp/dir/a.txt', '/tmp/dir/sub/b.txt'];
    deepStrictEqual(result.map((u) => u.fsPath).sort(), expected.sort());
  });
});
