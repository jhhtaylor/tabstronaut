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

describe('Nested Groups - groups persist when empty', () => {
  it('keeps group when last tab is removed', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('Parent');
    const g2 = await provider.addSubGroup(g1!, 'Child');
    await provider.addToGroup(g2!, '/tmp/file1');
    await provider.removeFromGroup(g2!, '/tmp/file1');
    provider.clearRefreshInterval();

    ok(provider.findGroupById(g2!), 'Child should still exist');
    strictEqual(provider.findGroupById(g2!)!.items.length, 0);
  });

  it('keeps entire ancestor chain when deepest tab is removed', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('L1');
    const g2 = await provider.addSubGroup(g1!, 'L2');
    const g3 = await provider.addSubGroup(g2!, 'L3');
    await provider.addToGroup(g3!, '/tmp/file1');

    await provider.removeFromGroup(g3!, '/tmp/file1');
    provider.clearRefreshInterval();

    ok(provider.findGroupById(g1!), 'L1 should still exist');
    ok(provider.findGroupById(g2!), 'L2 should still exist');
    ok(provider.findGroupById(g3!), 'L3 should still exist');
    strictEqual(provider.findGroupById(g3!)!.items.length, 0);
  });

  it('allows empty sub-groups to be created', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('Parent');
    await provider.addToGroup(g1!, '/tmp/file1');
    const g2 = await provider.addSubGroup(g1!, 'EmptyChild');
    provider.clearRefreshInterval();

    ok(provider.findGroupById(g2!), 'Empty sub-group should exist');
    strictEqual(provider.findGroupById(g2!)!.items.length, 0);
    strictEqual(provider.findGroupById(g1!)!.children.length, 1);
  });
});

describe('Nested Groups - deleteGroup', () => {
  it('deletes a nested group but keeps parent', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('L1');
    const g2 = await provider.addSubGroup(g1!, 'L2');
    await provider.addToGroup(g2!, '/tmp/file1');

    await provider.deleteGroup(g2!);
    provider.clearRefreshInterval();

    strictEqual(provider.findGroupById(g2!), undefined, 'L2 should be deleted');
    ok(provider.findGroupById(g1!), 'L1 should still exist');
    strictEqual(provider.findGroupById(g1!)!.children.length, 0);
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

describe('Nested Groups - drag and drop', () => {
  it('nests a group inside another when dropped on a tab', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('G1');
    const g2 = await provider.addGroup('G2');
    await provider.addToGroup(g1!, '/tmp/file1');
    await provider.addToGroup(g2!, '/tmp/file2');
    provider.clearRefreshInterval();

    const child = await provider.addSubGroup(g1!, 'Child');
    await provider.addToGroup(child!, '/tmp/child-file');

    const childGroup = provider.findGroupById(child!)!;
    const dstGroup = provider.findGroupById(g2!)!;

    // Drop group onto a tab inside G2 to nest it
    const targetTab = dstGroup.items[0];
    const dragData = new vscode.DataTransfer();
    await provider.handleDrag([childGroup], dragData, new vscode.CancellationTokenSource().token);
    await provider.handleDrop(targetTab, dragData, new vscode.CancellationTokenSource().token);

    // Child should now be under G2
    const updatedG2 = provider.findGroupById(g2!)!;
    strictEqual(updatedG2.children.length, 1);
    strictEqual(updatedG2.children[0].label, 'Child');
  });

  it('reorders groups when dropped on another group', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('G1');
    const g2 = await provider.addGroup('G2');
    const g3 = await provider.addGroup('G3');
    await provider.addToGroup(g1!, '/tmp/file1');
    await provider.addToGroup(g2!, '/tmp/file2');
    await provider.addToGroup(g3!, '/tmp/file3');
    provider.clearRefreshInterval();

    // Drag G1 onto G3 — should reorder, not nest
    const srcGroup = provider.findGroupById(g1!)!;
    const dstGroup = provider.findGroupById(g3!)!;
    const dragData = new vscode.DataTransfer();
    await provider.handleDrag([srcGroup], dragData, new vscode.CancellationTokenSource().token);
    await provider.handleDrop(dstGroup, dragData, new vscode.CancellationTokenSource().token);

    // G1 should still be root level, not nested inside G3
    const rootGroups = provider.getRootGroups();
    strictEqual(rootGroups.length, 3);
    strictEqual(dstGroup.children.length, 0);

    // G1 should now be after G3
    const labels = rootGroups.map((g) => g.label);
    strictEqual(labels.indexOf('G3') < labels.indexOf('G1'), true);
  });

  it('promotes nested group to root when dropped on empty space', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('Parent');
    await provider.addToGroup(g1!, '/tmp/file1');
    const child = await provider.addSubGroup(g1!, 'Child');
    await provider.addToGroup(child!, '/tmp/child-file');
    provider.clearRefreshInterval();

    const childGroup = provider.findGroupById(child!)!;
    strictEqual(childGroup.parentId, g1);

    const dragData = new vscode.DataTransfer();
    await provider.handleDrag([childGroup], dragData, new vscode.CancellationTokenSource().token);
    await provider.handleDrop(undefined, dragData, new vscode.CancellationTokenSource().token);

    // Child should now be root level
    const rootGroups = provider.getRootGroups();
    strictEqual(rootGroups.length, 2);
    const promotedChild = provider.findGroupById(child!)!;
    strictEqual(promotedChild.parentId, undefined, 'Should be root level');
    strictEqual(provider.findGroupById(g1!)!.children.length, 0, 'Parent should have no children');
  });

  it('reorders nested siblings when dropped on each other', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('Parent');
    await provider.addToGroup(g1!, '/tmp/file1');
    const c1 = await provider.addSubGroup(g1!, 'Child1');
    const c2 = await provider.addSubGroup(g1!, 'Child2');
    await provider.addToGroup(c1!, '/tmp/c1-file');
    await provider.addToGroup(c2!, '/tmp/c2-file');
    provider.clearRefreshInterval();

    const parent = provider.findGroupById(g1!)!;
    strictEqual(parent.children[0].label, 'Child1');
    strictEqual(parent.children[1].label, 'Child2');

    // Drag Child1 onto Child2 — should reorder, not nest
    const child1Group = provider.findGroupById(c1!)!;
    const child2Group = provider.findGroupById(c2!)!;
    const dragData = new vscode.DataTransfer();
    await provider.handleDrag([child1Group], dragData, new vscode.CancellationTokenSource().token);
    await provider.handleDrop(child2Group, dragData, new vscode.CancellationTokenSource().token);

    strictEqual(parent.children.length, 2, 'Should still have 2 children');
    strictEqual(parent.children[0].label, 'Child2');
    strictEqual(parent.children[1].label, 'Child1');
  });

  it('moves root group into nested position when dropped on a tab', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('G1');
    const g2 = await provider.addGroup('G2');
    await provider.addToGroup(g1!, '/tmp/file1');
    await provider.addToGroup(g2!, '/tmp/file2');
    provider.clearRefreshInterval();

    // Drag G1 onto a tab in G2 — should nest G1 inside G2
    const srcGroup = provider.findGroupById(g1!)!;
    const dstGroup = provider.findGroupById(g2!)!;
    const targetTab = dstGroup.items[0];
    const dragData = new vscode.DataTransfer();
    await provider.handleDrag([srcGroup], dragData, new vscode.CancellationTokenSource().token);
    await provider.handleDrop(targetTab, dragData, new vscode.CancellationTokenSource().token);

    strictEqual(provider.getRootGroups().length, 1, 'Only G2 should be root');
    strictEqual(dstGroup.children.length, 1);
    strictEqual(dstGroup.children[0].label, 'G1');
    strictEqual(dstGroup.children[0].parentId, g2);
  });
});

describe('Nested Groups - undo delete restores tabs and children', () => {
  it('restores a deleted group with all its tabs', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('MyGroup');
    await provider.addToGroup(g1!, '/tmp/file1');
    await provider.addToGroup(g1!, '/tmp/file2');
    await provider.addToGroup(g1!, '/tmp/file3');
    provider.clearRefreshInterval();

    const group = provider.findGroupById(g1!)!;
    strictEqual(group.items.length, 3);

    // Capture backup before deletion (mimics extension.ts removeTabGroup logic)
    const backup = {
      ...group,
      items: [...group.items],
      children: [...group.children],
    };

    await provider.deleteGroup(g1!);
    strictEqual(provider.getGroups().length, 0);

    // Restore — mimics undoDelete logic
    const restored = await provider.addGroup(backup.label as string, backup.colorName);
    for (const tab of backup.items) {
      if (tab.resourceUri) {
        await provider.addToGroup(restored!, tab.resourceUri.fsPath, false);
      }
    }

    const restoredGroup = provider.findGroupById(restored!)!;
    strictEqual(restoredGroup.items.length, 3);
    const paths = restoredGroup.items.map((i) => i.resourceUri?.fsPath);
    ok(paths.includes('/tmp/file1'));
    ok(paths.includes('/tmp/file2'));
    ok(paths.includes('/tmp/file3'));
  });

  it('restores a deleted group with nested children and their tabs', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('Parent');
    await provider.addToGroup(g1!, '/tmp/parent-file');
    const c1 = await provider.addSubGroup(g1!, 'Child');
    await provider.addToGroup(c1!, '/tmp/child-file1');
    await provider.addToGroup(c1!, '/tmp/child-file2');
    const gc1 = await provider.addSubGroup(c1!, 'Grandchild');
    await provider.addToGroup(gc1!, '/tmp/grandchild-file');
    provider.clearRefreshInterval();

    const group = provider.findGroupById(g1!)!;
    // Capture deep backup
    const backupItems = [...group.items];
    const backupChildren = group.children.map((c) => ({
      label: c.label as string,
      colorName: c.colorName,
      items: [...c.items],
      children: c.children.map((gc) => ({
        label: gc.label as string,
        colorName: gc.colorName,
        items: [...gc.items],
        children: [] as any[],
      })),
    }));

    await provider.deleteGroup(g1!);
    strictEqual(provider.getGroups().length, 0);

    // Restore recursively — mimics undoDelete restoreTabsToGroup logic
    const restored = await provider.addGroup(group.label as string, group.colorName);
    for (const tab of backupItems) {
      if (tab.resourceUri) {
        await provider.addToGroup(restored!, tab.resourceUri.fsPath, false);
      }
    }
    for (const child of backupChildren) {
      const childId = await provider.addSubGroup(restored!, child.label, child.colorName);
      for (const tab of child.items) {
        if (tab.resourceUri) {
          await provider.addToGroup(childId!, tab.resourceUri.fsPath, false);
        }
      }
      for (const gc of child.children) {
        const gcId = await provider.addSubGroup(childId!, gc.label, gc.colorName);
        for (const tab of gc.items) {
          if (tab.resourceUri) {
            await provider.addToGroup(gcId!, tab.resourceUri.fsPath, false);
          }
        }
      }
    }

    const restoredGroup = provider.findGroupById(restored!)!;
    strictEqual(restoredGroup.items.length, 1, 'Parent should have 1 tab');
    strictEqual(restoredGroup.children.length, 1, 'Parent should have 1 child');

    const restoredChild = restoredGroup.children[0];
    strictEqual(restoredChild.label, 'Child');
    strictEqual(restoredChild.items.length, 2, 'Child should have 2 tabs');

    strictEqual(restoredChild.children.length, 1, 'Child should have 1 grandchild');
    const restoredGrandchild = restoredChild.children[0];
    strictEqual(restoredGrandchild.label, 'Grandchild');
    strictEqual(restoredGrandchild.items.length, 1, 'Grandchild should have 1 tab');
  });
});

describe('Nested Groups - deleteGroup does not cascade to parent', () => {
  it('keeps parent when nested child is deleted', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('Parent');
    const g2 = await provider.addSubGroup(g1!, 'Child');
    await provider.addToGroup(g2!, '/tmp/file1');
    provider.clearRefreshInterval();

    await provider.deleteGroup(g2!);

    ok(provider.findGroupById(g1!), 'Parent should still exist');
    strictEqual(provider.findGroupById(g1!)!.children.length, 0);
    strictEqual(provider.findGroupById(g2!), undefined, 'Child should be deleted');
  });

  it('keeps empty parent when its only child is deleted', async () => {
    const provider = new TabstronautDataProvider(new MockMemento({}));
    const g1 = await provider.addGroup('EmptyParent');
    const g2 = await provider.addSubGroup(g1!, 'Child');
    await provider.addToGroup(g2!, '/tmp/file1');
    provider.clearRefreshInterval();

    await provider.deleteGroup(g2!);

    ok(provider.findGroupById(g1!), 'Empty parent should still exist');
    strictEqual(provider.findGroupById(g1!)!.children.length, 0);
    strictEqual(provider.findGroupById(g1!)!.items.length, 0);
  });
});
