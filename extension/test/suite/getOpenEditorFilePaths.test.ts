import { strictEqual } from 'assert';
import * as vscode from 'vscode';
import { getOpenEditorFilePaths } from '../../src/fileOperations';

describe('getOpenEditorFilePaths', () => {
  it('returns only file scheme tabs', () => {
    const original = (vscode.window as any).tabGroups;
    (vscode.window as any).tabGroups = {
      all: [
        { tabs: [
            { input: { uri: vscode.Uri.file('/tmp/file1') } },
            { input: { uri: vscode.Uri.parse('untitled:Untitled-1') } },
            { input: {} },
          ] },
      ],
    };

    const result = getOpenEditorFilePaths();

    strictEqual(result.length, 1);
    strictEqual(result[0], '/tmp/file1');

    (vscode.window as any).tabGroups = original;
  });
});
