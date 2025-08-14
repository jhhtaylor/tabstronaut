/// <reference types="mocha" />
import { strictEqual } from 'assert';
import * as vscode from 'vscode';
import { TabstronautDataProvider } from '../../src/tabstronautDataProvider';

describe('collapse/expand all commands', () => {
  let extension: any;
  let provider: TabstronautDataProvider;
  let contexts: Record<string, any> = {};
  const origCreateTreeView = vscode.window.createTreeView;
  const origExecuteCommand = vscode.commands.executeCommand;

  before(async () => {
    Object.defineProperty(vscode.window, 'createTreeView', {
      value: () => ({
        reveal: async () => {},
        onDidCollapseElement: () => ({ dispose() {} }),
        onDidExpandElement: () => ({ dispose() {} }),
      }),
      configurable: true,
    });

    Object.defineProperty(vscode.commands, 'executeCommand', {
      value: (command: string, ...args: any[]) => {
        if (command === 'setContext') {
          contexts[args[0]] = args[1];
          return Promise.resolve();
        }
        if (command === 'list.collapseAll') {
          return Promise.resolve();
        }
        return Promise.resolve();
      },
      configurable: true,
    });

    extension = await vscode.extensions.getExtension('jhhtaylor.tabstronaut')!.activate();
    provider = extension.testUtils.getTreeDataProvider();
  });

  after(() => {
    Object.defineProperty(vscode.window, 'createTreeView', {
      value: origCreateTreeView,
      configurable: true,
    });
    Object.defineProperty(vscode.commands, 'executeCommand', {
      value: origExecuteCommand,
      configurable: true,
    });
  });

  beforeEach(async () => {
    contexts = {};
    for (const g of provider.getGroups()) {
      await provider.deleteGroup(g.id);
    }
    extension.testUtils.clearCollapsedGroups();
    provider.setGroupFilter(undefined);
  });

  afterEach(() => {
    provider.clearRefreshInterval();
  });

  it('collapses and expands all groups', async () => {
    const id1 = await provider.addGroup('G1');
    const id2 = await provider.addGroup('G2');

    await vscode.commands.executeCommand('tabstronaut.collapseAll');
    strictEqual(extension.testUtils.isGroupCollapsed(id1!), true);
    strictEqual(extension.testUtils.isGroupCollapsed(id2!), true);
    strictEqual(contexts['tabstronaut:allCollapsed'], true);

    await vscode.commands.executeCommand('tabstronaut.expandAll');
    strictEqual(extension.testUtils.isGroupCollapsed(id1!), false);
    strictEqual(extension.testUtils.isGroupCollapsed(id2!), false);
    strictEqual(contexts['tabstronaut:allCollapsed'], false);
  });

  it('handles filters when collapsing and expanding', async () => {
    const idA = await provider.addGroup('Alpha');
    const idB = await provider.addGroup('Beta');

    provider.setGroupFilter('Beta');
    await vscode.commands.executeCommand('tabstronaut.collapseAll');
    strictEqual(extension.testUtils.isGroupCollapsed(idA!), true);
    strictEqual(extension.testUtils.isGroupCollapsed(idB!), true);
    strictEqual(contexts['tabstronaut:allCollapsed'], true);

    provider.setGroupFilter('Alpha');
    await vscode.commands.executeCommand('tabstronaut.expandAll');
    strictEqual(extension.testUtils.isGroupCollapsed(idA!), false);
    strictEqual(extension.testUtils.isGroupCollapsed(idB!), true);
    strictEqual(contexts['tabstronaut:allCollapsed'], false);
  });
});

