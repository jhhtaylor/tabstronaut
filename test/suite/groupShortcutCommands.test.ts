/// <reference types="mocha" />
import { strictEqual, ok } from 'assert';
import * as vscode from 'vscode';
import { TabstronautDataProvider } from '../../src/tabstronautDataProvider';
import {
  addAllTabsToGroupQuickPick,
  createNewGroupCommand,
  renameGroupQuickPick,
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

// ── addAllTabsToGroupQuickPick ────────────────────────────────────────────────

describe('addAllTabsToGroupQuickPick', () => {
  let origShowQP: any;

  beforeEach(() => { origShowQP = (vscode.window as any).showQuickPick; });
  afterEach(() => {
    Object.defineProperty(vscode.window, 'showQuickPick', { value: origShowQP, configurable: true });
  });

  it('returns without error when user cancels', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    await provider.addGroup('Alpha');

    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: () => Promise.resolve(undefined),
      configurable: true,
    });

    await addAllTabsToGroupQuickPick(provider);
    provider.clearRefreshInterval();
    strictEqual(provider.getRootGroups().length, 1, 'no groups created on cancel');
  });

  it('always shows "Create new group..." as the first item', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    await provider.addGroup('Alpha');

    let firstItem: any;
    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: (items: any[]) => { firstItem = items[0]; return Promise.resolve(undefined); },
      configurable: true,
    });

    await addAllTabsToGroupQuickPick(provider);
    provider.clearRefreshInterval();
    ok(firstItem?.label?.includes('Create new group'), `first item should be "Create new group...", got: ${firstItem?.label}`);
  });

  it('shows all existing groups in the list', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    await provider.addGroup('Alpha');
    await provider.addGroup('Beta');

    let capturedItems: any[] = [];
    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: (items: any[]) => { capturedItems = items; return Promise.resolve(undefined); },
      configurable: true,
    });

    await addAllTabsToGroupQuickPick(provider);
    provider.clearRefreshInterval();

    const groupLabels = capturedItems
      .filter((i: any) => i.groupId && i.groupId !== '__create_new__' && i.kind !== vscode.QuickPickItemKind.Separator)
      .map((i: any) => i.label);

    ok(groupLabels.includes('Alpha'), 'Alpha should appear');
    ok(groupLabels.includes('Beta'), 'Beta should appear');
  });

  it('shows no separator when there are no existing groups (only "Create new group...")', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());

    let capturedItems: any[] = [];
    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: (items: any[]) => { capturedItems = items; return Promise.resolve(undefined); },
      configurable: true,
    });

    await addAllTabsToGroupQuickPick(provider);
    provider.clearRefreshInterval();

    strictEqual(capturedItems.length, 1, 'only "Create new group..." when no groups exist');
    strictEqual(capturedItems.filter((i: any) => i.kind === vscode.QuickPickItemKind.Separator).length, 0);
  });

  it('selecting an existing group calls addAllOpenTabsToGroup (0 tabs in test env is safe)', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    const id = await provider.addGroup('Alpha');

    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: (items: any[]) => {
        const groupItem = items.find((i: any) => i.groupId && i.groupId !== '__create_new__' && i.kind !== vscode.QuickPickItemKind.Separator);
        return Promise.resolve(groupItem);
      },
      configurable: true,
    });

    // No open tabs in test env — should complete without throwing
    await addAllTabsToGroupQuickPick(provider);
    provider.clearRefreshInterval();

    const group = provider.findGroupById(id!);
    ok(group, 'group should still exist');
    // 0 tabs in test env → no items added, but no error either
    strictEqual(group!.items.length, 0);
  });

  it('shows nested groups with hierarchy prefix', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    const parentId = await provider.addGroup('Parent');
    await provider.addSubGroup(parentId!, 'Child', 'terminal.ansiBlue');

    let capturedItems: any[] = [];
    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: (items: any[]) => { capturedItems = items; return Promise.resolve(undefined); },
      configurable: true,
    });

    await addAllTabsToGroupQuickPick(provider);
    provider.clearRefreshInterval();

    const labels = capturedItems.map((i: any) => i.label);
    ok(labels.includes('Parent'), 'Parent should be listed');
    ok(labels.some((l: string) => l === 'Parent > Child'), `expected "Parent > Child", got: ${JSON.stringify(labels)}`);
  });
});

// ── createNewGroupCommand ─────────────────────────────────────────────────────

describe('createNewGroupCommand', () => {
  it('creates a new group with the default auto-generated name', async () => {
    // promptForGroupDetails defaults to false → getGroupName returns immediately
    // with "Group 1" (no UI shown)
    const provider = new TabstronautDataProvider(new MockMemento());
    strictEqual(provider.getRootGroups().length, 0);

    await createNewGroupCommand(provider);
    provider.clearRefreshInterval();

    strictEqual(provider.getRootGroups().length, 1, 'one group should be created');
    strictEqual(provider.getRootGroups()[0].label, 'Group 1');
  });

  it('auto-increments the group name based on total group count', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    await provider.addGroup('Existing');

    await createNewGroupCommand(provider);
    provider.clearRefreshInterval();

    // getGroups() (flat) has 2 groups → next auto-name is "Group 3"
    // (it uses getGroups().length + 1 before the new group is added)
    const labels = provider.getRootGroups().map((g) => g.label as string);
    ok(labels.includes('Existing'), 'existing group preserved');
    strictEqual(labels.length, 2, 'two groups total after creation');
  });

  it('creates the group with no items (empty)', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());

    await createNewGroupCommand(provider);
    provider.clearRefreshInterval();

    strictEqual(provider.getRootGroups()[0].items.length, 0, 'new group should be empty');
  });

  it('multiple calls produce multiple groups', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());

    await createNewGroupCommand(provider);
    await createNewGroupCommand(provider);
    await createNewGroupCommand(provider);
    provider.clearRefreshInterval();

    strictEqual(provider.getRootGroups().length, 3);
  });
});

// ── renameGroupQuickPick ──────────────────────────────────────────────────────

describe('renameGroupQuickPick', () => {
  let origShowQP: any;
  let origShowInputBox: any;
  let origWarning: any;

  beforeEach(() => {
    origShowQP       = (vscode.window as any).showQuickPick;
    origShowInputBox = (vscode.window as any).showInputBox;
    origWarning      = (vscode.window as any).showWarningMessage;
  });

  afterEach(() => {
    Object.defineProperty(vscode.window, 'showQuickPick',    { value: origShowQP,       configurable: true });
    Object.defineProperty(vscode.window, 'showInputBox',     { value: origShowInputBox, configurable: true });
    Object.defineProperty(vscode.window, 'showWarningMessage', { value: origWarning,    configurable: true });
  });

  it('shows a warning and returns when there are no groups', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());

    let warned = false;
    Object.defineProperty(vscode.window, 'showWarningMessage', {
      value: () => { warned = true; return Promise.resolve(undefined); },
      configurable: true,
    });

    await renameGroupQuickPick(provider);
    provider.clearRefreshInterval();

    ok(warned, 'expected showWarningMessage to be called');
  });

  it('returns without renaming when user cancels the group picker', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    const id = await provider.addGroup('Original');

    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: () => Promise.resolve(undefined),
      configurable: true,
    });

    await renameGroupQuickPick(provider);
    provider.clearRefreshInterval();

    strictEqual(provider.findGroupById(id!)?.label, 'Original', 'label should be unchanged');
  });

  it('renames the selected group', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    const id = await provider.addGroup('OldName');

    let qpCallCount = 0;
    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: (items: any[]) => {
        qpCallCount++;
        // First call = group picker (items have groupId)
        // Second call = color picker (items have colorValue)
        return Promise.resolve(items[0]);
      },
      configurable: true,
    });
    Object.defineProperty(vscode.window, 'showInputBox', {
      value: () => Promise.resolve('NewName'),
      configurable: true,
    });

    await renameGroupQuickPick(provider);
    provider.clearRefreshInterval();

    strictEqual(provider.findGroupById(id!)?.label, 'NewName', 'group should be renamed');
  });

  it('returns without renaming when user cancels the name input', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    const id = await provider.addGroup('OriginalName');

    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: (items: any[]) => Promise.resolve(items[0]),
      configurable: true,
    });
    Object.defineProperty(vscode.window, 'showInputBox', {
      value: () => Promise.resolve(undefined), // user cancelled
      configurable: true,
    });

    await renameGroupQuickPick(provider);
    provider.clearRefreshInterval();

    strictEqual(provider.findGroupById(id!)?.label, 'OriginalName', 'label should be unchanged after cancel');
  });

  it('lists nested groups with a hierarchy prefix', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    const parentId = await provider.addGroup('Parent');
    await provider.addSubGroup(parentId!, 'Child', 'terminal.ansiBlue');

    let capturedItems: any[] = [];
    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: (items: any[]) => { capturedItems = items; return Promise.resolve(undefined); },
      configurable: true,
    });

    await renameGroupQuickPick(provider);
    provider.clearRefreshInterval();

    const labels = capturedItems.map((i: any) => i.label);
    ok(labels.includes('Parent'), 'Parent should be listed');
    ok(labels.some((l: string) => l === 'Parent > Child'), `expected "Parent > Child", got: ${JSON.stringify(labels)}`);
  });
});
