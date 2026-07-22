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

describe('TabstronautDataProvider handleDrop tab move between groups', () => {
  // VS Code auto-populates "text/uri-list" for any dragged TreeItem that has a
  // resourceUri (every tab does) in addition to our own custom mime type, even
  // when the drag starts and ends inside this same tree. Both entries must be
  // set here to faithfully reproduce a real in-tree drag.
  function internalTabDragData(tabId: string, filePath: string): vscode.DataTransfer {
    const dragData = new vscode.DataTransfer();
    dragData.set(
      'application/vnd.code.tree.tabstronaut',
      new vscode.DataTransferItem(`tab:${tabId}`)
    );
    dragData.set(
      'text/uri-list',
      new vscode.DataTransferItem(vscode.Uri.file(filePath).toString())
    );
    return dragData;
  }

  it('moves (not copies) a tab when dropped on another group header', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1Id = await provider.addGroup('G1');
    const g2Id = await provider.addGroup('G2');
    await provider.addToGroup(g1Id!, '/tmp/file1');
    const g1 = provider.getGroup('G1')!;
    const g2 = provider.getGroup('G2')!;
    const tabId = g1.items[0].id!;

    const dragData = internalTabDragData(tabId, '/tmp/file1');
    await provider.handleDrop(g2, dragData, new vscode.CancellationTokenSource().token);
    provider.clearRefreshInterval();

    strictEqual(provider.getGroup('G1')!.items.length, 0, 'source group should be empty');
    strictEqual(provider.getGroup('G2')!.items.length, 1, 'target group should have the tab');
  });

  it('moves (not copies) a tab when dropped onto a specific tab in the target group', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1Id = await provider.addGroup('G1');
    const g2Id = await provider.addGroup('G2');
    await provider.addToGroup(g1Id!, '/tmp/file1');
    await provider.addToGroup(g2Id!, '/tmp/file2');
    const g1 = provider.getGroup('G1')!;
    const g2 = provider.getGroup('G2')!;
    const tabId = g1.items[0].id!;
    const targetTab = g2.items[0];

    const dragData = internalTabDragData(tabId, '/tmp/file1');
    await provider.handleDrop(targetTab, dragData, new vscode.CancellationTokenSource().token);
    provider.clearRefreshInterval();

    strictEqual(provider.getGroup('G1')!.items.length, 0, 'source group should be empty');
    strictEqual(provider.getGroup('G2')!.items.length, 2, 'target group should have both tabs');
  });
});

describe('TabstronautDataProvider handleDrop new group on empty space', () => {
  it('creates new group with defaults when dropping tab to empty area', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const groupId = await provider.addGroup('G1');
    await provider.addToGroup(groupId!, '/tmp/file1');
    const group = provider.getGroup('G1')!;
    const tabId = group.items[0].id;

    const dragData = new vscode.DataTransfer();
    dragData.set(
      'application/vnd.code.tree.tabstronaut',
      new vscode.DataTransferItem(`tab:${tabId}`)
    );

    await provider.handleDrop(undefined, dragData, new vscode.CancellationTokenSource().token);
    provider.clearRefreshInterval();

    const groups = provider.getGroups();
    strictEqual(groups.length, 2, 'Original group should persist, new group created');
    const newGroup = groups.find((g) => g.label === 'Group 2')!;
    strictEqual(newGroup.items.length, 1);
    strictEqual(newGroup.items[0].resourceUri?.fsPath, '/tmp/file1');
    const oldGroup = groups.find((g) => g.label === 'G1')!;
    strictEqual(oldGroup.items.length, 0, 'Original group should be empty');
  });
});
