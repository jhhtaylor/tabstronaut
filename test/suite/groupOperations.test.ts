/// <reference types="mocha" />
import { strictEqual, ok } from 'assert';
import * as vscode from 'vscode';
import { TabstronautDataProvider } from '../../src/tabstronautDataProvider';
import { Group } from '../../src/models/Group';
import {
  getGroupName,
  getNewGroupName,
  selectColorOption,
  handleAddToExistingGroup,
  addAllOpenTabsToGroup,
  addCurrentSplitToGroup,
  addAllTabsToGroupQuickPick,
  filterTabGroupsCommand,
  selectTabGroup,
} from '../../src/groupOperations';

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

describe('groupOperations.getNewGroupName', () => {
  let origInput: any;
  let origError: any;

  beforeEach(() => {
    origInput = vscode.window.showInputBox;
    origError = vscode.window.showErrorMessage;
  });

  afterEach(() => {
    Object.defineProperty(vscode.window, 'showInputBox', { value: origInput, configurable: true });
    Object.defineProperty(vscode.window, 'showErrorMessage', { value: origError, configurable: true });
  });

  it('returns undefined when user cancels', async () => {
    Object.defineProperty(vscode.window, 'showInputBox', {
      value: async () => undefined,
      configurable: true,
    });
    const result = await getNewGroupName(new Group('G1', '1'));
    strictEqual(result, undefined);
  });

  it('returns provided name', async () => {
    Object.defineProperty(vscode.window, 'showInputBox', {
      value: async () => 'MyGroup',
      configurable: true,
    });
    const result = await getNewGroupName(new Group('G1', '1'));
    strictEqual(result, 'MyGroup');
  });

  it('shows error on blank name', async () => {
    let msg: string | undefined;
    Object.defineProperty(vscode.window, 'showInputBox', {
      value: async () => '   ',
      configurable: true,
    });
    Object.defineProperty(vscode.window, 'showErrorMessage', {
      value: (m: string) => {
        msg = m;
        return undefined;
      },
      configurable: true,
    });
    const result = await getNewGroupName(new Group('G1', '1'));
    strictEqual(result, undefined);
    strictEqual(msg, 'Invalid Tab Group name. Please try again.');
  });
});

describe('groupOperations.getGroupName', () => {
  let origCreateInputBox: any;

  beforeEach(() => {
    origCreateInputBox = vscode.window.createInputBox;
  });

  afterEach(() => {
    Object.defineProperty(vscode.window, 'createInputBox', {
      value: origCreateInputBox,
      configurable: true,
    });
  });

  it('skips prompting and uses defaults when prompts are disabled', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const config = vscode.workspace.getConfiguration('tabstronaut');
    const originalSetting = config.get('promptForGroupDetails');
    await config.update('promptForGroupDetails', false, true);

    Object.defineProperty(vscode.window, 'createInputBox', {
      value: () => {
        throw new Error('Input box should not be shown when prompts are disabled.');
      },
      configurable: true,
    });

    try {
      const result = await getGroupName(provider);
      strictEqual(result.name, 'Group 1');
      strictEqual(result.useDefaults, true);
    } finally {
      provider.clearRefreshInterval();
      await config.update('promptForGroupDetails', originalSetting, true);
    }
  });

  it('counts only root groups (not snapshot columns) when generating the default name', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const config = vscode.workspace.getConfiguration('tabstronaut');
    const originalSetting = config.get('promptForGroupDetails');
    await config.update('promptForGroupDetails', false, true);

    Object.defineProperty(vscode.window, 'createInputBox', {
      value: () => {
        throw new Error('Input box should not be shown when prompts are disabled.');
      },
      configurable: true,
    });

    try {
      const snapshotId = await provider.addGroup('Snapshot A');
      await provider.addSubGroup(snapshotId!, 'Column 1', 'terminal.ansiBlue');
      await provider.addSubGroup(snapshotId!, 'Column 2', 'terminal.ansiGreen');

      const result = await getGroupName(provider);
      strictEqual(result.name, 'Group 2');
    } finally {
      provider.clearRefreshInterval();
      await config.update('promptForGroupDetails', originalSetting, true);
    }
  });

  it('allows selecting defaults through the quick input button', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const config = vscode.workspace.getConfiguration('tabstronaut');
    const originalSetting = config.get('promptForGroupDetails');
    await config.update('promptForGroupDetails', true, true);

    let triggerButtonCallback: ((button: vscode.QuickInputButton) => void) | undefined;
    let hideCallback: (() => void) | undefined;

    const mockInputBox: any = {
      buttons: [] as vscode.QuickInputButton[],
      value: '',
      placeholder: '',
      onDidAccept: () => {},
      onDidTriggerButton: (cb: (button: vscode.QuickInputButton) => void) => {
        triggerButtonCallback = cb;
      },
      onDidHide: (cb: () => void) => {
        hideCallback = cb;
      },
      show: () => {
        setTimeout(() => {
          triggerButtonCallback?.(mockInputBox.buttons[0]);
        }, 0);
      },
      hide: () => {
        hideCallback?.();
      },
      dispose: () => {},
    };

    Object.defineProperty(vscode.window, 'createInputBox', {
      value: () => mockInputBox,
      configurable: true,
    });

    try {
      const result = await getGroupName(provider);
      strictEqual(result.name, 'Group 1');
      strictEqual(result.useDefaults, true);
    } finally {
      provider.clearRefreshInterval();
      await config.update('promptForGroupDetails', originalSetting, true);
    }
  });
});

describe('groupOperations.selectColorOption', () => {
  let origQuickPick: any;

  beforeEach(() => {
    origQuickPick = vscode.window.showQuickPick;
  });

  afterEach(() => {
    Object.defineProperty(vscode.window, 'showQuickPick', { value: origQuickPick, configurable: true });
  });

  it('returns selected color and puts current color first', async () => {
    let options: any[] | undefined;
    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: async (opts: any[]) => {
        options = opts;
        return opts[0];
      },
      configurable: true,
    });
    const result = (await selectColorOption('terminal.ansiBlue')) as any;
    strictEqual(options?.[0].colorValue, 'terminal.ansiBlue');
    strictEqual(result.colorValue, 'terminal.ansiBlue');
  });
});

describe('groupOperations.handleAddToExistingGroup', () => {
  it('adds file to group', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const id = await provider.addGroup('G1');
    await handleAddToExistingGroup(provider, id!, '/tmp/file1');
    provider.clearRefreshInterval();
    const group = provider.getGroup('G1')!;
    strictEqual(group.items.length, 1);
    strictEqual(group.items[0].resourceUri?.fsPath, '/tmp/file1');
  });
});

describe('groupOperations.filterTabGroupsCommand', () => {
  let origInput: any;

  beforeEach(() => {
    origInput = vscode.window.showInputBox;
  });

  afterEach(() => {
    Object.defineProperty(vscode.window, 'showInputBox', {
      value: origInput,
      configurable: true,
    });
  });

  it('prefills current filter and updates to new value', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    provider.setGroupFilter('foo');
    let passedValue: string | undefined;
    Object.defineProperty(vscode.window, 'showInputBox', {
      value: async (opts: any) => {
        passedValue = opts.value;
        return 'bar';
      },
      configurable: true,
    });
    await filterTabGroupsCommand(provider);
    provider.clearRefreshInterval();
    strictEqual(passedValue, 'foo');
    strictEqual(provider.getGroupFilter(), 'bar');
  });

  it('clears filter on blank input', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    provider.setGroupFilter('foo');
    Object.defineProperty(vscode.window, 'showInputBox', {
      value: async () => '',
      configurable: true,
    });
    await filterTabGroupsCommand(provider);
    provider.clearRefreshInterval();
    strictEqual(provider.getGroupFilter(), undefined);
  });
});

// ── selectTabGroup filtering ──────────────────────────────────────────────────

function makeQPMock() {
  let hideCb: (() => void) | undefined;
  let acceptCb: (() => unknown) | undefined;
  let triggerCb: ((e: any) => unknown) | undefined;
  const qp: any = {
    items: [] as any[],
    placeholder: '',
    selectedItems: [] as any[],
    onDidAccept: (cb: () => void) => { acceptCb = cb; },
    onDidHide: (cb: () => void) => { hideCb = cb; },
    onDidTriggerItemButton: (cb: any) => { triggerCb = cb; },
    show: () => {},
    hide: () => { hideCb?.(); },
    dispose: () => {},
  };
  return {
    qp,
    cancel() { hideCb?.(); },
    accept() { return acceptCb?.(); },
    triggerButton(e: any) { return triggerCb?.(e); },
  };
}

describe('selectTabGroup — filterFilePath', () => {
  let origCreateQP: any;

  beforeEach(() => { origCreateQP = vscode.window.createQuickPick; });
  afterEach(() => {
    Object.defineProperty(vscode.window, 'createQuickPick', {
      value: origCreateQP, configurable: true,
    });
  });

  it('shows all groups when no filterFilePath is given', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    await provider.addGroup('Alpha');
    await provider.addGroup('Beta');

    const mock = makeQPMock();
    Object.defineProperty(vscode.window, 'createQuickPick', {
      value: () => mock.qp, configurable: true,
    });

    const p = selectTabGroup(provider);
    mock.cancel();
    await p;
    provider.clearRefreshInterval();

    const labels = (mock.qp.items as any[]).filter((i: any) => i.id).map((i: any) => i.label);
    ok(labels.includes('Alpha'), 'Alpha should appear');
    ok(labels.includes('Beta'), 'Beta should appear');
  });

  it('hides groups that already contain the file', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const alphaId = await provider.addGroup('Alpha');
    await provider.addGroup('Beta');
    await provider.addToGroup(alphaId!, '/tmp/file.ts');

    const mock = makeQPMock();
    Object.defineProperty(vscode.window, 'createQuickPick', {
      value: () => mock.qp, configurable: true,
    });

    const p = selectTabGroup(provider, false, '/tmp/file.ts');
    mock.cancel();
    await p;
    provider.clearRefreshInterval();

    const labels = (mock.qp.items as any[]).filter((i: any) => i.id).map((i: any) => i.label);
    ok(!labels.includes('Alpha'), 'Alpha should be hidden (file already present)');
    ok(labels.includes('Beta'), 'Beta should remain visible');
  });

  it('still shows "New Tab Group" when all groups are filtered out', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const id = await provider.addGroup('Only');
    await provider.addToGroup(id!, '/tmp/file.ts');

    const mock = makeQPMock();
    Object.defineProperty(vscode.window, 'createQuickPick', {
      value: () => mock.qp, configurable: true,
    });

    const p = selectTabGroup(provider, false, '/tmp/file.ts');
    mock.cancel();
    await p;
    provider.clearRefreshInterval();

    const newGroupItem = (mock.qp.items as any[]).find(
      (i: any) => i.label === 'New Tab Group from current tab'
    );
    ok(newGroupItem, '"New Tab Group from current tab" should always be present');

    const groupItems = (mock.qp.items as any[]).filter((i: any) => i.id);
    strictEqual(groupItems.length, 0, 'no existing group items should remain');
  });

  it('filters at the group level but still shows sibling sub-groups', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const parentId = await provider.addGroup('Parent');
    const childAId = await provider.addSubGroup(parentId!, 'ChildA', 'terminal.ansiBlue');
    await provider.addSubGroup(parentId!, 'ChildB', 'terminal.ansiGreen');
    // Add file to ChildA only
    await provider.addToGroup(childAId!, '/tmp/file.ts');

    const mock = makeQPMock();
    Object.defineProperty(vscode.window, 'createQuickPick', {
      value: () => mock.qp, configurable: true,
    });

    const p = selectTabGroup(provider, false, '/tmp/file.ts');
    mock.cancel();
    await p;
    provider.clearRefreshInterval();

    const labels = (mock.qp.items as any[]).filter((i: any) => i.id).map((i: any) => i.label);
    ok(labels.includes('Parent'), 'Parent group should be visible');
    ok(!labels.some((l: string) => l.endsWith('ChildA')), 'ChildA should be hidden');
    ok(labels.some((l: string) => l.endsWith('ChildB')), 'ChildB should remain visible');
  });
});

describe('groupOperations.addAllOpenTabsToGroup', () => {
  let origTabGroups: any;
  beforeEach(() => {
    origTabGroups = vscode.window.tabGroups;
  });
  afterEach(() => {
    Object.defineProperty(vscode.window, 'tabGroups', { value: origTabGroups, configurable: true });
  });

  it('adds unique open tabs to group', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    await provider.addGroup('G1');
    const group = provider.getGroup('G1')!;

    const uri1 = vscode.Uri.file('/tmp/a.txt');
    const uri2 = vscode.Uri.file('/tmp/b.txt');
    const tab1 = { input: { uri: uri1 } } as any;
    const tab2 = { input: { uri: uri1 } } as any; // duplicate
    const tab3 = { input: { uri: uri2 } } as any;
    Object.defineProperty(vscode.window, 'tabGroups', {
      value: { all: [{ tabs: [tab1, tab2] }, { tabs: [tab3] }] },
      configurable: true,
    });

    await addAllOpenTabsToGroup(provider, group);
    const updatedGroup = provider.getGroup('G1')!;
    provider.clearRefreshInterval();
    strictEqual(updatedGroup.items.length, 2);
    strictEqual(updatedGroup.items[0].resourceUri?.fsPath, '/tmp/a.txt');
    strictEqual(updatedGroup.items[1].resourceUri?.fsPath, '/tmp/b.txt');
  });

  it('shows an info message and adds nothing when there are no open file tabs', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    await provider.addGroup('G1');
    const group = provider.getGroup('G1')!;

    Object.defineProperty(vscode.window, 'tabGroups', {
      value: { all: [] },
      configurable: true,
    });

    let infoMsg = '';
    const origInfo = vscode.window.showInformationMessage;
    Object.defineProperty(vscode.window, 'showInformationMessage', {
      value: (msg: string) => { infoMsg = msg; return Promise.resolve(undefined); },
      configurable: true,
    });

    try {
      await addAllOpenTabsToGroup(provider, group);
    } finally {
      Object.defineProperty(vscode.window, 'showInformationMessage', { value: origInfo, configurable: true });
    }
    const updatedGroup = provider.getGroup('G1')!;
    provider.clearRefreshInterval();

    strictEqual(updatedGroup.items.length, 0);
    ok(infoMsg.includes('No open file tabs'), infoMsg);
  });
});

describe('groupOperations.addCurrentSplitToGroup', () => {
  let origTabGroups: any;
  beforeEach(() => {
    origTabGroups = vscode.window.tabGroups;
  });
  afterEach(() => {
    Object.defineProperty(vscode.window, 'tabGroups', { value: origTabGroups, configurable: true });
  });

  it('adds only the unique file tabs from the active editor split', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    await provider.addGroup('G1');
    const group = provider.getGroup('G1')!;

    const activeGroup = {
      tabs: [
        { input: { uri: vscode.Uri.file('/tmp/a.ts') } },
        { input: { uri: vscode.Uri.file('/tmp/a.ts') } }, // duplicate
        { input: { uri: vscode.Uri.file('/tmp/b.ts') } },
      ],
    };
    const otherGroup = { tabs: [{ input: { uri: vscode.Uri.file('/tmp/other.ts') } }] };

    Object.defineProperty(vscode.window, 'tabGroups', {
      value: { all: [activeGroup, otherGroup], activeTabGroup: activeGroup },
      configurable: true,
    });

    await addCurrentSplitToGroup(provider, group);
    const updatedGroup = provider.getGroup('G1')!;
    provider.clearRefreshInterval();

    strictEqual(updatedGroup.items.length, 2);
    ok(updatedGroup.containsFile('/tmp/a.ts'));
    ok(updatedGroup.containsFile('/tmp/b.ts'));
    ok(!updatedGroup.containsFile('/tmp/other.ts'));
  });

  it('shows an info message and adds nothing when there is no active editor split', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    await provider.addGroup('G1');
    const group = provider.getGroup('G1')!;

    Object.defineProperty(vscode.window, 'tabGroups', {
      value: { all: [], activeTabGroup: undefined },
      configurable: true,
    });

    let infoMsg = '';
    const origInfo = vscode.window.showInformationMessage;
    Object.defineProperty(vscode.window, 'showInformationMessage', {
      value: (msg: string) => { infoMsg = msg; return Promise.resolve(undefined); },
      configurable: true,
    });

    try {
      await addCurrentSplitToGroup(provider, group);
    } finally {
      Object.defineProperty(vscode.window, 'showInformationMessage', { value: origInfo, configurable: true });
    }
    const updatedGroup = provider.getGroup('G1')!;
    provider.clearRefreshInterval();

    strictEqual(updatedGroup.items.length, 0);
    ok(infoMsg.includes('No open file tabs'), infoMsg);
  });
});

describe('selectTabGroup — current-split buttons', () => {
  let origCreateQP: any;
  let origTabGroups: any;
  let origConfigPrompt: any;

  beforeEach(async () => {
    origCreateQP = vscode.window.createQuickPick;
    origTabGroups = vscode.window.tabGroups;
    const config = vscode.workspace.getConfiguration('tabstronaut');
    origConfigPrompt = config.get('promptForGroupDetails');
    await config.update('promptForGroupDetails', false, true);
  });

  afterEach(async () => {
    Object.defineProperty(vscode.window, 'createQuickPick', { value: origCreateQP, configurable: true });
    Object.defineProperty(vscode.window, 'tabGroups', { value: origTabGroups, configurable: true });
    await vscode.workspace.getConfiguration('tabstronaut').update('promptForGroupDetails', origConfigPrompt, true);
  });

  it('offers "New Tab Group from current split" alongside the all-tabs option', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));

    const mock = makeQPMock();
    Object.defineProperty(vscode.window, 'createQuickPick', { value: () => mock.qp, configurable: true });

    const p = selectTabGroup(provider);
    mock.cancel();
    await p;
    provider.clearRefreshInterval();

    const newGroupItem = (mock.qp.items as any[]).find(
      (i: any) => i.label === 'New Tab Group from current tab'
    );
    const tooltips = (newGroupItem.buttons as any[]).map((b: any) => b.tooltip);
    ok(tooltips.includes('New Tab Group from all tabs'));
    ok(tooltips.includes('New Tab Group from current split'));
  });

  it('offers "Add current split to Tab Group" on existing group items', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    await provider.addGroup('Alpha');

    const mock = makeQPMock();
    Object.defineProperty(vscode.window, 'createQuickPick', { value: () => mock.qp, configurable: true });

    const p = selectTabGroup(provider);
    mock.cancel();
    await p;
    provider.clearRefreshInterval();

    const alphaItem = (mock.qp.items as any[]).find((i: any) => i.label === 'Alpha');
    const tooltips = (alphaItem.buttons as any[]).map((b: any) => b.tooltip);
    ok(tooltips.includes('Add all tabs to Tab Group'));
    ok(tooltips.includes('Add current split to Tab Group'));
  });

  it('"New Tab Group from current split" creates a group from only the active split', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));

    const mock = makeQPMock();
    Object.defineProperty(vscode.window, 'createQuickPick', { value: () => mock.qp, configurable: true });

    const activeGroup = { tabs: [{ input: { uri: vscode.Uri.file('/tmp/split.ts') } }] };
    const otherGroup = { tabs: [{ input: { uri: vscode.Uri.file('/tmp/other.ts') } }] };
    Object.defineProperty(vscode.window, 'tabGroups', {
      value: { all: [activeGroup, otherGroup], activeTabGroup: activeGroup },
      configurable: true,
    });

    const p = selectTabGroup(provider);
    const newGroupItem = (mock.qp.items as any[]).find(
      (i: any) => i.label === 'New Tab Group from current tab'
    );
    const splitButton = (newGroupItem.buttons as any[]).find(
      (b: any) => b.tooltip === 'New Tab Group from current split'
    );
    await mock.triggerButton({ item: newGroupItem, button: splitButton });
    await p;
    provider.clearRefreshInterval();

    const rootGroups = provider.getRootGroups();
    strictEqual(rootGroups.length, 1);
    strictEqual(rootGroups[0].isSnapshot, false);
    ok(rootGroups[0].containsFile('/tmp/split.ts'));
    ok(!rootGroups[0].containsFile('/tmp/other.ts'));
  });

  it('"Add current split to Tab Group" adds only the active split\'s tabs to an existing group', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const id = await provider.addGroup('Alpha');

    const mock = makeQPMock();
    Object.defineProperty(vscode.window, 'createQuickPick', { value: () => mock.qp, configurable: true });

    const activeGroup = { tabs: [{ input: { uri: vscode.Uri.file('/tmp/split.ts') } }] };
    const otherGroup = { tabs: [{ input: { uri: vscode.Uri.file('/tmp/other.ts') } }] };
    Object.defineProperty(vscode.window, 'tabGroups', {
      value: { all: [activeGroup, otherGroup], activeTabGroup: activeGroup },
      configurable: true,
    });

    const p = selectTabGroup(provider);
    const alphaItem = (mock.qp.items as any[]).find((i: any) => i.label === 'Alpha');
    const splitButton = (alphaItem.buttons as any[]).find(
      (b: any) => b.tooltip === 'Add current split to Tab Group'
    );
    await mock.triggerButton({ item: alphaItem, button: splitButton });
    await p;
    provider.clearRefreshInterval();

    const group = provider.findGroupById(id!)!;
    ok(group.containsFile('/tmp/split.ts'));
    ok(!group.containsFile('/tmp/other.ts'));
  });
});

describe('groupOperations.addAllTabsToGroupQuickPick', () => {
  let origCreateQP: any;
  let origTabGroups: any;
  let origConfigPrompt: any;

  beforeEach(async () => {
    origCreateQP = vscode.window.createQuickPick;
    origTabGroups = vscode.window.tabGroups;
    const config = vscode.workspace.getConfiguration('tabstronaut');
    origConfigPrompt = config.get('promptForGroupDetails');
    await config.update('promptForGroupDetails', false, true);
  });

  afterEach(async () => {
    Object.defineProperty(vscode.window, 'createQuickPick', { value: origCreateQP, configurable: true });
    Object.defineProperty(vscode.window, 'tabGroups', { value: origTabGroups, configurable: true });
    await vscode.workspace.getConfiguration('tabstronaut').update('promptForGroupDetails', origConfigPrompt, true);
  });

  it('defaults to "all tabs" mode, offering "Add current split" as the secondary action', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    await provider.addGroup('Alpha');

    const mock = makeQPMock();
    Object.defineProperty(vscode.window, 'createQuickPick', { value: () => mock.qp, configurable: true });

    const p = addAllTabsToGroupQuickPick(provider);
    await p;

    strictEqual(mock.qp.placeholder, 'Add all open tabs to a Tab Group');
    const alphaItem = (mock.qp.items as any[]).find((i: any) => i.label === 'Alpha');
    const tooltips = (alphaItem.buttons as any[]).map((b: any) => b.tooltip);
    ok(tooltips.includes('Add current split to Tab Group'));

    provider.clearRefreshInterval();
  });

  it('"split" mode offers "Add all tabs" as the secondary action', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    await provider.addGroup('Alpha');

    const mock = makeQPMock();
    Object.defineProperty(vscode.window, 'createQuickPick', { value: () => mock.qp, configurable: true });

    const p = addAllTabsToGroupQuickPick(provider, 'split');
    await p;

    strictEqual(mock.qp.placeholder, "Add current split's tabs to a Tab Group");
    const alphaItem = (mock.qp.items as any[]).find((i: any) => i.label === 'Alpha');
    const tooltips = (alphaItem.buttons as any[]).map((b: any) => b.tooltip);
    ok(tooltips.includes('Add all tabs to Tab Group'));

    provider.clearRefreshInterval();
  });

  it('in "split" mode, accepting an existing group adds only the active split\'s tabs', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const id = await provider.addGroup('Alpha');

    const mock = makeQPMock();
    Object.defineProperty(vscode.window, 'createQuickPick', { value: () => mock.qp, configurable: true });

    const activeGroup = { tabs: [{ input: { uri: vscode.Uri.file('/tmp/split.ts') } }] };
    const otherGroup = { tabs: [{ input: { uri: vscode.Uri.file('/tmp/other.ts') } }] };
    Object.defineProperty(vscode.window, 'tabGroups', {
      value: { all: [activeGroup, otherGroup], activeTabGroup: activeGroup },
      configurable: true,
    });

    const p = addAllTabsToGroupQuickPick(provider, 'split');
    await p;
    const alphaItem = (mock.qp.items as any[]).find((i: any) => i.label === 'Alpha');
    mock.qp.selectedItems = [alphaItem];
    await mock.accept();

    provider.clearRefreshInterval();
    const group = provider.findGroupById(id!)!;
    ok(group.containsFile('/tmp/split.ts'));
    ok(!group.containsFile('/tmp/other.ts'));
  });

  it('in default mode, triggering the split-horizontal button on a group adds only the active split\'s tabs', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const id = await provider.addGroup('Alpha');

    const mock = makeQPMock();
    Object.defineProperty(vscode.window, 'createQuickPick', { value: () => mock.qp, configurable: true });

    const activeGroup = { tabs: [{ input: { uri: vscode.Uri.file('/tmp/split.ts') } }] };
    const otherGroup = { tabs: [{ input: { uri: vscode.Uri.file('/tmp/other.ts') } }] };
    Object.defineProperty(vscode.window, 'tabGroups', {
      value: { all: [activeGroup, otherGroup], activeTabGroup: activeGroup },
      configurable: true,
    });

    const p = addAllTabsToGroupQuickPick(provider);
    await p;
    const alphaItem = (mock.qp.items as any[]).find((i: any) => i.label === 'Alpha');
    await mock.triggerButton({ item: alphaItem, button: alphaItem.buttons[0] });

    provider.clearRefreshInterval();
    const group = provider.findGroupById(id!)!;
    ok(group.containsFile('/tmp/split.ts'));
    ok(!group.containsFile('/tmp/other.ts'));
  });
});
