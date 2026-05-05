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

async function makeProvider(names: string[]): Promise<TabstronautDataProvider> {
  const provider = new TabstronautDataProvider(new MockMemento({}));
  for (const name of names) {
    await provider.addGroup(name);
  }
  return provider;
}

describe('TabstronautDataProvider.sortRootGroups', () => {
  it('sorts groups A → Z by name', async () => {
    const provider = await makeProvider(['Zebra', 'Apple', 'Mango']);
    await provider.sortRootGroups('name-asc');
    provider.clearRefreshInterval();
    const labels = provider.getRootGroups().map((g) => g.label as string);
    strictEqual(labels[0], 'Apple');
    strictEqual(labels[1], 'Mango');
    strictEqual(labels[2], 'Zebra');
  });

  it('sorts groups Z → A by name', async () => {
    const provider = await makeProvider(['Apple', 'Zebra', 'Mango']);
    await provider.sortRootGroups('name-desc');
    provider.clearRefreshInterval();
    const labels = provider.getRootGroups().map((g) => g.label as string);
    strictEqual(labels[0], 'Zebra');
    strictEqual(labels[1], 'Mango');
    strictEqual(labels[2], 'Apple');
  });

  it('sorts groups by last active, oldest first', async () => {
    const tabGroups = {
      'a': { label: 'New', items: [], creationTime: new Date('2024-06-01').toISOString(), colorName: 'terminal.ansiRed' },
      'b': { label: 'Old', items: [], creationTime: new Date('2023-01-01').toISOString(), colorName: 'terminal.ansiBlue' },
      'c': { label: 'Mid', items: [], creationTime: new Date('2023-06-01').toISOString(), colorName: 'terminal.ansiGreen' },
    };
    const provider = new TabstronautDataProvider(new MockMemento({ tabGroups }));
    await provider.sortRootGroups('time-asc');
    provider.clearRefreshInterval();
    const labels = provider.getRootGroups().map((g) => g.label as string);
    strictEqual(labels[0], 'Old');
    strictEqual(labels[1], 'Mid');
    strictEqual(labels[2], 'New');
  });

  it('sorts groups by last active, newest first', async () => {
    const tabGroups = {
      'a': { label: 'Old', items: [], creationTime: new Date('2023-01-01').toISOString(), colorName: 'terminal.ansiRed' },
      'b': { label: 'New', items: [], creationTime: new Date('2024-06-01').toISOString(), colorName: 'terminal.ansiBlue' },
      'c': { label: 'Mid', items: [], creationTime: new Date('2023-06-01').toISOString(), colorName: 'terminal.ansiGreen' },
    };
    const provider = new TabstronautDataProvider(new MockMemento({ tabGroups }));
    await provider.sortRootGroups('time-desc');
    provider.clearRefreshInterval();
    const labels = provider.getRootGroups().map((g) => g.label as string);
    strictEqual(labels[0], 'New');
    strictEqual(labels[1], 'Mid');
    strictEqual(labels[2], 'Old');
  });

  it('persists sort order after serialization round-trip', async () => {
    const memento = new MockMemento({});
    const provider = new TabstronautDataProvider(memento);
    await provider.addGroup('Zebra');
    await provider.addGroup('Apple');
    await provider.addGroup('Mango');
    await provider.sortRootGroups('name-asc');
    provider.clearRefreshInterval();

    const provider2 = new TabstronautDataProvider(memento);
    provider2.clearRefreshInterval();
    const labels = provider2.getRootGroups().map((g) => g.label as string);
    strictEqual(labels[0], 'Apple');
    strictEqual(labels[1], 'Mango');
    strictEqual(labels[2], 'Zebra');
  });

  it('does not sort child groups, only root level', async () => {
    const provider = await makeProvider(['Beta', 'Alpha']);
    const alphaId = provider.getGroup('Alpha')!.id;
    await provider.addSubGroup(alphaId, 'ZChild');
    await provider.addSubGroup(alphaId, 'AChild');

    await provider.sortRootGroups('name-asc');
    provider.clearRefreshInterval();

    const roots = provider.getRootGroups();
    strictEqual(roots[0].label, 'Alpha');
    strictEqual(roots[1].label, 'Beta');

    // Child order is unaffected
    const alpha = provider.getGroup('Alpha')!;
    strictEqual(alpha.children[0].label as string, 'ZChild');
    strictEqual(alpha.children[1].label as string, 'AChild');
  });
});
