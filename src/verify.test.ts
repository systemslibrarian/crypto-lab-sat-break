import { expect, it } from 'vitest';
import { checkPairs, codebookEqual } from './verify.ts';

it('rejects a wrong candidate through direct encryption and distinguishes function from key bits', () => {
  expect(checkPairs(0x003f, [{ plain: 0, cipher: 0x0c }], 4)[0].pass).toBe(true);
  const wrong = checkPairs(0x003f, [{ plain: 0x3a, cipher: 0x33 }], 4)[0];
  expect(wrong.computed).toBe(0x26);
  expect(wrong.pass).toBe(false);
  expect(codebookEqual(0x1034, 0x1234, 1)).toBe(true);
  expect(codebookEqual(0x003f, 0x1234, 4)).toBe(false);
});
