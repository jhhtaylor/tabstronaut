/// <reference types="mocha" />
import { strictEqual, ok } from 'assert';
import * as vscode from 'vscode';
import { TabstronautDataProvider } from '../../src/tabstronautDataProvider';

// ── Guards preventing generic group commands from mutating Tab Snapshot groups ──

describe('Tab Snapshot group command guards', () => {
  let extension: any;
  let provider: TabstronautDataProvider;
  let origTabGroups: any;
  let origInfo: any;

  before(async () => {
    extension = await vscode.extensions.getExtension('jhhtaylor.tabstronaut')!.activate();
    provider = extension.testUtils.getTreeDataProvider();
  });

  beforeEach(async () => {
    for (const g of provider.getGroups()) {
      await provider.deleteGroup(g.id);
    }
    origTabGroups = vscode.window.tabGroups;
    origInfo = vscode.window.showInformationMessage;
  });

  afterEach(() => {
    Object.defineProperty(vscode.window, 'tabGroups', { value: origTabGroups, configurable: true });
    Object.defineProperty(vscode.window, 'showInformationMessage', { value: origInfo, configurable: true });
  });

  it('"Add all tabs to group" leaves a Tab Snapshot group untouched and shows an info message', async () => {
    const groupId = await provider.addGroup('Snapshot1');
    const group = provider.findGroupById(groupId!)!;
    group.isSnapshot = true;
    group.updateIcon();

    Object.defineProperty(vscode.window, 'tabGroups', {
      value: { all: [{ tabs: [{ input: { uri: vscode.Uri.file('/tmp/a.ts') } }] }] },
      configurable: true,
    });

    let infoMsg = '';
    Object.defineProperty(vscode.window, 'showInformationMessage', {
      value: (msg: string) => { infoMsg = msg; return Promise.resolve(undefined); },
      configurable: true,
    });

    await vscode.commands.executeCommand('tabstronaut.addAllOpenTabsToGroup', group);

    strictEqual(group.items.length, 0);
    ok(infoMsg.includes('Tab Snapshot'), infoMsg);
  });

  it('"Add Sub-Group" does nothing on a Tab Snapshot group and shows an info message', async () => {
    const groupId = await provider.addGroup('Snapshot2');
    const group = provider.findGroupById(groupId!)!;
    group.isSnapshot = true;
    group.updateIcon();

    let infoMsg = '';
    Object.defineProperty(vscode.window, 'showInformationMessage', {
      value: (msg: string) => { infoMsg = msg; return Promise.resolve(undefined); },
      configurable: true,
    });

    await vscode.commands.executeCommand('tabstronaut.addSubGroup', group);

    strictEqual(group.children.length, 0);
    ok(infoMsg.includes('Tab Snapshot'), infoMsg);
  });
});
