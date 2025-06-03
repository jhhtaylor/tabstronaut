import { strictEqual } from 'assert';
import { generateNormalizedPath } from '../../src/utils';

describe('generateNormalizedPath', () => {
  it('converts backslashes to forward slashes and lowercases', () => {
    const result = generateNormalizedPath('C\\Users\\Foo');
    strictEqual(result, 'c:/users/foo');
  });

  it('removes trailing slashes', () => {
    const result = generateNormalizedPath('folder/subfolder/');
    strictEqual(result, 'folder/subfolder');
  });

  it('removes leading slashes', () => {
    const result = generateNormalizedPath('/Folder/Subfolder');
    strictEqual(result, 'folder/subfolder');
  });
});
