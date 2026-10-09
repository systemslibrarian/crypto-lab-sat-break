import { expect, it } from 'vitest';
import { statusFromCode } from './status.ts';

it('keeps interrupted/limited solving distinct from proof of UNSAT', () => {
  expect(statusFromCode(0)).toBe('UNKNOWN');
  expect(statusFromCode(10)).toBe('SAT');
  expect(statusFromCode(20)).toBe('UNSAT');
  expect(() => statusFromCode(7)).toThrow('Unknown CaDiCaL');
});
