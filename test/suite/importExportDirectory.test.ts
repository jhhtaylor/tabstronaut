import { strictEqual } from 'assert';
import * as vscode from 'vscode';
import * as path from 'path';
import { TabstronautDataProvider } from '../../src/tabstronautDataProvider';

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

describe('TabstronautDataProvider.getImportExportDirectory', () => {
  let originalWorkspaceFolders: typeof vscode.workspace.workspaceFolders;
  let originalGetConfiguration: typeof vscode.workspace.getConfiguration;

  beforeEach(() => {
    originalWorkspaceFolders = vscode.workspace.workspaceFolders;
    originalGetConfiguration = vscode.workspace.getConfiguration;
  });

  afterEach(() => {
    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
      value: originalWorkspaceFolders,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(vscode.workspace, 'getConfiguration', {
      value: originalGetConfiguration,
      writable: true,
      configurable: true,
    });
  });

  it('returns workspace root when no configuration is set', () => {
    const workspaceUri = vscode.Uri.file('/workspace/root');
    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
      value: [{ uri: workspaceUri }],
      writable: true,
      configurable: true,
    });
    Object.defineProperty(vscode.workspace, 'getConfiguration', {
      value: () => ({
        get: (key: string, defaultValue?: any) => defaultValue,
      }),
      writable: true,
      configurable: true,
    });

    const memento = new MockMemento({});
    const provider = new TabstronautDataProvider(memento);
    const directory = (provider as any).getImportExportDirectory();
    provider.clearRefreshInterval();

    strictEqual(directory, '/workspace/root');
  });

  it('returns absolute path when configured with absolute path', () => {
    const absolutePath = '/tmp/tab-groups';
    Object.defineProperty(vscode.workspace, 'getConfiguration', {
      value: () => ({
        get: (key: string, defaultValue?: any) => {
          if (key === 'importExportDirectory') {
            return absolutePath;
          }
          return defaultValue;
        },
      }),
      writable: true,
      configurable: true,
    });

    const memento = new MockMemento({});
    const provider = new TabstronautDataProvider(memento);
    const directory = (provider as any).getImportExportDirectory();
    provider.clearRefreshInterval();

    strictEqual(directory, absolutePath);
  });

  it('resolves relative path from workspace root', () => {
    const workspaceUri = vscode.Uri.file('/workspace/root');
    const relativePath = 'tab-groups';
    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
      value: [{ uri: workspaceUri }],
      writable: true,
      configurable: true,
    });
    Object.defineProperty(vscode.workspace, 'getConfiguration', {
      value: () => ({
        get: (key: string, defaultValue?: any) => {
          if (key === 'importExportDirectory') {
            return relativePath;
          }
          return defaultValue;
        },
      }),
      writable: true,
      configurable: true,
    });

    const memento = new MockMemento({});
    const provider = new TabstronautDataProvider(memento);
    const directory = (provider as any).getImportExportDirectory();
    provider.clearRefreshInterval();

    strictEqual(directory, path.resolve('/workspace/root', relativePath));
  });

  it('resolves parent directory path correctly', () => {
    const workspaceUri = vscode.Uri.file('/workspace/root/project');
    const relativePath = '../shared-tabs';
    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
      value: [{ uri: workspaceUri }],
      writable: true,
      configurable: true,
    });
    Object.defineProperty(vscode.workspace, 'getConfiguration', {
      value: () => ({
        get: (key: string, defaultValue?: any) => {
          if (key === 'importExportDirectory') {
            return relativePath;
          }
          return defaultValue;
        },
      }),
      writable: true,
      configurable: true,
    });

    const memento = new MockMemento({});
    const provider = new TabstronautDataProvider(memento);
    const directory = (provider as any).getImportExportDirectory();
    provider.clearRefreshInterval();

    strictEqual(directory, '/workspace/root/shared-tabs');
  });

  it('handles Windows-style absolute paths on Windows platform', () => {
    // Note: This test verifies the behavior is platform-specific
    // On Windows: C:\Temp is absolute and returned as-is
    // On Unix/Mac: C:\Temp is NOT absolute and treated as relative
    const windowsPath = 'C:\\Temp\\TabGroups';
    const workspaceUri = vscode.Uri.file('/workspace/root');

    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
      value: [{ uri: workspaceUri }],
      writable: true,
      configurable: true,
    });
    Object.defineProperty(vscode.workspace, 'getConfiguration', {
      value: () => ({
        get: (key: string, defaultValue?: any) => {
          if (key === 'importExportDirectory') {
            return windowsPath;
          }
          return defaultValue;
        },
      }),
      writable: true,
      configurable: true,
    });

    const memento = new MockMemento({});
    const provider = new TabstronautDataProvider(memento);
    const directory = (provider as any).getImportExportDirectory();
    provider.clearRefreshInterval();

    // On Windows, path.isAbsolute('C:\\Temp') returns true, so it returns the path as-is
    // On Unix/Mac, path.isAbsolute('C:\\Temp') returns false, so it's resolved relative to workspace
    const isWindows = path.sep === '\\';
    if (isWindows) {
      strictEqual(directory, windowsPath);
    } else {
      // On Unix, this will be treated as a relative path
      strictEqual(directory, path.resolve('/workspace/root', windowsPath));
    }
  });

  it('falls back to home directory when no workspace is open', () => {
    const homeDir = require('os').homedir();
    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
      value: undefined,
      writable: true,
      configurable: true,
    });
    Object.defineProperty(vscode.workspace, 'getConfiguration', {
      value: () => ({
        get: (key: string, defaultValue?: any) => defaultValue,
      }),
      writable: true,
      configurable: true,
    });

    const memento = new MockMemento({});
    const provider = new TabstronautDataProvider(memento);
    const directory = (provider as any).getImportExportDirectory();
    provider.clearRefreshInterval();

    strictEqual(directory, homeDir);
  });

  it('handles empty string configuration by using workspace root', () => {
    const workspaceUri = vscode.Uri.file('/workspace/root');
    Object.defineProperty(vscode.workspace, 'workspaceFolders', {
      value: [{ uri: workspaceUri }],
      writable: true,
      configurable: true,
    });
    Object.defineProperty(vscode.workspace, 'getConfiguration', {
      value: () => ({
        get: (key: string, defaultValue?: any) => {
          if (key === 'importExportDirectory') {
            return '   '; // Whitespace-only string
          }
          return defaultValue;
        },
      }),
      writable: true,
      configurable: true,
    });

    const memento = new MockMemento({});
    const provider = new TabstronautDataProvider(memento);
    const directory = (provider as any).getImportExportDirectory();
    provider.clearRefreshInterval();

    strictEqual(directory, '/workspace/root');
  });
});
