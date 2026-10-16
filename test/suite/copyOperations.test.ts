/// <reference types="mocha" />
import { strictEqual, ok } from 'assert';
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { execFileSync } from 'child_process';
import { extractRepoNameFromUrl, registerCopyCommands } from '../../src/copyOperations';
import { Group } from '../../src/models/Group';

describe('extractRepoNameFromUrl', () => {
  it('handles HTTPS, SSH and bare remotes', () => {
    strictEqual(extractRepoNameFromUrl('https://github.com/jhhtaylor/tabstronaut.git'), 'tabstronaut');
    strictEqual(extractRepoNameFromUrl('git@github.com:jhhtaylor/tabstronaut.git'), 'tabstronaut');
    strictEqual(extractRepoNameFromUrl('https://gitlab.com/group/sub/repo'), 'repo');
    strictEqual(extractRepoNameFromUrl('ssh://git@host:2222/team/repo.git'), 'repo');
    strictEqual(extractRepoNameFromUrl('https://github.com/user/repo/'), 'repo');
    strictEqual(extractRepoNameFromUrl('git@host:repo.git\n'), 'repo');
  });

  it('returns undefined for unparseable input', () => {
    strictEqual(extractRepoNameFromUrl(''), undefined);
  });
});

describe('copy commands', () => {
  let tmp: string;
  let repoFile: string;
  let plainFile: string;
  let warnings: string[];
  let origWarn: any;

  before(async () => {
    const registered = await vscode.commands.getCommands(true);
    if (!registered.includes('tabstronaut.copyPath')) {
      registerCopyCommands({ subscriptions: [] } as unknown as vscode.ExtensionContext);
    }
    tmp = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'tabstronaut-copy-')));
    const repo = path.join(tmp, 'local-folder-name');
    fs.mkdirSync(path.join(repo, 'src', 'deep'), { recursive: true });
    execFileSync('git', ['init', '-q'], { cwd: repo });
    execFileSync('git', ['remote', 'add', 'origin', 'git@github.com:someone/remote-name.git'], { cwd: repo });
    repoFile = path.join(repo, 'src', 'deep', 'my file.test.ts');
    fs.writeFileSync(repoFile, '');
    const plain = path.join(tmp, 'not-a-repo');
    fs.mkdirSync(plain);
    plainFile = path.join(plain, 'README');
    fs.writeFileSync(plainFile, '');
  });

  after(() => fs.rmSync(tmp, { recursive: true, force: true }));

  beforeEach(async () => {
    warnings = [];
    origWarn = vscode.window.showWarningMessage;
    (vscode.window as any).showWarningMessage = (msg: string) => { warnings.push(msg); return Promise.resolve(undefined); };
    await vscode.env.clipboard.writeText('unchanged');
  });
  afterEach(() => { (vscode.window as any).showWarningMessage = origWarn; });

  const tabItem = (file: string) => new Group('G', 'g').createTabItem(file);
  const run = async (command: string, arg: unknown) => {
    await vscode.commands.executeCommand(`tabstronaut.${command}`, arg);
    return vscode.env.clipboard.readText();
  };

  it('copies file names with and without extension, keeping inner dots', async () => {
    strictEqual(await run('copyFileName', tabItem(repoFile)), 'my file.test');
    strictEqual(await run('copyFileNameWithExtension', tabItem(repoFile)), 'my file.test.ts');
    strictEqual(await run('copyFileName', tabItem(plainFile)), 'README');
  });

  it('copies the full path', async () => {
    strictEqual(await run('copyPath', tabItem(repoFile)), repoFile);
  });

  it('falls back to the full path for files outside the workspace', async () => {
    strictEqual(await run('copyRelativePath', tabItem(repoFile)), repoFile);
    strictEqual(await run('copyAtMention', tabItem(repoFile)), `@${repoFile}`);
  });

  it('uses the remote name, not the folder name, for the repo name', async () => {
    strictEqual(await run('copyRepoName', tabItem(repoFile)), 'remote-name');
    strictEqual(await run('copyRepoPath', tabItem(repoFile)), path.join(tmp, 'local-folder-name'));
  });

  it('warns instead of guessing when a file is not in a repo or workspace', async () => {
    strictEqual(await run('copyRepoName', tabItem(plainFile)), 'unchanged');
    strictEqual(warnings.length, 1);
  });

  it('still gives a repo answer for files that were deleted from disk', async () => {
    const gone = path.join(tmp, 'local-folder-name', 'removed-dir', 'gone.ts');
    strictEqual(await run('copyFileNameWithExtension', tabItem(gone)), 'gone.ts');
    strictEqual(await run('copyRepoName', tabItem(gone)), 'remote-name');
  });

  it('accepts a plain Uri argument', async () => {
    strictEqual(await run('copyFileNameWithExtension', vscode.Uri.file(repoFile)), 'my file.test.ts');
  });

  it('refuses non-file editors rather than copying a bogus path', async () => {
    strictEqual(await run('copyPath', vscode.Uri.parse('untitled:Untitled-1')), 'unchanged');
    strictEqual(warnings.length, 1);
  });

  it('copies every file in a group, including sub-groups and snapshot panes', async () => {
    const group = new Group('Parent', 'p');
    group.addItem(repoFile);
    const pane = new Group('Pane 1', 'p-pane');
    pane.contextValue = 'snapshotColumn';
    pane.addItem(plainFile);
    group.children.push(pane);

    strictEqual(await run('copyGroupFilePaths', group), `${repoFile}\n${plainFile}`);
    strictEqual(await run('copyGroupFilePaths', pane), plainFile);
  });

  it('warns on an empty group and ignores non-group arguments', async () => {
    strictEqual(await run('copyGroupFilePaths', new Group('Empty', 'e')), 'unchanged');
    strictEqual(warnings.length, 1);
    strictEqual(await run('copyGroupFilePaths', undefined), 'unchanged');
    ok(warnings.length === 1);
  });
});
