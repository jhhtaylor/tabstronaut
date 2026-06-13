/// <reference types="mocha" />
import { strictEqual, ok } from 'assert';
import * as vscode from 'vscode';
import { TabstronautDataProvider } from '../../src/tabstronautDataProvider';
import { captureSnapshotIntoGroup, restoreSnapshotGroup, createSnapshotCommand } from '../../src/snapshotOperations';

class MockMemento implements vscode.Memento {
  private store: Record<string, any>;
  constructor(initial: Record<string, any> = {}) {
    this.store = initial;
  }
  keys(): readonly string[] {
    return Object.keys(this.store);
  }
  get<T>(key: string, defaultValue?: T): T {
    return key in this.store ? (this.store[key] as T) : (defaultValue as T);
  }
  update(key: string, value: any): Thenable<void> {
    this.store[key] = value;
    return Promise.resolve();
  }
}

function makeFileTab(filePath: string, pinned = false): vscode.Tab {
  return { input: { uri: vscode.Uri.file(filePath) }, isPinned: pinned } as any;
}

// ── captureSnapshotIntoGroup ──────────────────────────────────────────────────

describe('captureSnapshotIntoGroup', () => {
  let origTabGroups: any;
  let origInfo: any;

  beforeEach(() => {
    origTabGroups = vscode.window.tabGroups;
    origInfo = vscode.window.showInformationMessage;
  });

  afterEach(() => {
    Object.defineProperty(vscode.window, 'tabGroups', { value: origTabGroups, configurable: true });
    Object.defineProperty(vscode.window, 'showInformationMessage', { value: origInfo, configurable: true });
  });

  it('shows info and returns false when there are no open file tabs', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const groupId = await provider.addGroup('G1');
    const group = provider.findGroupById(groupId!)!;

    Object.defineProperty(vscode.window, 'tabGroups', { value: { all: [] }, configurable: true });

    let infoMsg = '';
    Object.defineProperty(vscode.window, 'showInformationMessage', {
      value: (msg: string) => { infoMsg = msg; return Promise.resolve(undefined); },
      configurable: true,
    });

    const result = await captureSnapshotIntoGroup(provider, group);
    provider.clearRefreshInterval();

    strictEqual(result, false);
    ok(infoMsg.includes('No open file tabs'), infoMsg);
  });

  it('captures a single editor pane as a Tab Snapshot with one pane', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const groupId = await provider.addGroup('G1');
    const group = provider.findGroupById(groupId!)!;

    Object.defineProperty(vscode.window, 'tabGroups', {
      value: { all: [{ viewColumn: 1, tabs: [makeFileTab('/tmp/a.ts'), makeFileTab('/tmp/b.ts', true)] }] },
      configurable: true,
    });

    const result = await captureSnapshotIntoGroup(provider, group);
    provider.clearRefreshInterval();

    strictEqual(result, true);
    strictEqual(group.isSnapshot, true);
    strictEqual(group.contextValue, 'snapshotGroup');
    strictEqual(group.children.length, 1);
    strictEqual(group.children[0].label, 'Pane 1');
    strictEqual(group.children[0].items.length, 2);
    strictEqual(group.children[0].items[1].pinned, true);
  });

  it('captures multiple editor columns as a Tab Snapshot with square column icons', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const groupId = await provider.addGroup('G1');
    const group = provider.findGroupById(groupId!)!;

    Object.defineProperty(vscode.window, 'tabGroups', {
      value: {
        all: [
          { viewColumn: 1, tabs: [makeFileTab('/tmp/a.ts')] },
          { viewColumn: 2, tabs: [makeFileTab('/tmp/b.ts'), makeFileTab('/tmp/c.ts')] },
        ],
      },
      configurable: true,
    });

    const result = await captureSnapshotIntoGroup(provider, group);
    provider.clearRefreshInterval();

    strictEqual(result, true);
    strictEqual(group.isSnapshot, true);
    strictEqual(group.contextValue, 'snapshotGroup');
    strictEqual(group.tooltip, 'G1 (Tab Snapshot)');
    strictEqual(group.children.length, 2);
    strictEqual(group.children[0].label, 'Pane 1');
    strictEqual(group.children[0].contextValue, 'snapshotColumn');
    strictEqual((group.children[0].iconPath as vscode.ThemeIcon).id, 'primitive-square');
    strictEqual(group.children[1].items.length, 2);
  });

  it('trims excess columns when re-captured with fewer editor columns', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const groupId = await provider.addGroup('G1');
    const group = provider.findGroupById(groupId!)!;

    Object.defineProperty(vscode.window, 'tabGroups', {
      value: {
        all: [
          { viewColumn: 1, tabs: [makeFileTab('/tmp/a.ts')] },
          { viewColumn: 2, tabs: [makeFileTab('/tmp/b.ts')] },
          { viewColumn: 3, tabs: [makeFileTab('/tmp/c.ts')] },
        ],
      },
      configurable: true,
    });
    await captureSnapshotIntoGroup(provider, group);
    strictEqual(group.children.length, 3);

    Object.defineProperty(vscode.window, 'tabGroups', {
      value: {
        all: [
          { viewColumn: 1, tabs: [makeFileTab('/tmp/a.ts')] },
          { viewColumn: 2, tabs: [makeFileTab('/tmp/b.ts')] },
        ],
      },
      configurable: true,
    });
    await captureSnapshotIntoGroup(provider, group);
    provider.clearRefreshInterval();

    strictEqual(group.children.length, 2);
  });
});

// ── restoreSnapshotGroup ──────────────────────────────────────────────────────

describe('restoreSnapshotGroup', () => {
  let origInfo: any;
  let origTabGroups: any;

  beforeEach(() => {
    origInfo = vscode.window.showInformationMessage;
    origTabGroups = vscode.window.tabGroups;
  });

  afterEach(() => {
    Object.defineProperty(vscode.window, 'showInformationMessage', { value: origInfo, configurable: true });
    Object.defineProperty(vscode.window, 'tabGroups', { value: origTabGroups, configurable: true });
  });

  it('shows info and does not close editors when the snapshot has no saved columns', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const groupId = await provider.addGroup('G1');
    const group = provider.findGroupById(groupId!)!;

    let infoMsg = '';
    Object.defineProperty(vscode.window, 'showInformationMessage', {
      value: (msg: string) => { infoMsg = msg; return Promise.resolve(undefined); },
      configurable: true,
    });

    let closeCalled = false;
    Object.defineProperty(vscode.window, 'tabGroups', {
      value: { all: [], close: () => { closeCalled = true; return Promise.resolve(); } },
      configurable: true,
    });

    await restoreSnapshotGroup(provider, group);
    provider.clearRefreshInterval();

    ok(infoMsg.includes('no saved columns'), infoMsg);
    strictEqual(closeCalled, false);
  });

  it('opens tabs in saved order, then pins them last-to-first so pinned tabs keep their relative order', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const groupId = await provider.addGroup('G1');
    const group = provider.findGroupById(groupId!)!;

    const origConfirm = vscode.workspace.getConfiguration('tabstronaut').get('confirmRemoveAndClose');
    await vscode.workspace.getConfiguration('tabstronaut').update('confirmRemoveAndClose', false, true);

    const origOpenTextDocument = vscode.workspace.openTextDocument;
    const origShowTextDocument = vscode.window.showTextDocument;
    const origExecuteCommand = vscode.commands.executeCommand;

    try {
      // Capture a 2-column snapshot: column 1 = [a (unpinned), b (pinned)],
      // column 2 = [c (pinned), d (unpinned), e (pinned)].
      Object.defineProperty(vscode.window, 'tabGroups', {
        value: {
          all: [
            { viewColumn: 1, tabs: [makeFileTab('/tmp/a.ts'), makeFileTab('/tmp/b.ts', true)] },
            { viewColumn: 2, tabs: [makeFileTab('/tmp/c.ts', true), makeFileTab('/tmp/d.ts'), makeFileTab('/tmp/e.ts', true)] },
          ],
        },
        configurable: true,
      });
      await captureSnapshotIntoGroup(provider, group);

      const events: string[] = [];
      let lastOpened = '';

      Object.defineProperty(vscode.workspace, 'openTextDocument', {
        value: (filePath: string) => Promise.resolve({ uri: vscode.Uri.file(filePath) }),
        configurable: true,
      });
      Object.defineProperty(vscode.window, 'showTextDocument', {
        value: (document: any, options: any) => {
          lastOpened = document.uri.fsPath;
          events.push(`open:${lastOpened}@${options.viewColumn}`);
          return Promise.resolve({});
        },
        configurable: true,
      });
      Object.defineProperty(vscode.commands, 'executeCommand', {
        value: (command: string, ...args: any[]) => {
          if (command === 'workbench.action.pinEditor') {
            events.push(`pin:${lastOpened}`);
            return Promise.resolve();
          }
          if (command === 'vscode.setEditorLayout') {
            return Promise.resolve();
          }
          return origExecuteCommand(command, ...args);
        },
        configurable: true,
      });
      Object.defineProperty(vscode.window, 'tabGroups', {
        value: { all: [], close: () => Promise.resolve() },
        configurable: true,
      });

      await restoreSnapshotGroup(provider, group);

      strictEqual(events.join(','), [
        'open:/tmp/a.ts@1',
        'open:/tmp/b.ts@1',
        'open:/tmp/b.ts@1',
        'pin:/tmp/b.ts',
        'open:/tmp/c.ts@2',
        'open:/tmp/d.ts@2',
        'open:/tmp/e.ts@2',
        'open:/tmp/e.ts@2',
        'pin:/tmp/e.ts',
        'open:/tmp/c.ts@2',
        'pin:/tmp/c.ts',
      ].join(','));
    } finally {
      provider.clearRefreshInterval();
      Object.defineProperty(vscode.workspace, 'openTextDocument', { value: origOpenTextDocument, configurable: true });
      Object.defineProperty(vscode.window, 'showTextDocument', { value: origShowTextDocument, configurable: true });
      Object.defineProperty(vscode.commands, 'executeCommand', { value: origExecuteCommand, configurable: true });
      await vscode.workspace.getConfiguration('tabstronaut').update('confirmRemoveAndClose', origConfirm, true);
    }
  });
});

// ── createSnapshotCommand ─────────────────────────────────────────────────────

describe('createSnapshotCommand', () => {
  let origTabGroups: any;
  let origInfo: any;
  let origConfigPrompt: any;

  beforeEach(async () => {
    origTabGroups = vscode.window.tabGroups;
    origInfo = vscode.window.showInformationMessage;
    const config = vscode.workspace.getConfiguration('tabstronaut');
    origConfigPrompt = config.get('promptForGroupDetails');
    await config.update('promptForGroupDetails', false, true);
  });

  afterEach(async () => {
    Object.defineProperty(vscode.window, 'tabGroups', { value: origTabGroups, configurable: true });
    Object.defineProperty(vscode.window, 'showInformationMessage', { value: origInfo, configurable: true });
    await vscode.workspace.getConfiguration('tabstronaut').update('promptForGroupDetails', origConfigPrompt, true);
  });

  it('shows info and creates no group when no file tabs are open', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));

    Object.defineProperty(vscode.window, 'tabGroups', {
      value: { all: [] },
      configurable: true,
    });

    let infoMsg = '';
    Object.defineProperty(vscode.window, 'showInformationMessage', {
      value: (msg: string) => { infoMsg = msg; return Promise.resolve(undefined); },
      configurable: true,
    });

    await createSnapshotCommand(provider);
    const rootGroups = provider.getRootGroups();
    provider.clearRefreshInterval();

    strictEqual(rootGroups.length, 0);
    ok(infoMsg.toLowerCase().includes('no open file tabs'), infoMsg);
  });

  it('creates a Tab Snapshot with a single pane when only one editor pane with files is open', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));

    Object.defineProperty(vscode.window, 'tabGroups', {
      value: { all: [{ viewColumn: 1, tabs: [makeFileTab('/tmp/a.ts')] }] },
      configurable: true,
    });

    await createSnapshotCommand(provider);
    const rootGroups = provider.getRootGroups();
    provider.clearRefreshInterval();

    strictEqual(rootGroups.length, 1);
    strictEqual(rootGroups[0].isSnapshot, true);
    strictEqual(rootGroups[0].children.length, 1);
    strictEqual(rootGroups[0].children[0].label, 'Pane 1');
    strictEqual(rootGroups[0].children[0].items.length, 1);
  });

  it('creates a new Tab Snapshot group capturing the current multi-column layout', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));

    Object.defineProperty(vscode.window, 'tabGroups', {
      value: {
        all: [
          { viewColumn: 1, tabs: [makeFileTab('/tmp/a.ts')] },
          { viewColumn: 2, tabs: [makeFileTab('/tmp/b.ts')] },
        ],
      },
      configurable: true,
    });

    await createSnapshotCommand(provider);
    const rootGroups = provider.getRootGroups();
    provider.clearRefreshInterval();

    strictEqual(rootGroups.length, 1);
    strictEqual(rootGroups[0].isSnapshot, true);
    strictEqual(rootGroups[0].children.length, 2);
  });
});
