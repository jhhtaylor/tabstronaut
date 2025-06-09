import { strictEqual, ok } from 'assert';
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

describe('TabstronautDataProvider.getGroup', () => {
  it('returns the group matching the given label', () => {
    const tabGroups = {
      '1': {
        label: 'Work',
        items: ['/tmp/file1'],
        creationTime: new Date().toISOString(),
        colorName: 'terminal.ansiRed',
      },
      '2': {
        label: 'Play',
        items: [],
        creationTime: new Date().toISOString(),
        colorName: 'terminal.ansiBlue',
      },
    };
    const memento = new MockMemento({ tabGroups });
    const provider = new TabstronautDataProvider(memento);
    const group = provider.getGroup('Work');
    provider.clearRefreshInterval();
    ok(group, 'Expected group to be defined');
    strictEqual(group?.label, 'Work');
    strictEqual(group?.items.length, 1);
  });
});

describe('TabstronautDataProvider basic operations', () => {
  it('addGroup adds a new group', async () => {
    const memento = new MockMemento({});
    const provider = new TabstronautDataProvider(memento);
    const id = await provider.addGroup('Test');
    provider.clearRefreshInterval();
    const groups = provider.getGroups();
    strictEqual(groups.length, 1);
    strictEqual(groups[0].label, 'Test');
    strictEqual(groups[0].id, id);
  });

  it('addToGroup adds a file to group', async () => {
    const memento = new MockMemento({});
    const provider = new TabstronautDataProvider(memento);
    const id = await provider.addGroup('Test');
    await provider.addToGroup(id!, '/tmp/file1');
    provider.clearRefreshInterval();
    const group = provider.getGroup('Test');
    ok(group);
    strictEqual(group?.items.length, 1);
  });

  it('renameGroup updates name and color', async () => {
    const memento = new MockMemento({});
    const provider = new TabstronautDataProvider(memento);
    const id = await provider.addGroup('Test');
    await provider.renameGroup(id!, 'NewName', 'terminal.ansiBlue');
    provider.clearRefreshInterval();
    const group = provider.getGroup('NewName');
    ok(group);
    strictEqual(group?.label, 'NewName');
    strictEqual(group?.colorName, 'terminal.ansiBlue');
  });

  it('removeFromGroup deletes empty group without confirmation', async () => {
    const config = vscode.workspace.getConfiguration('tabstronaut');
    const original = config.get('confirmRemoveAndClose');
    await config.update('confirmRemoveAndClose', false, true);
    const memento = new MockMemento({});
    const provider = new TabstronautDataProvider(memento);
    const id = await provider.addGroup('Test');
    await provider.addToGroup(id!, '/tmp/file1');
    await provider.removeFromGroup(id!, '/tmp/file1');
    provider.clearRefreshInterval();
    strictEqual(provider.getGroups().length, 0);
    await config.update('confirmRemoveAndClose', original, true);
  });

  it('handleDrop deletes source group when last tab moved', async () => {
    const memento = new MockMemento({});
    const provider = new TabstronautDataProvider(memento);

    const g1 = await provider.addGroup('G1');
    const g2 = await provider.addGroup('G2');
    await provider.addToGroup(g1!, '/tmp/file1');

    const srcGroup = provider.getGroup('G1')!;
    const dstGroup = provider.getGroup('G2')!;
    const tabItem = srcGroup.items[0];

    const dragData = new vscode.DataTransfer();
    await provider.handleDrag([tabItem], dragData, new vscode.CancellationTokenSource().token);
    await provider.handleDrop(dstGroup, dragData, new vscode.CancellationTokenSource().token);

    provider.clearRefreshInterval();
    strictEqual(provider.getGroups().some((g) => g.id === g1), false);
    strictEqual(dstGroup.items.length, 1);
  });
});

describe('TabstronautDataProvider.autoGroupFile', () => {
  it('groups by file type', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    await provider.autoGroupFile('/tmp/foo.ts', 'fileType');
    provider.clearRefreshInterval();
    const group = provider.getGroups()[0];
    strictEqual(group.label, 'TS Files');
    strictEqual(group.items[0].resourceUri?.fsPath, '/tmp/foo.ts');
  });

  it('groups by folder', async () => {
    const orig = (vscode.workspace as any).workspaceFolders;
    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
      value: [
        { uri: vscode.Uri.file('/tmp'), index: 0, name: 'tmp' } as vscode.WorkspaceFolder,
      ],
      configurable: true,
    });

    const provider = new TabstronautDataProvider(new MockMemento({}));
    await provider.autoGroupFile('/tmp/src/foo.ts', 'folder');
    provider.clearRefreshInterval();
    const group = provider.getGroups()[0];
    strictEqual(group.label, 'src');
    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
      value: orig,
      configurable: true,
    });
  });
});
