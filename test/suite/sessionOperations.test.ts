/// <reference types="mocha" />
import { strictEqual, ok } from 'assert';
import * as vscode from 'vscode';
import { TabstronautDataProvider } from '../../src/tabstronautDataProvider';
import { captureSessionIntoGroup, restoreSessionGroup, createSessionCommand } from '../../src/sessionOperations';

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

// ── captureSessionIntoGroup ──────────────────────────────────────────────────

describe('captureSessionIntoGroup', () => {
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

    const result = await captureSessionIntoGroup(provider, group);
    provider.clearRefreshInterval();

    strictEqual(result, false);
    ok(infoMsg.includes('No open file tabs'), infoMsg);
  });

  it('captures a single editor column as a flat (non-session) group', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const groupId = await provider.addGroup('G1');
    const group = provider.findGroupById(groupId!)!;

    Object.defineProperty(vscode.window, 'tabGroups', {
      value: { all: [{ viewColumn: 1, tabs: [makeFileTab('/tmp/a.ts'), makeFileTab('/tmp/b.ts', true)] }] },
      configurable: true,
    });

    const result = await captureSessionIntoGroup(provider, group);
    provider.clearRefreshInterval();

    strictEqual(result, true);
    strictEqual(group.isSession, false);
    strictEqual(group.children.length, 0);
    strictEqual(group.items.length, 2);
    strictEqual(group.items[1].pinned, true);
    strictEqual(group.contextValue, 'group');
  });

  it('captures multiple editor columns as a session with square column icons', async () => {
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

    const result = await captureSessionIntoGroup(provider, group);
    provider.clearRefreshInterval();

    strictEqual(result, true);
    strictEqual(group.isSession, true);
    strictEqual(group.contextValue, 'sessionGroup');
    strictEqual(group.tooltip, 'G1 (Session)');
    strictEqual(group.children.length, 2);
    strictEqual(group.children[0].label, 'Column 1');
    strictEqual(group.children[0].contextValue, 'sessionColumn');
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
    await captureSessionIntoGroup(provider, group);
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
    await captureSessionIntoGroup(provider, group);
    provider.clearRefreshInterval();

    strictEqual(group.children.length, 2);
  });
});

// ── restoreSessionGroup ──────────────────────────────────────────────────────

describe('restoreSessionGroup', () => {
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

  it('shows info and does not close editors when the session has no saved columns', async () => {
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

    await restoreSessionGroup(provider, group);
    provider.clearRefreshInterval();

    ok(infoMsg.includes('no saved columns'), infoMsg);
    strictEqual(closeCalled, false);
  });
});

// ── createSessionCommand ─────────────────────────────────────────────────────

describe('createSessionCommand', () => {
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

  it('shows info and creates no group when fewer than 2 editor columns with files are open', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));

    Object.defineProperty(vscode.window, 'tabGroups', {
      value: { all: [{ viewColumn: 1, tabs: [makeFileTab('/tmp/a.ts')] }] },
      configurable: true,
    });

    let infoMsg = '';
    Object.defineProperty(vscode.window, 'showInformationMessage', {
      value: (msg: string) => { infoMsg = msg; return Promise.resolve(undefined); },
      configurable: true,
    });

    await createSessionCommand(provider);
    const rootGroups = provider.getRootGroups();
    provider.clearRefreshInterval();

    strictEqual(rootGroups.length, 0);
    ok(infoMsg.toLowerCase().includes('split your editor'), infoMsg);
  });

  it('creates a new session group capturing the current multi-column layout', async () => {
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

    await createSessionCommand(provider);
    const rootGroups = provider.getRootGroups();
    provider.clearRefreshInterval();

    strictEqual(rootGroups.length, 1);
    strictEqual(rootGroups[0].isSession, true);
    strictEqual(rootGroups[0].children.length, 2);
  });
});
