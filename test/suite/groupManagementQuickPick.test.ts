/// <reference types="mocha" />
import { strictEqual, ok } from 'assert';
import * as vscode from 'vscode';
import { TabstronautDataProvider } from '../../src/tabstronautDataProvider';
import {
  addCurrentTabToGroupQuickPick,
  removeCurrentTabFromGroupQuickPick,
  pickGroupToDelete,
} from '../../src/groupOperations';

class MockMemento implements vscode.Memento {
  private store: Record<string, any> = {};
  keys(): readonly string[] { return Object.keys(this.store); }
  get<T>(key: string, defaultValue?: T): T {
    return key in this.store ? (this.store[key] as T) : (defaultValue as T);
  }
  update(key: string, value: any): Thenable<void> {
    this.store[key] = value;
    return Promise.resolve();
  }
}

// ── addCurrentTabToGroupQuickPick ────────────────────────────────────────────

describe('addCurrentTabToGroupQuickPick', () => {
  let origShowQP: typeof vscode.window.showQuickPick;
  let origWarning: typeof vscode.window.showWarningMessage;

  beforeEach(() => {
    origShowQP = (vscode.window as any).showQuickPick;
    origWarning = (vscode.window as any).showWarningMessage;
  });

  afterEach(() => {
    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: origShowQP, configurable: true,
    });
    Object.defineProperty(vscode.window, 'showWarningMessage', {
      value: origWarning, configurable: true,
    });
  });

  it('returns without error when user cancels (showQuickPick returns undefined)', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    await provider.addGroup('Alpha');

    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: () => Promise.resolve(undefined),
      configurable: true,
    });

    // Should not throw
    await addCurrentTabToGroupQuickPick(provider, '/tmp/file.ts');
    provider.clearRefreshInterval();
  });

  it('includes "Create new group…" as the first item always', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    await provider.addGroup('Alpha');

    let capturedItems: any[] = [];
    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: (items: any[]) => { capturedItems = items; return Promise.resolve(undefined); },
      configurable: true,
    });

    await addCurrentTabToGroupQuickPick(provider, '/tmp/file.ts');
    provider.clearRefreshInterval();

    ok(capturedItems.length > 0, 'expected items');
    ok(
      capturedItems[0].label.includes('Create new group'),
      `first item should be "Create new group…", got: ${capturedItems[0].label}`
    );
  });

  it('shows only groups where the file is NOT already present', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    const alphaId = await provider.addGroup('Alpha');
    await provider.addGroup('Beta');
    // Add file to Alpha — Alpha should be excluded, Beta should be included
    await provider.addToGroup(alphaId!, '/tmp/file.ts');

    let capturedItems: any[] = [];
    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: (items: any[]) => { capturedItems = items; return Promise.resolve(undefined); },
      configurable: true,
    });

    await addCurrentTabToGroupQuickPick(provider, '/tmp/file.ts');
    provider.clearRefreshInterval();

    const groupLabels = capturedItems
      .filter((i: any) => i.groupId && i.groupId !== '__create_new__' && i.kind !== vscode.QuickPickItemKind.Separator)
      .map((i: any) => i.label);

    ok(!groupLabels.includes('Alpha'), 'Alpha should be excluded (file already present)');
    ok(groupLabels.includes('Beta'), 'Beta should be included');
  });

  it('shows no group items (just "Create new group") when file is in all groups', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    const id = await provider.addGroup('Only');
    await provider.addToGroup(id!, '/tmp/file.ts');

    let capturedItems: any[] = [];
    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: (items: any[]) => { capturedItems = items; return Promise.resolve(undefined); },
      configurable: true,
    });

    await addCurrentTabToGroupQuickPick(provider, '/tmp/file.ts');
    provider.clearRefreshInterval();

    const groupItems = capturedItems.filter(
      (i: any) => i.groupId && i.groupId !== '__create_new__' && i.kind !== vscode.QuickPickItemKind.Separator
    );
    strictEqual(groupItems.length, 0, 'no group items when file is already in every group');
    ok(capturedItems[0].label.includes('Create new group'), 'only "Create new group" shown');
  });

  it('adds the file to the selected group', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    const id = await provider.addGroup('Alpha');

    let capturedItems: any[] = [];
    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: (items: any[]) => {
        capturedItems = items;
        // Pick the first real group item (not "Create new group" or separator)
        const pick = items.find((i: any) => i.groupId && i.groupId !== '__create_new__' && i.kind !== vscode.QuickPickItemKind.Separator);
        return Promise.resolve(pick);
      },
      configurable: true,
    });

    await addCurrentTabToGroupQuickPick(provider, '/tmp/file.ts');
    provider.clearRefreshInterval();

    const group = provider.findGroupById(id!);
    ok(group, 'group should exist');
    ok(group!.containsFile('/tmp/file.ts'), 'file should have been added to the group');
  });
});

// ── removeCurrentTabFromGroupQuickPick ───────────────────────────────────────

describe('removeCurrentTabFromGroupQuickPick', () => {
  let origShowQP: typeof vscode.window.showQuickPick;
  let origWarning: typeof vscode.window.showWarningMessage;

  beforeEach(() => {
    origShowQP = (vscode.window as any).showQuickPick;
    origWarning = (vscode.window as any).showWarningMessage;
  });

  afterEach(() => {
    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: origShowQP, configurable: true,
    });
    Object.defineProperty(vscode.window, 'showWarningMessage', {
      value: origWarning, configurable: true,
    });
  });

  it('shows a warning when the file is not in any group', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    await provider.addGroup('Alpha');

    let warned = false;
    Object.defineProperty(vscode.window, 'showWarningMessage', {
      value: () => { warned = true; return Promise.resolve(undefined); },
      configurable: true,
    });

    await removeCurrentTabFromGroupQuickPick(provider, '/tmp/nowhere.ts');
    provider.clearRefreshInterval();

    ok(warned, 'expected showWarningMessage to be called');
  });

  it('shows only groups that contain the file', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    const alphaId = await provider.addGroup('Alpha');
    await provider.addGroup('Beta');
    await provider.addToGroup(alphaId!, '/tmp/file.ts');

    let capturedItems: any[] = [];
    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: (items: any[]) => { capturedItems = items; return Promise.resolve(undefined); },
      configurable: true,
    });

    await removeCurrentTabFromGroupQuickPick(provider, '/tmp/file.ts');
    provider.clearRefreshInterval();

    const labels = capturedItems.map((i: any) => i.label);
    ok(labels.includes('Alpha'), 'Alpha should appear (file is in it)');
    ok(!labels.includes('Beta'), 'Beta should not appear (file is not in it)');
  });

  it('removes the file from the selected group', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    const id = await provider.addGroup('Alpha');
    await provider.addToGroup(id!, '/tmp/file.ts');

    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: (items: any[]) => Promise.resolve(items[0]),
      configurable: true,
    });

    await removeCurrentTabFromGroupQuickPick(provider, '/tmp/file.ts');
    provider.clearRefreshInterval();

    const group = provider.findGroupById(id!);
    ok(group, 'group should still exist');
    ok(!group!.containsFile('/tmp/file.ts'), 'file should have been removed');
  });

  it('returns without removing when user cancels', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    const id = await provider.addGroup('Alpha');
    await provider.addToGroup(id!, '/tmp/file.ts');

    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: () => Promise.resolve(undefined),
      configurable: true,
    });

    await removeCurrentTabFromGroupQuickPick(provider, '/tmp/file.ts');
    provider.clearRefreshInterval();

    const group = provider.findGroupById(id!);
    ok(group!.containsFile('/tmp/file.ts'), 'file should still be in the group after cancel');
  });
});

// ── pickGroupToDelete ────────────────────────────────────────────────────────

describe('pickGroupToDelete', () => {
  let origShowQP: typeof vscode.window.showQuickPick;
  let origWarning: typeof vscode.window.showWarningMessage;

  beforeEach(() => {
    origShowQP = (vscode.window as any).showQuickPick;
    origWarning = (vscode.window as any).showWarningMessage;
  });

  afterEach(() => {
    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: origShowQP, configurable: true,
    });
    Object.defineProperty(vscode.window, 'showWarningMessage', {
      value: origWarning, configurable: true,
    });
  });

  it('shows a warning and returns undefined when there are no groups', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());

    let warned = false;
    Object.defineProperty(vscode.window, 'showWarningMessage', {
      value: () => { warned = true; return Promise.resolve(undefined); },
      configurable: true,
    });

    const result = await pickGroupToDelete(provider);
    provider.clearRefreshInterval();

    strictEqual(result, undefined);
    ok(warned, 'expected showWarningMessage to be called');
  });

  it('returns undefined when user cancels', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    await provider.addGroup('Alpha');

    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: () => Promise.resolve(undefined),
      configurable: true,
    });

    const result = await pickGroupToDelete(provider);
    provider.clearRefreshInterval();

    strictEqual(result, undefined);
  });

  it('returns the selected group', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    await provider.addGroup('Alpha');
    await provider.addGroup('Beta');

    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: (items: any[]) => Promise.resolve(items[0]),
      configurable: true,
    });

    const result = await pickGroupToDelete(provider);
    provider.clearRefreshInterval();

    ok(result, 'expected a group');
    strictEqual(result!.label, 'Alpha');
  });

  it('lists nested groups with hierarchy prefix', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    const parentId = await provider.addGroup('Parent');
    await provider.addSubGroup(parentId!, 'Child', 'terminal.ansiBlue');

    let capturedItems: any[] = [];
    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: (items: any[]) => { capturedItems = items; return Promise.resolve(undefined); },
      configurable: true,
    });

    await pickGroupToDelete(provider);
    provider.clearRefreshInterval();

    const labels = capturedItems.map((i: any) => i.label);
    ok(labels.includes('Parent'), 'Parent should be in the list');
    ok(
      labels.some((l: string) => l === 'Parent > Child'),
      `expected "Parent > Child" but got: ${JSON.stringify(labels)}`
    );
  });
});
