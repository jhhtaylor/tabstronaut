import { strictEqual } from 'assert';
import * as vscode from 'vscode';
import { TabstronautDataProvider } from '../../src/tabstronautDataProvider';

class MockMemento implements vscode.Memento {
  private store: Record<string, any>;
  constructor(initial: Record<string, any> = {}) {
    this.store = initial;
  }
  keys(): readonly string[] {
    throw new Error('Method not implemented.');
  }
  get<T>(key: string, defaultValue?: T): T {
    if (key in this.store) {
      return this.store[key] as T;
    }
    return defaultValue as T;
  }
  update(key: string, value: any): Thenable<void> {
    this.store[key] = value;
    return Promise.resolve();
  }
}

describe('TabstronautDataProvider handleDrop text/uri-list', () => {
  it('adds file from uri list to group', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const groupId = await provider.addGroup('G1', undefined, 0);
    let group = provider.getGroup('G1')!;

    const dragData = new vscode.DataTransfer();
    const uri = vscode.Uri.file('/tmp/file1');
    dragData.set('text/uri-list', new vscode.DataTransferItem(uri.toString()));

    await provider.handleDrop(group, dragData, new vscode.CancellationTokenSource().token);
    group = provider.getGroup('G1')!;
    provider.clearRefreshInterval();

    strictEqual(group.items.length, 1);
    strictEqual(group.items[0].resourceUri?.fsPath, '/tmp/file1');
  });

  it('does not add duplicate file from uri list', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const groupId = await provider.addGroup('G1', undefined, 0);
    let group = provider.getGroup('G1')!;

    const dragData = new vscode.DataTransfer();
    const uri = vscode.Uri.file('/tmp/file1');
    dragData.set('text/uri-list', new vscode.DataTransferItem(uri.toString()));

    const token = new vscode.CancellationTokenSource().token;
    await provider.handleDrop(group, dragData, token);
    await provider.handleDrop(group, dragData, token);
    group = provider.getGroup('G1')!;
    provider.clearRefreshInterval();

    strictEqual(group.items.length, 1);
  });

  it('adds file from uri list to specific position', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const groupId = await provider.addGroup('G1', undefined, 0);
    await provider.addToGroup(groupId!, '/tmp/a.txt');
    await provider.addToGroup(groupId!, '/tmp/b.txt');
    const group = provider.getGroup('G1')!;
    const targetTab = group.items[1];

    const dragData = new vscode.DataTransfer();
    const uri = vscode.Uri.file('/tmp/c.txt');
    dragData.set('text/uri-list', new vscode.DataTransferItem(uri.toString()));

    await provider.handleDrop(targetTab, dragData, new vscode.CancellationTokenSource().token);

    provider.clearRefreshInterval();
    const updated = provider.getGroup('G1')!;
    strictEqual(updated.items.length, 3);
    strictEqual(updated.items[1].resourceUri?.fsPath, '/tmp/c.txt');
  });
});

describe('TabstronautDataProvider addToGroup duplicate handling', () => {
  it('prevents adding same file twice', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const groupId = await provider.addGroup('G1', undefined, 0);
    await provider.addToGroup(groupId!, '/tmp/file1');
    await provider.addToGroup(groupId!, '/tmp/file1');
    provider.clearRefreshInterval();

    const group = provider.getGroup('G1');
    strictEqual(group?.items.length, 1);
  });
});

describe('TabstronautDataProvider handleDrop new group on empty space', () => {
  it('creates new group with defaults when dropping tab to empty area', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const groupId = await provider.addGroup('G1');
    const group = provider.getGroup('G1')!;
    await provider.addToGroup(groupId!, '/tmp/file1');
    const tabId = group.items[0].id;

    const dragData = new vscode.DataTransfer();
    dragData.set(
      'application/vnd.code.tree.tabstronaut',
      new vscode.DataTransferItem(`tab:${tabId}`)
    );

    await provider.handleDrop(undefined, dragData, new vscode.CancellationTokenSource().token);
    provider.clearRefreshInterval();

    const groups = provider.getGroups();
    strictEqual(groups.length, 1);
    strictEqual(groups[0].label, 'Group 2');
    strictEqual(groups[0].items.length, 1);
    strictEqual(groups[0].items[0].resourceUri?.fsPath, '/tmp/file1');
  });
});
