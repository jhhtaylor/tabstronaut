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
});
