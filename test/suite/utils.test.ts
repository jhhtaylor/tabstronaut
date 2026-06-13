/// <reference types="mocha" />
import { strictEqual } from 'assert';
import * as vscode from 'vscode';
import { generateNormalizedPath, getTabFilePath, isGroupContextValue, isSessionManaged } from '../../src/utils';

describe('generateNormalizedPath', () => {
  it('converts backslashes to forward slashes and lowercases', () => {
    const result = generateNormalizedPath('C\\Users\\Foo');
    strictEqual(result, 'c/users/foo');
  });

  it('removes trailing slashes', () => {
    const result = generateNormalizedPath('folder/subfolder/');
    strictEqual(result, 'folder/subfolder');
  });

  it('removes leading slashes', () => {
    const result = generateNormalizedPath('/Folder/Subfolder');
    strictEqual(result, 'folder/subfolder');
  });
});

describe('getTabFilePath', () => {
  it('returns the fsPath for a file-backed tab', () => {
    const tab = { input: { uri: vscode.Uri.file('/tmp/a.ts') } } as any;
    strictEqual(getTabFilePath(tab), '/tmp/a.ts');
  });

  it('returns undefined for a tab with no input', () => {
    const tab = {} as any;
    strictEqual(getTabFilePath(tab), undefined);
  });

  it('returns undefined for a non-file URI scheme', () => {
    const tab = { input: { uri: vscode.Uri.parse('untitled:Untitled-1') } } as any;
    strictEqual(getTabFilePath(tab), undefined);
  });
});

describe('isGroupContextValue', () => {
  it('returns true for "group" and "sessionGroup"', () => {
    strictEqual(isGroupContextValue('group'), true);
    strictEqual(isGroupContextValue('sessionGroup'), true);
  });

  it('returns false for other context values', () => {
    strictEqual(isGroupContextValue('sessionColumn'), false);
    strictEqual(isGroupContextValue('tab'), false);
    strictEqual(isGroupContextValue(undefined), false);
  });
});

describe('isSessionManaged', () => {
  it('returns true for a session root group', () => {
    strictEqual(isSessionManaged({ isSession: true, contextValue: 'sessionGroup' }), true);
  });

  it('returns true for a session column', () => {
    strictEqual(isSessionManaged({ contextValue: 'sessionColumn' }), true);
  });

  it('returns false for a regular group', () => {
    strictEqual(isSessionManaged({ isSession: false, contextValue: 'group' }), false);
  });
});
