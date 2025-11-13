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

describe('TabstronautDataProvider group drag-and-drop', () => {
  it('reorders groups naturally when dragged', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    // add groups in known order
    const g1 = await provider.addGroup('G1', undefined, provider.getGroups().length);
    const g2 = await provider.addGroup('G2', undefined, provider.getGroups().length);
    const g3 = await provider.addGroup('G3', undefined, provider.getGroups().length);

    const group1 = provider.getGroup('G1')!;
    const group3 = provider.getGroup('G3')!;

    const dragData = new vscode.DataTransfer();
    await provider.handleDrag([group1], dragData, new vscode.CancellationTokenSource().token);
    await provider.handleDrop(group3, dragData, new vscode.CancellationTokenSource().token);

    provider.clearRefreshInterval();
    const groups = provider.getGroups();
    strictEqual(groups[groups.length - 1].label, 'G1');
  });
});
