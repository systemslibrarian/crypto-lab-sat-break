import { expect, it } from 'vitest';
import { isCurrentJob } from './jobs.ts';

it('rejects an arriving result after the public query has been retired', () => {
  expect(isCurrentJob(41, 42)).toBe(false);
  expect(isCurrentJob(42, 42)).toBe(true);
});
