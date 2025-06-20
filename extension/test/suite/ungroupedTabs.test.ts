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

describe('TabstronautDataProvider.refreshUngroupedTabs', () => {
  let origTabGroups: any;

  beforeEach(() => {
    origTabGroups = vscode.window.tabGroups;
  });

  afterEach(() => {
    Object.defineProperty(vscode.window, 'tabGroups', { value: origTabGroups, configurable: true });
  });

  it('collects open tabs not in groups', () => {
    const uri1 = vscode.Uri.file('/tmp/a.txt');
    const uri2 = vscode.Uri.file('/tmp/b.txt');
    const tab1 = { input: { uri: uri1 } } as any;
    const tab2 = { input: { uri: uri2 } } as any;

    Object.defineProperty(vscode.window, 'tabGroups', {
      value: { all: [{ tabs: [tab1, tab2] }] },
      configurable: true,
    });

    const provider = new TabstronautDataProvider(new MockMemento({}));
    provider.clearRefreshInterval();

    const items = provider.getUngroupedItems();
    strictEqual(items.length, 2);
    strictEqual(items[0].resourceUri?.fsPath, '/tmp/a.txt');
    strictEqual(items[1].resourceUri?.fsPath, '/tmp/b.txt');
  });

  it('removes tab when added to group', async () => {
    const uri1 = vscode.Uri.file('/tmp/a.txt');
    const uri2 = vscode.Uri.file('/tmp/b.txt');
    const tab1 = { input: { uri: uri1 } } as any;
    const tab2 = { input: { uri: uri2 } } as any;

    Object.defineProperty(vscode.window, 'tabGroups', {
      value: { all: [{ tabs: [tab1, tab2] }] },
      configurable: true,
    });

    const provider = new TabstronautDataProvider(new MockMemento({}));
    const groupId = await provider.addGroup('G1');
    await provider.addToGroup(groupId!, '/tmp/a.txt');
    provider.refreshUngroupedTabs();
    provider.clearRefreshInterval();

    const items = provider.getUngroupedItems();
    strictEqual(items.length, 1);
    strictEqual(items[0].resourceUri?.fsPath, '/tmp/b.txt');
  });
});
