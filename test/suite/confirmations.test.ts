/// <reference types="mocha" />
import { strictEqual } from 'assert';
import * as vscode from 'vscode';
import { confirmIfRequired } from '../../src/groupOperations';

describe('confirmIfRequired', () => {
  let origShowQuickPick: any;
  let origGetConfig: any;

  beforeEach(() => {
    origShowQuickPick = vscode.window.showQuickPick;
    origGetConfig = vscode.workspace.getConfiguration;
  });

  afterEach(() => {
    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: origShowQuickPick,
      configurable: true,
    });
    Object.defineProperty(vscode.workspace, 'getConfiguration', {
      value: origGetConfig,
      configurable: true,
    });
  });

  function mockConfirmSetting(enabled: boolean) {
    Object.defineProperty(vscode.workspace, 'getConfiguration', {
      value: () => ({
        get: (key: string, defaultValue?: any) =>
          key === 'confirmRemoveAndClose' ? enabled : defaultValue,
      }),
      configurable: true,
    });
  }

  it('returns true immediately when confirmRemoveAndClose is off — no quick pick shown', async () => {
    mockConfirmSetting(false);
    let pickShown = false;
    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: () => { pickShown = true; return Promise.resolve(undefined); },
      configurable: true,
    });

    const result = await confirmIfRequired('Should not appear');
    strictEqual(result, true, 'should return true when confirmation is disabled');
    strictEqual(pickShown, false, 'quick pick should not be shown');
  });

  it('returns true when user picks "Yes"', async () => {
    mockConfirmSetting(true);
    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: () => Promise.resolve('Yes'),
      configurable: true,
    });

    const result = await confirmIfRequired('Proceed?');
    strictEqual(result, true);
  });

  it('returns false when user picks "No"', async () => {
    mockConfirmSetting(true);
    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: () => Promise.resolve('No'),
      configurable: true,
    });

    const result = await confirmIfRequired('Proceed?');
    strictEqual(result, false);
  });

  it('returns false when user dismisses without selecting (undefined)', async () => {
    mockConfirmSetting(true);
    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: () => Promise.resolve(undefined),
      configurable: true,
    });

    const result = await confirmIfRequired('Proceed?');
    strictEqual(result, false);
  });

  it('passes the placeHolder text through to the quick pick', async () => {
    mockConfirmSetting(true);
    let capturedOptions: any;
    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: (_items: any, opts: any) => {
        capturedOptions = opts;
        return Promise.resolve(undefined);
      },
      configurable: true,
    });

    await confirmIfRequired('Are you sure about this action?');
    strictEqual(capturedOptions?.placeHolder, 'Are you sure about this action?');
  });

  it('offers exactly "Yes" and "No" as choices', async () => {
    mockConfirmSetting(true);
    let capturedItems: any;
    Object.defineProperty(vscode.window, 'showQuickPick', {
      value: (items: any) => {
        capturedItems = items;
        return Promise.resolve(undefined);
      },
      configurable: true,
    });

    await confirmIfRequired('Proceed?');
    strictEqual(JSON.stringify(capturedItems), JSON.stringify(['Yes', 'No']));
  });
});
