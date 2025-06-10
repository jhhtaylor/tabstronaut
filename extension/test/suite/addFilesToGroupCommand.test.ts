import { strictEqual } from 'assert';
import * as vscode from 'vscode';
import { TabstronautDataProvider } from '../../src/tabstronautDataProvider';
import * as groupOps from '../../src/groupOperations';
import * as fileOps from '../../src/fileOperations';

class MockMemento implements vscode.Memento {
  private store: Record<string, any>;
  constructor(initial: Record<string, any> = {}) { this.store = initial; }
  keys(): readonly string[] { throw new Error('Method not implemented.'); }
  get<T>(key: string, defaultValue?: T): T { return key in this.store ? this.store[key] as T : (defaultValue as T); }
  update(key: string, value: any): Thenable<void> { this.store[key] = value; return Promise.resolve(); }
}

describe('addFilesToGroupCommand multi-select', () => {
  it('adds all files returned by gatherFileUris', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const groupId = await provider.addGroup('G1');
    const uri1 = vscode.Uri.file('/tmp/a.txt');
    const uri2 = vscode.Uri.file('/tmp/b.txt');

    const gatherOrig = fileOps.gatherFileUris;
    (fileOps as any).gatherFileUris = async () => [uri1, uri2];

    const selectOrig = groupOps.selectTabGroup;
    (groupOps as any).selectTabGroup = async () => ({ id: groupId, label: 'G1' });

    await groupOps.addFilesToGroupCommand(provider, [uri1, uri2]);
    provider.clearRefreshInterval();

    const group = provider.getGroup('G1');
    strictEqual(group?.items.length, 2);
    const paths = group!.items.map(i => i.resourceUri?.fsPath);
    strictEqual(paths.includes('/tmp/a.txt'), true);
    strictEqual(paths.includes('/tmp/b.txt'), true);

    (groupOps as any).selectTabGroup = selectOrig;
    (fileOps as any).gatherFileUris = gatherOrig;
  });

  it('adds files when group selected via quick pick button', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const groupId = await provider.addGroup('G1');
    const uri1 = vscode.Uri.file('/tmp/c.txt');
    const uri2 = vscode.Uri.file('/tmp/d.txt');

    const gatherOrig = fileOps.gatherFileUris;
    (fileOps as any).gatherFileUris = async () => [uri1, uri2];

    const selectOrig = groupOps.selectTabGroup;
    (groupOps as any).selectTabGroup = async () => {
      await provider.addToGroup(groupId, '/tmp/existing.txt');
      return { id: groupId, label: 'G1' };
    };

    await groupOps.addFilesToGroupCommand(provider, [uri1, uri2]);
    provider.clearRefreshInterval();

    const group = provider.getGroup('G1');
    strictEqual(group?.items.length, 3);
    const paths = group!.items.map((i) => i.resourceUri?.fsPath);
    strictEqual(paths.includes('/tmp/c.txt'), true);
    strictEqual(paths.includes('/tmp/d.txt'), true);
    strictEqual(paths.includes('/tmp/existing.txt'), true);

    (groupOps as any).selectTabGroup = selectOrig;
    (fileOps as any).gatherFileUris = gatherOrig;
  });
});
