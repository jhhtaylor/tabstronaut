/// <reference types="mocha" />
import { strictEqual, ok } from 'assert';
import { TIPS, getCurrentTip } from '../../src/tips';

describe('tips', () => {
  it('has a healthy number of tips, each a clean single sentence', () => {
    ok(TIPS.length >= 50, `expected at least 50 tips, got ${TIPS.length}`);
    for (const tip of TIPS) {
      ok(tip.trim().length > 0, 'tip should not be empty');
      strictEqual(tip, tip.trim(), 'tip should not have leading/trailing whitespace');
      ok(!tip.endsWith('.'), `tip should not end with a period: "${tip}"`);
    }
  });

  it('has no duplicate tips', () => {
    strictEqual(new Set(TIPS).size, TIPS.length);
  });

  it('picks a tip deterministically based on the current hour', () => {
    const expectedIndex = Math.floor(Date.now() / 3600000) % TIPS.length;
    strictEqual(getCurrentTip(), TIPS[expectedIndex]);
  });

  it('always returns one of the known tips', () => {
    ok(TIPS.includes(getCurrentTip()));
  });
});
