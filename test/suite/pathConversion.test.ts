import { strictEqual, deepStrictEqual } from 'assert';
import * as path from 'path';
import * as vscode from 'vscode';
import { TabstronautDataProvider } from '../../src/tabstronautDataProvider';

class MockMemento implements vscode.Memento {
  private store: Record<string, any>;
  constructor(initial: Record<string, any> = {}) { this.store = initial; }
  keys(): readonly string[] { throw new Error('not implemented'); }
  get<T>(key: string, defaultValue?: T): T {
    if (key in this.store) return this.store[key] as T;
    return defaultValue as T;
  }
  update(key: string, value: any): Thenable<void> {
    this.store[key] = value;
    return Promise.resolve();
  }
}

function makeProvider(): TabstronautDataProvider {
  return new TabstronautDataProvider(new MockMemento({}));
}

function workspaceFolder(name: string, fsPath: string): vscode.WorkspaceFolder {
  return { uri: vscode.Uri.file(fsPath), name, index: 0 } as vscode.WorkspaceFolder;
}

// Simulates VSCode's asRelativePath logic: strips the matching workspace-root
// prefix and, for multi-root workspaces when includeWorkspaceFolder is true,
// prepends the folder name.
function buildAsRelativePath(
  folders: vscode.WorkspaceFolder[] | undefined
): (p: string, includeFolder?: boolean) => string {
  return (p: string, includeFolder?: boolean): string => {
    if (!folders || folders.length === 0) return p;
    for (const f of folders) {
      const root = f.uri.fsPath;
      if (p.startsWith(root + '/')) {
        const rel = p.slice(root.length + 1);
        return includeFolder && folders.length > 1 ? `${f.name}/${rel}` : rel;
      }
    }
    return p;
  };
}

// Minimal group storage data factory
function groupData(items: any[], children: Record<string, any> = {}) {
  return {
    g1: {
      label: 'G',
      items,
      creationTime: new Date().toISOString(),
      colorName: 'terminal.ansiRed',
      children,
    },
  };
}

describe('path conversion helpers', () => {
  let savedWorkspaceFolders: typeof vscode.workspace.workspaceFolders;
  let savedAsRelativePath: typeof vscode.workspace.asRelativePath;

  beforeEach(() => {
    savedWorkspaceFolders = vscode.workspace.workspaceFolders;
    savedAsRelativePath = vscode.workspace.asRelativePath.bind(vscode.workspace);
  });

  afterEach(() => {
    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
      value: savedWorkspaceFolders,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(vscode.workspace, 'asRelativePath', {
      value: savedAsRelativePath,
      writable: true,
      configurable: true,
    });
  });

  function setWorkspace(folders: vscode.WorkspaceFolder[] | undefined) {
    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
      value: folders,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(vscode.workspace, 'asRelativePath', {
      value: buildAsRelativePath(folders),
      writable: true,
      configurable: true,
    });
  }

  // ─── convertItemPaths ────────────────────────────────────────────────────

  describe('convertItemPaths', () => {
    it('transforms string items', () => {
      setWorkspace([workspaceFolder('root', '/workspace')]);
      const provider = makeProvider();
      const input = groupData(['/workspace/a.ts']);
      const result = (provider as any).convertItemPaths(input, (p: string) => `X:${p}`);
      provider.clearRefreshInterval();
      strictEqual(result.g1.items[0], 'X:/workspace/a.ts');
    });

    it('transforms pinned object items', () => {
      setWorkspace([workspaceFolder('root', '/workspace')]);
      const provider = makeProvider();
      const input = groupData([{ path: '/workspace/a.ts', pinned: true }]);
      const result = (provider as any).convertItemPaths(input, (p: string) => `X:${p}`);
      provider.clearRefreshInterval();
      deepStrictEqual(result.g1.items[0], { path: 'X:/workspace/a.ts', pinned: true });
    });

    it('leaves items without a string path property unchanged', () => {
      setWorkspace([workspaceFolder('root', '/workspace')]);
      const provider = makeProvider();
      const unknown = { notAPath: 42 };
      const input = groupData([unknown]);
      const result = (provider as any).convertItemPaths(input, (p: string) => `X:${p}`);
      provider.clearRefreshInterval();
      deepStrictEqual(result.g1.items[0], unknown);
    });

    it('recurses into nested children', () => {
      setWorkspace([workspaceFolder('root', '/workspace')]);
      const provider = makeProvider();
      const child = {
        g2: {
          label: 'Child',
          items: ['/workspace/child.ts'],
          creationTime: new Date().toISOString(),
          colorName: 'terminal.ansiBlue',
          children: {},
        },
      };
      const input = groupData(['/workspace/parent.ts'], child);
      const result = (provider as any).convertItemPaths(input, (p: string) => `X:${p}`);
      provider.clearRefreshInterval();
      strictEqual(result.g1.items[0], 'X:/workspace/parent.ts');
      strictEqual(result.g1.children.g2.items[0], 'X:/workspace/child.ts');
    });

    it('handles empty items array', () => {
      setWorkspace([workspaceFolder('root', '/workspace')]);
      const provider = makeProvider();
      const input = groupData([]);
      const result = (provider as any).convertItemPaths(input, (p: string) => `X:${p}`);
      provider.clearRefreshInterval();
      deepStrictEqual(result.g1.items, []);
    });
  });

  // ─── makePathsRelative — single folder ───────────────────────────────────

  describe('makePathsRelative — single workspace folder', () => {
    it('converts absolute string items to relative', () => {
      setWorkspace([workspaceFolder('root', '/workspace')]);
      const provider = makeProvider();
      const input = groupData(['/workspace/src/a.ts']);
      const result = (provider as any).makePathsRelative(input);
      provider.clearRefreshInterval();
      strictEqual(result.g1.items[0], 'src/a.ts');
    });

    it('converts absolute pinned object items to relative', () => {
      setWorkspace([workspaceFolder('root', '/workspace')]);
      const provider = makeProvider();
      const input = groupData([{ path: '/workspace/src/a.ts', pinned: true }]);
      const result = (provider as any).makePathsRelative(input);
      provider.clearRefreshInterval();
      deepStrictEqual(result.g1.items[0], { path: 'src/a.ts', pinned: true });
    });

    it('leaves paths outside the workspace folder unchanged', () => {
      setWorkspace([workspaceFolder('root', '/workspace')]);
      const provider = makeProvider();
      const input = groupData(['/elsewhere/file.ts']);
      const result = (provider as any).makePathsRelative(input);
      provider.clearRefreshInterval();
      strictEqual(result.g1.items[0], '/elsewhere/file.ts');
    });

    it('converts paths in nested children', () => {
      setWorkspace([workspaceFolder('root', '/workspace')]);
      const provider = makeProvider();
      const child = {
        g2: {
          label: 'C',
          items: ['/workspace/child.ts'],
          creationTime: new Date().toISOString(),
          colorName: 'terminal.ansiBlue',
          children: {},
        },
      };
      const input = groupData(['/workspace/parent.ts'], child);
      const result = (provider as any).makePathsRelative(input);
      provider.clearRefreshInterval();
      strictEqual(result.g1.items[0], 'parent.ts');
      strictEqual(result.g1.children.g2.items[0], 'child.ts');
    });
  });

  // ─── makePathsRelative — no workspace ────────────────────────────────────

  describe('makePathsRelative — no workspace folders', () => {
    it('returns absolute paths unchanged when there is no open workspace', () => {
      setWorkspace(undefined);
      const provider = makeProvider();
      const input = groupData(['/home/user/project/file.ts']);
      const result = (provider as any).makePathsRelative(input);
      provider.clearRefreshInterval();
      strictEqual(result.g1.items[0], '/home/user/project/file.ts');
    });
  });

  // ─── makePathsRelative — multi-root ──────────────────────────────────────

  describe('makePathsRelative — multi-root workspace', () => {
    it('includes folder-name prefix for each root so the correct root is recoverable on import', () => {
      setWorkspace([
        workspaceFolder('alpha', '/ws/alpha'),
        workspaceFolder('beta', '/ws/beta'),
      ]);
      const provider = makeProvider();
      const input = groupData(['/ws/alpha/a.ts', '/ws/beta/b.ts']);
      const result = (provider as any).makePathsRelative(input);
      provider.clearRefreshInterval();
      strictEqual(result.g1.items[0], 'alpha/a.ts');
      strictEqual(result.g1.items[1], 'beta/b.ts');
    });

    it('leaves paths outside all workspace folders unchanged', () => {
      setWorkspace([
        workspaceFolder('alpha', '/ws/alpha'),
        workspaceFolder('beta', '/ws/beta'),
      ]);
      const provider = makeProvider();
      const input = groupData(['/elsewhere/file.ts']);
      const result = (provider as any).makePathsRelative(input);
      provider.clearRefreshInterval();
      strictEqual(result.g1.items[0], '/elsewhere/file.ts');
    });
  });

  // ─── makePathsAbsolute — single folder ───────────────────────────────────

  describe('makePathsAbsolute — single workspace folder', () => {
    it('resolves relative string items to absolute', () => {
      setWorkspace([workspaceFolder('root', '/workspace')]);
      const provider = makeProvider();
      const input = groupData(['src/a.ts']);
      const result = (provider as any).makePathsAbsolute(input);
      provider.clearRefreshInterval();
      strictEqual(result.g1.items[0], path.join('/workspace', 'src/a.ts'));
    });

    it('passes through already-absolute paths unchanged (backward compatibility with old exports)', () => {
      setWorkspace([workspaceFolder('root', '/workspace')]);
      const provider = makeProvider();
      const input = groupData(['/old/absolute/path.ts']);
      const result = (provider as any).makePathsAbsolute(input);
      provider.clearRefreshInterval();
      strictEqual(result.g1.items[0], '/old/absolute/path.ts');
    });

    it('resolves relative pinned object items to absolute', () => {
      setWorkspace([workspaceFolder('root', '/workspace')]);
      const provider = makeProvider();
      const input = groupData([{ path: 'src/a.ts', pinned: true }]);
      const result = (provider as any).makePathsAbsolute(input);
      provider.clearRefreshInterval();
      deepStrictEqual(result.g1.items[0], { path: path.join('/workspace', 'src/a.ts'), pinned: true });
    });

    it('resolves relative paths in nested children', () => {
      setWorkspace([workspaceFolder('root', '/workspace')]);
      const provider = makeProvider();
      const child = {
        g2: {
          label: 'C',
          items: ['child.ts'],
          creationTime: new Date().toISOString(),
          colorName: 'terminal.ansiBlue',
          children: {},
        },
      };
      const input = groupData(['parent.ts'], child);
      const result = (provider as any).makePathsAbsolute(input);
      provider.clearRefreshInterval();
      strictEqual(result.g1.items[0], path.join('/workspace', 'parent.ts'));
      strictEqual(result.g1.children.g2.items[0], path.join('/workspace', 'child.ts'));
    });
  });

  // ─── makePathsAbsolute — no workspace ────────────────────────────────────

  describe('makePathsAbsolute — no workspace folders', () => {
    it('returns the group data object unchanged when there is no open workspace', () => {
      setWorkspace(undefined);
      const provider = makeProvider();
      const input = groupData(['relative/path.ts']);
      const result = (provider as any).makePathsAbsolute(input);
      provider.clearRefreshInterval();
      // Same reference — nothing was processed
      strictEqual(result, input);
    });
  });

  // ─── makePathsAbsolute — multi-root ──────────────────────────────────────

  describe('makePathsAbsolute — multi-root workspace', () => {
    it('resolves folder-name-prefixed paths to the correct workspace root', () => {
      setWorkspace([
        workspaceFolder('alpha', '/ws/alpha'),
        workspaceFolder('beta', '/ws/beta'),
      ]);
      const provider = makeProvider();
      const input = groupData(['alpha/a.ts', 'beta/b.ts']);
      const result = (provider as any).makePathsAbsolute(input);
      provider.clearRefreshInterval();
      strictEqual(result.g1.items[0], path.join('/ws/alpha', 'a.ts'));
      strictEqual(result.g1.items[1], path.join('/ws/beta', 'b.ts'));
    });

    it('handles backslash separators in the prefix (Windows asRelativePath output)', () => {
      setWorkspace([
        workspaceFolder('alpha', '/ws/alpha'),
        workspaceFolder('beta', '/ws/beta'),
      ]);
      const provider = makeProvider();
      // Simulate a Windows-style relative path where asRelativePath used backslashes
      const input = groupData(['alpha\\src\\file.ts']);
      const result = (provider as any).makePathsAbsolute(input);
      provider.clearRefreshInterval();
      strictEqual(result.g1.items[0], path.join('/ws/alpha', 'src/file.ts'));
    });

    it('falls back to the first workspace folder when no prefix matches', () => {
      setWorkspace([
        workspaceFolder('alpha', '/ws/alpha'),
        workspaceFolder('beta', '/ws/beta'),
      ]);
      const provider = makeProvider();
      const input = groupData(['unknown/file.ts']);
      const result = (provider as any).makePathsAbsolute(input);
      provider.clearRefreshInterval();
      strictEqual(result.g1.items[0], path.join('/ws/alpha', 'unknown/file.ts'));
    });

    it('passes through absolute paths unchanged', () => {
      setWorkspace([
        workspaceFolder('alpha', '/ws/alpha'),
        workspaceFolder('beta', '/ws/beta'),
      ]);
      const provider = makeProvider();
      const input = groupData(['/old/absolute/path.ts']);
      const result = (provider as any).makePathsAbsolute(input);
      provider.clearRefreshInterval();
      strictEqual(result.g1.items[0], '/old/absolute/path.ts');
    });
  });

  // ─── round-trip ──────────────────────────────────────────────────────────

  describe('round-trip (export → import)', () => {
    it('single folder: makePathsRelative then makePathsAbsolute recovers original absolute paths', () => {
      setWorkspace([workspaceFolder('root', '/workspace')]);
      const provider = makeProvider();
      const original = groupData([
        '/workspace/src/a.ts',
        { path: '/workspace/src/b.ts', pinned: true },
      ]);
      const relative = (provider as any).makePathsRelative(original);
      const restored = (provider as any).makePathsAbsolute(relative);
      provider.clearRefreshInterval();
      strictEqual(restored.g1.items[0], '/workspace/src/a.ts');
      deepStrictEqual(restored.g1.items[1], { path: '/workspace/src/b.ts', pinned: true });
    });

    it('multi-root: makePathsRelative then makePathsAbsolute recovers original absolute paths', () => {
      setWorkspace([
        workspaceFolder('alpha', '/ws/alpha'),
        workspaceFolder('beta', '/ws/beta'),
      ]);
      const provider = makeProvider();
      const original = groupData(['/ws/alpha/a.ts', '/ws/beta/b.ts']);
      const relative = (provider as any).makePathsRelative(original);
      const restored = (provider as any).makePathsAbsolute(relative);
      provider.clearRefreshInterval();
      strictEqual(restored.g1.items[0], '/ws/alpha/a.ts');
      strictEqual(restored.g1.items[1], '/ws/beta/b.ts');
    });

    it('old absolute-path exports (pre-1.6.2) import correctly without path corruption', () => {
      setWorkspace([workspaceFolder('root', '/workspace')]);
      const provider = makeProvider();
      // Simulate a pre-1.6.2 export that stored absolute paths directly
      const oldExport = groupData(['/workspace/src/a.ts']);
      const restored = (provider as any).makePathsAbsolute(oldExport);
      provider.clearRefreshInterval();
      strictEqual(restored.g1.items[0], '/workspace/src/a.ts');
    });

    it('paths outside the workspace survive the round-trip unchanged', () => {
      setWorkspace([workspaceFolder('root', '/workspace')]);
      const provider = makeProvider();
      const original = groupData(['/external/tool/config.json']);
      const relative = (provider as any).makePathsRelative(original);
      // asRelativePath returns the absolute path unchanged for external files
      strictEqual(relative.g1.items[0], '/external/tool/config.json');
      const restored = (provider as any).makePathsAbsolute(relative);
      provider.clearRefreshInterval();
      strictEqual(restored.g1.items[0], '/external/tool/config.json');
    });
  });
});
