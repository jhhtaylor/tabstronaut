import { strictEqual, ok, deepStrictEqual } from 'assert';
import * as vscode from 'vscode';
import { TabstronautDataProvider } from '../../src/tabstronautDataProvider';
import { Group } from '../../src/models/Group';

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

describe('Nested Groups - addSubGroup', () => {
  it('creates a sub-group inside a parent group', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const parentId = await provider.addGroup('Parent');
    const childId = await provider.addSubGroup(parentId!, 'Child');
    provider.clearRefreshInterval();

    ok(childId, 'Expected child group ID');
    const parent = provider.findGroupById(parentId!);
    ok(parent);
    strictEqual(parent!.children.length, 1);
    strictEqual(parent!.children[0].label, 'Child');
    strictEqual(parent!.children[0].id, childId);
    strictEqual(parent!.children[0].parentId, parentId);
  });

  it('creates deeply nested sub-groups', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('Level 1');
    const g2 = await provider.addSubGroup(g1!, 'Level 2');
    const g3 = await provider.addSubGroup(g2!, 'Level 3');
    provider.clearRefreshInterval();

    const level3 = provider.findGroupById(g3!);
    ok(level3);
    strictEqual(level3!.label, 'Level 3');
    strictEqual(level3!.parentId, g2);

    const level2 = provider.findGroupById(g2!);
    ok(level2);
    strictEqual(level2!.children.length, 1);
    strictEqual(level2!.children[0].id, g3);
  });

  it('returns undefined when parent does not exist', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const result = await provider.addSubGroup('nonexistent', 'Child');
    provider.clearRefreshInterval();
    strictEqual(result, undefined);
  });
});

describe('Nested Groups - getChildren', () => {
  it('returns children and items for a group', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const parentId = await provider.addGroup('Parent');
    await provider.addSubGroup(parentId!, 'Child');
    await provider.addToGroup(parentId!, '/tmp/file1');
    provider.clearRefreshInterval();

    const parent = provider.findGroupById(parentId!);
    const children = await provider.getChildren(parent!);
    strictEqual(children.length, 2);
    ok(children[0] instanceof Group);
    strictEqual((children[0] as Group).label, 'Child');
    strictEqual(children[1].label, 'file1');
  });
});

describe('Nested Groups - findGroupById', () => {
  it('finds root groups', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const id = await provider.addGroup('Root');
    provider.clearRefreshInterval();
    const found = provider.findGroupById(id!);
    ok(found);
    strictEqual(found!.label, 'Root');
  });

  it('finds deeply nested groups', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('L1');
    const g2 = await provider.addSubGroup(g1!, 'L2');
    const g3 = await provider.addSubGroup(g2!, 'L3');
    provider.clearRefreshInterval();

    const found = provider.findGroupById(g3!);
    ok(found);
    strictEqual(found!.label, 'L3');
  });

  it('returns undefined for nonexistent id', () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    provider.clearRefreshInterval();
    strictEqual(provider.findGroupById('nope'), undefined);
  });
});

describe('Nested Groups - addToGroup on nested group', () => {
  it('adds a tab to a nested group', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('Parent');
    const g2 = await provider.addSubGroup(g1!, 'Child');
    await provider.addToGroup(g2!, '/tmp/nested-file');
    provider.clearRefreshInterval();

    const child = provider.findGroupById(g2!);
    ok(child);
    strictEqual(child!.items.length, 1);
    strictEqual(child!.items[0].resourceUri?.fsPath, '/tmp/nested-file');
  });

  it('moves tab from ancestor when adding to sub-group', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('Parent');
    await provider.addToGroup(g1!, '/tmp/file1');
    const g2 = await provider.addSubGroup(g1!, 'Child');
    await provider.addToGroup(g2!, '/tmp/file1');
    provider.clearRefreshInterval();

    const parent = provider.findGroupById(g1!);
    const child = provider.findGroupById(g2!);
    ok(parent);
    ok(child);
    strictEqual(parent!.items.length, 0, 'File should be removed from parent');
    strictEqual(child!.items.length, 1, 'File should be in child');
  });
});

describe('Nested Groups - cascade delete', () => {
  let originalConfirm: any;

  before(async () => {
    const config = vscode.workspace.getConfiguration('tabstronaut');
    originalConfirm = config.get('confirmRemoveAndClose');
    await config.update('confirmRemoveAndClose', false, true);
  });

  after(async () => {
    const config = vscode.workspace.getConfiguration('tabstronaut');
    await config.update('confirmRemoveAndClose', originalConfirm, true);
  });

  it('deletes empty group when last tab removed', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('Parent');
    const g2 = await provider.addSubGroup(g1!, 'Child');
    await provider.addToGroup(g2!, '/tmp/file1');
    await provider.removeFromGroup(g2!, '/tmp/file1');
    provider.clearRefreshInterval();

    strictEqual(provider.findGroupById(g2!), undefined, 'Child should be deleted');
  });

  it('cascade deletes empty ancestors', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('L1');
    const g2 = await provider.addSubGroup(g1!, 'L2');
    const g3 = await provider.addSubGroup(g2!, 'L3');
    await provider.addToGroup(g3!, '/tmp/file1');

    await provider.removeFromGroup(g3!, '/tmp/file1');
    provider.clearRefreshInterval();

    strictEqual(provider.findGroupById(g3!), undefined, 'L3 should be deleted');
    strictEqual(provider.findGroupById(g2!), undefined, 'L2 should be cascade-deleted');
    strictEqual(provider.findGroupById(g1!), undefined, 'L1 should be cascade-deleted');
    strictEqual(provider.getGroups().length, 0);
  });

  it('does not cascade delete ancestors that still have content', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('L1');
    await provider.addToGroup(g1!, '/tmp/parent-file');
    const g2 = await provider.addSubGroup(g1!, 'L2');
    await provider.addToGroup(g2!, '/tmp/child-file');

    await provider.removeFromGroup(g2!, '/tmp/child-file');
    provider.clearRefreshInterval();

    strictEqual(provider.findGroupById(g2!), undefined, 'L2 should be deleted');
    ok(provider.findGroupById(g1!), 'L1 should still exist');
    strictEqual(provider.findGroupById(g1!)!.items.length, 1);
  });

  it('does not cascade delete ancestors that have other children', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('L1');
    const g2a = await provider.addSubGroup(g1!, 'L2a');
    const g2b = await provider.addSubGroup(g1!, 'L2b');
    await provider.addToGroup(g2a!, '/tmp/file-a');
    await provider.addToGroup(g2b!, '/tmp/file-b');

    await provider.removeFromGroup(g2a!, '/tmp/file-a');
    provider.clearRefreshInterval();

    strictEqual(provider.findGroupById(g2a!), undefined, 'L2a should be deleted');
    ok(provider.findGroupById(g1!), 'L1 should still exist (has L2b)');
    ok(provider.findGroupById(g2b!), 'L2b should still exist');
  });
});

describe('Nested Groups - deleteGroup', () => {
  it('deletes a nested group and cascade-deletes empty ancestors', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('L1');
    const g2 = await provider.addSubGroup(g1!, 'L2');
    await provider.addToGroup(g2!, '/tmp/file1');

    await provider.deleteGroup(g2!);
    provider.clearRefreshInterval();

    strictEqual(provider.findGroupById(g2!), undefined);
    strictEqual(provider.findGroupById(g1!), undefined, 'Empty L1 should be cascade-deleted');
  });

  it('deletes a root group with nested children', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('L1');
    const g2 = await provider.addSubGroup(g1!, 'L2');
    await provider.addToGroup(g2!, '/tmp/file1');

    await provider.deleteGroup(g1!);
    provider.clearRefreshInterval();

    strictEqual(provider.findGroupById(g1!), undefined);
    strictEqual(provider.findGroupById(g2!), undefined);
    strictEqual(provider.getGroups().length, 0);
  });
});

describe('Nested Groups - undo cascade delete', () => {
  let originalConfirm: any;

  before(async () => {
    const config = vscode.workspace.getConfiguration('tabstronaut');
    originalConfirm = config.get('confirmRemoveAndClose');
    await config.update('confirmRemoveAndClose', false, true);
  });

  after(async () => {
    const config = vscode.workspace.getConfiguration('tabstronaut');
    await config.update('confirmRemoveAndClose', originalConfirm, true);
  });

  it('onGroupAutoDeleted receives the topmost cascade-deleted ancestor', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('L1');
    const g2 = await provider.addSubGroup(g1!, 'L2');
    const g3 = await provider.addSubGroup(g2!, 'L3');
    await provider.addToGroup(g3!, '/tmp/file1');

    let deletedGroup: Group | undefined;
    provider.onGroupAutoDeleted = (group: Group) => {
      deletedGroup = group;
    };

    await provider.removeFromGroup(g3!, '/tmp/file1');
    provider.clearRefreshInterval();

    ok(deletedGroup, 'onGroupAutoDeleted should have been called');
    strictEqual(deletedGroup!.label, 'L1', 'Should receive topmost ancestor');
    strictEqual(deletedGroup!.children.length, 1, 'Should have L2 as child');
    strictEqual(deletedGroup!.children[0].label, 'L2');
    strictEqual(deletedGroup!.children[0].children.length, 1, 'L2 should have L3');
    strictEqual(deletedGroup!.children[0].children[0].label, 'L3');
    strictEqual(deletedGroup!.children[0].children[0].items.length, 1);
  });

  it('onGroupAutoDeleted receives only the leaf when ancestors have content', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('L1');
    await provider.addToGroup(g1!, '/tmp/parent-file');
    const g2 = await provider.addSubGroup(g1!, 'L2');
    await provider.addToGroup(g2!, '/tmp/child-file');

    let deletedGroup: Group | undefined;
    provider.onGroupAutoDeleted = (group: Group) => {
      deletedGroup = group;
    };

    await provider.removeFromGroup(g2!, '/tmp/child-file');
    provider.clearRefreshInterval();

    ok(deletedGroup, 'onGroupAutoDeleted should have been called');
    strictEqual(deletedGroup!.label, 'L2', 'Should receive only the leaf group');
    strictEqual(deletedGroup!.parentId, g1, 'Should preserve parentId for undo');
  });
});

describe('Nested Groups - renameGroup on nested group', () => {
  it('renames a nested group', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('Parent');
    const g2 = await provider.addSubGroup(g1!, 'OldChild');
    await provider.renameGroup(g2!, 'NewChild', 'terminal.ansiGreen');
    provider.clearRefreshInterval();

    const child = provider.findGroupById(g2!);
    ok(child);
    strictEqual(child!.label, 'NewChild');
    strictEqual(child!.colorName, 'terminal.ansiGreen');
  });
});

describe('Nested Groups - sortGroup on nested group', () => {
  it('sorts tabs in a nested group', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('Parent');
    const g2 = await provider.addSubGroup(g1!, 'Child');
    await provider.addToGroup(g2!, '/tmp/b.ts');
    await provider.addToGroup(g2!, '/tmp/a.ts');
    await provider.sortGroup(g2!, 'alphabetical');
    provider.clearRefreshInterval();

    const child = provider.findGroupById(g2!);
    ok(child);
    strictEqual(child!.items[0].resourceUri?.fsPath, '/tmp/a.ts');
    strictEqual(child!.items[1].resourceUri?.fsPath, '/tmp/b.ts');
  });
});

describe('Nested Groups - serialization', () => {
  it('persists and restores nested groups from storage', async () => {
    const memento = new MockMemento({});
    const provider1 = new TabstronautDataProvider(memento);
    const g1 = await provider1.addGroup('L1');
    const g2 = await provider1.addSubGroup(g1!, 'L2');
    await provider1.addToGroup(g2!, '/tmp/file1');
    await provider1.addToGroup(g1!, '/tmp/file2');
    provider1.clearRefreshInterval();

    // Create a new provider from the same memento to simulate reload
    const provider2 = new TabstronautDataProvider(memento);
    provider2.clearRefreshInterval();

    const root = provider2.getRootGroups();
    strictEqual(root.length, 1);
    strictEqual(root[0].label, 'L1');
    strictEqual(root[0].items.length, 1);
    strictEqual(root[0].children.length, 1);
    strictEqual(root[0].children[0].label, 'L2');
    strictEqual(root[0].children[0].items.length, 1);
    strictEqual(root[0].children[0].parentId, root[0].id);
  });

  it('backward compatible with old flat format', () => {
    const tabGroups = {
      'id1': {
        label: 'OldGroup',
        items: ['/tmp/file1'],
        creationTime: new Date().toISOString(),
        colorName: 'terminal.ansiRed',
      },
    };
    const memento = new MockMemento({ tabGroups });
    const provider = new TabstronautDataProvider(memento);
    provider.clearRefreshInterval();

    const groups = provider.getRootGroups();
    strictEqual(groups.length, 1);
    strictEqual(groups[0].label, 'OldGroup');
    strictEqual(groups[0].items.length, 1);
    strictEqual(groups[0].children.length, 0);
  });
});

describe('Nested Groups - getGroups returns flat list', () => {
  it('returns all groups including nested ones', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('L1');
    const g2 = await provider.addSubGroup(g1!, 'L2');
    const g3 = await provider.addSubGroup(g2!, 'L3');
    await provider.addGroup('L1b');
    provider.clearRefreshInterval();

    const all = provider.getGroups();
    strictEqual(all.length, 4);
    const labels = all.map((g) => g.label);
    ok(labels.includes('L1'));
    ok(labels.includes('L2'));
    ok(labels.includes('L3'));
    ok(labels.includes('L1b'));
  });
});

describe('Nested Groups - containsFileRecursive', () => {
  it('finds files in nested children', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('Parent');
    const g2 = await provider.addSubGroup(g1!, 'Child');
    await provider.addToGroup(g2!, '/tmp/deep-file');
    provider.clearRefreshInterval();

    const parent = provider.findGroupById(g1!);
    ok(parent);
    strictEqual(parent!.containsFile('/tmp/deep-file'), false, 'Direct containsFile should not find it');
    strictEqual(parent!.containsFileRecursive('/tmp/deep-file'), true, 'Recursive should find it');
  });
});

describe('Nested Groups - drag and drop nesting', () => {
  it('moves a group into another via drag and drop', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('G1');
    const g2 = await provider.addGroup('G2');
    await provider.addToGroup(g1!, '/tmp/file1');
    await provider.addToGroup(g2!, '/tmp/file2');
    provider.clearRefreshInterval();

    const srcGroup = provider.findGroupById(g1!)!;
    const dstGroup = provider.findGroupById(g2!)!;

    // Simulate dragging G1 into G2 — since G1 is root and G2 is root,
    // and they are siblings, drag uses reorder logic by default.
    // To test nesting, we need one of them to be non-root or force the else branch.
    // Let's create a child and drag it to another root group.
    const child = await provider.addSubGroup(g1!, 'Child');
    await provider.addToGroup(child!, '/tmp/child-file');

    const childGroup = provider.findGroupById(child!)!;
    const dragData = new vscode.DataTransfer();
    await provider.handleDrag([childGroup], dragData, new vscode.CancellationTokenSource().token);
    await provider.handleDrop(dstGroup, dragData, new vscode.CancellationTokenSource().token);

    // Child should now be under G2
    const updatedG2 = provider.findGroupById(g2!)!;
    strictEqual(updatedG2.children.length, 1);
    strictEqual(updatedG2.children[0].label, 'Child');
  });
});
