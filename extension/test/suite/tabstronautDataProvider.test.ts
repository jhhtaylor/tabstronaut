import { strictEqual, ok } from 'assert';
import * as vscode from 'vscode';
import { TabstronautDataProvider } from '../../src/tabstronautDataProvider';

class MockMemento implements vscode.Memento {
  private store: Record<string, any>;
  constructor(initial: Record<string, any> = {}) {
    this.store = initial;
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
