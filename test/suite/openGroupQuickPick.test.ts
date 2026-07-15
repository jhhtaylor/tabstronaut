/// <reference types="mocha" />
import { strictEqual, ok } from 'assert';
import * as vscode from 'vscode';
import { TabstronautDataProvider } from '../../src/tabstronautDataProvider';
import { openGroupQuickPick } from '../../src/groupOperations';

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

// Helper: build a mock createQuickPick that exposes trigger callbacks
function makeMockQuickPick() {
  let acceptCb: (() => void) | undefined;
  let hideCb: (() => void) | undefined;
  let buttonCb: ((e: { item: any; button: any }) => void) | undefined;

  const qp: any = {
    items: [] as any[],
    placeholder: '',
    selectedItems: [] as any[],
    onDidAccept: (cb: () => void) => { acceptCb = cb; },
    onDidHide: (cb: () => void) => { hideCb = cb; },
    onDidTriggerItemButton: (cb: (e: any) => void) => { buttonCb = cb; },
    show: () => {},
    // Real VS Code fires onDidHide on a later tick, decoupled from whatever
    // called .hide() — never synchronously within the same call stack. Some
    // handlers rely on that ordering: they call `quickPick.hide(); finish(x)`
    // and expect `finish(x)` to win the `settled` race; others (e.g.
    // selectTabGroup's button handler) call only `quickPick.hide()` and rely
    // on onDidHide's `resolve(undefined)` to settle at all. Deferring here
    // (rather than firing synchronously, or never) satisfies both.
    hide: () => { setTimeout(() => hideCb?.(), 0); },
    dispose: () => {},
  };

  return {
    qp,
    accept(item: any) { qp.selectedItems = [item]; acceptCb?.(); },
    cancel() { hideCb?.(); },
    clickButton(item: any, button: any) { buttonCb?.({ item, button }); },
  };
}

describe('openGroupQuickPick', () => {
  let origCreateQP: any;
  let origWarning: any;

  beforeEach(() => {
    origCreateQP = vscode.window.createQuickPick;
    origWarning = vscode.window.showWarningMessage;
  });

  afterEach(() => {
    Object.defineProperty(vscode.window, 'createQuickPick', {
      value: origCreateQP,
      configurable: true,
    });
    Object.defineProperty(vscode.window, 'showWarningMessage', {
      value: origWarning,
      configurable: true,
    });
  });

  it('shows a warning and returns undefined when there are no groups', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    let warned = false;
    Object.defineProperty(vscode.window, 'showWarningMessage', {
      value: () => { warned = true; return Promise.resolve(undefined); },
      configurable: true,
    });

    const result = await openGroupQuickPick(provider);

    provider.clearRefreshInterval();
    strictEqual(result, undefined);
    ok(warned, 'expected showWarningMessage to be called');
  });

  it('returns undefined when user cancels', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    await provider.addGroup('Alpha');

    const mock = makeMockQuickPick();
    Object.defineProperty(vscode.window, 'createQuickPick', {
      value: () => mock.qp,
      configurable: true,
    });

    const resultPromise = openGroupQuickPick(provider);
    mock.cancel();
    const result = await resultPromise;

    provider.clearRefreshInterval();
    strictEqual(result, undefined);
  });

  it('returns { recursive: false } when user presses Enter on a group', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    await provider.addGroup('Alpha');
    await provider.addGroup('Beta');

    const mock = makeMockQuickPick();
    Object.defineProperty(vscode.window, 'createQuickPick', {
      value: () => mock.qp,
      configurable: true,
    });

    const resultPromise = openGroupQuickPick(provider);
    // items are built during show — accept the first item after the QP is set up
    await Promise.resolve(); // flush microtasks so items are populated
    const firstItem = mock.qp.items[0];
    mock.accept(firstItem);
    const result = await resultPromise;

    provider.clearRefreshInterval();
    ok(result, 'expected a result');
    strictEqual(result?.recursive, false);
    ok(result?.group, 'expected a group');
  });

  it('returns { recursive: true } when user clicks the sub-groups button', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    const parentId = await provider.addGroup('Parent');
    await provider.addSubGroup(parentId!, 'Child', 'terminal.ansiBlue');

    const mock = makeMockQuickPick();
    Object.defineProperty(vscode.window, 'createQuickPick', {
      value: () => mock.qp,
      configurable: true,
    });

    const resultPromise = openGroupQuickPick(provider);
    await Promise.resolve();
    const parentItem = mock.qp.items.find((i: any) => i.label === 'Parent');
    ok(parentItem, 'Parent item not found');
    ok(parentItem.buttons?.length > 0, 'Parent should have a recursive button');
    mock.clickButton(parentItem, parentItem.buttons[0]);
    const result = await resultPromise;

    provider.clearRefreshInterval();
    ok(result, 'expected a result');
    strictEqual(result?.recursive, true);
    strictEqual(result?.group.label, 'Parent');
  });

  it('leaf groups have no recursive button', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    await provider.addGroup('Leaf');

    const mock = makeMockQuickPick();
    Object.defineProperty(vscode.window, 'createQuickPick', {
      value: () => mock.qp,
      configurable: true,
    });

    const resultPromise = openGroupQuickPick(provider);
    await Promise.resolve();
    const leafItem = mock.qp.items.find((i: any) => i.label === 'Leaf');
    mock.cancel();
    await resultPromise;

    provider.clearRefreshInterval();
    ok(leafItem, 'Leaf item not found');
    strictEqual(leafItem.buttons?.length ?? 0, 0, 'leaf group should have no buttons');
  });

  it('shows correct tab count in the description', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    const id = await provider.addGroup('MyGroup');
    await provider.addToGroup(id!, '/tmp/a.ts');
    await provider.addToGroup(id!, '/tmp/b.ts');

    const mock = makeMockQuickPick();
    Object.defineProperty(vscode.window, 'createQuickPick', {
      value: () => mock.qp,
      configurable: true,
    });

    const resultPromise = openGroupQuickPick(provider);
    await Promise.resolve();
    mock.cancel();
    await resultPromise;

    provider.clearRefreshInterval();
    const item = mock.qp.items.find((i: any) => i.label === 'MyGroup');
    ok(item, 'expected MyGroup in the list');
    strictEqual(item.description, '2 tabs');
  });

  it('uses singular "tab" for a group with exactly one tab', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    const id = await provider.addGroup('Solo');
    await provider.addToGroup(id!, '/tmp/only.ts');

    const mock = makeMockQuickPick();
    Object.defineProperty(vscode.window, 'createQuickPick', {
      value: () => mock.qp,
      configurable: true,
    });

    const resultPromise = openGroupQuickPick(provider);
    await Promise.resolve();
    mock.cancel();
    await resultPromise;

    provider.clearRefreshInterval();
    const item = mock.qp.items.find((i: any) => i.label === 'Solo');
    strictEqual(item?.description, '1 tab');
  });

  it('prefixes nested groups with a hierarchy label', async () => {
    const provider = new TabstronautDataProvider(new MockMemento());
    const parentId = await provider.addGroup('Parent');
    await provider.addSubGroup(parentId!, 'Child', 'terminal.ansiBlue');

    const mock = makeMockQuickPick();
    Object.defineProperty(vscode.window, 'createQuickPick', {
      value: () => mock.qp,
      configurable: true,
    });

    const resultPromise = openGroupQuickPick(provider);
    await Promise.resolve();
    mock.cancel();
    await resultPromise;

    provider.clearRefreshInterval();
    const labels = mock.qp.items.map((i: any) => i.label);
    ok(labels.includes('Parent'), 'Parent should be in the list');
    ok(
      labels.some((l: string) => l === 'Parent > Child'),
      `expected "Parent > Child" but got: ${JSON.stringify(labels)}`
    );
  });
});
