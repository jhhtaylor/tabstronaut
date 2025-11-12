/// <reference types="mocha" />
import { strictEqual } from 'assert';
import * as vscode from 'vscode';
import { TabstronautDataProvider } from '../../src/tabstronautDataProvider';

describe('auto remove closed tabs setting', () => {
  let extension: any;
  let provider: TabstronautDataProvider;
  const origTabGroups = vscode.window.tabGroups;
  const origCreateTreeView = vscode.window.createTreeView;

  before(async () => {
    Object.defineProperty(vscode.window, 'tabGroups', {
      value: {
        all: [] as vscode.TabGroup[],
        activeTabGroup: undefined,
        onDidChangeTabs: () => ({ dispose() {} }),
      },
      configurable: true,
    });

    Object.defineProperty(vscode.window, 'createTreeView', {
      value: () => ({
        reveal: async () => {},
        onDidCollapseElement: () => ({ dispose() {} }),
        onDidExpandElement: () => ({ dispose() {} }),
      }),
      configurable: true,
    });

    extension = await vscode.extensions
      .getExtension('jhhtaylor.tabstronaut')!
      .activate();
    provider = extension.testUtils.getTreeDataProvider();
  });

  after(() => {
    Object.defineProperty(vscode.window, 'tabGroups', {
      value: origTabGroups,
      configurable: true,
    });
    Object.defineProperty(vscode.window, 'createTreeView', {
      value: origCreateTreeView,
      configurable: true,
    });
  });

  afterEach(async () => {
    for (const group of provider.getGroups()) {
      await provider.deleteGroup(group.id);
    }
    provider.clearRefreshInterval();
  });

  it('removes grouped entries when the active tab closes', async () => {
    const config = vscode.workspace.getConfiguration('tabstronaut');
    const originalSetting = config.get('autoRemoveClosedTabs');
    await config.update('autoRemoveClosedTabs', true, true);

    try {
      const groupId = await provider.addGroup('G1');
      await provider.addToGroup(groupId!, '/tmp/tabstronaut-auto-remove.ts');

      await extension.testUtils.handleTabChangeEvent({
        closed: [
          {
            input: { uri: vscode.Uri.file('/tmp/tabstronaut-auto-remove.ts') },
          } as unknown as vscode.Tab,
        ],
        opened: [],
        changed: [],
      } as vscode.TabChangeEvent);

      const group = provider.getGroup('G1');
      strictEqual(group?.items.length, 0);
    } finally {
      await config.update('autoRemoveClosedTabs', originalSetting, true);
    }
  });
});
