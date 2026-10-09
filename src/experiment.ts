import { encrypt, generateKey } from './crypto/spn.ts';
import { getSbox } from './crypto/sbox.ts';
import type { Pair } from './cnf/encode.ts';

export interface Experiment {
  readonly kind: 'four-round' | 'one-round' | 'random' | 'custom';
  readonly hiddenKey: number;
  readonly rounds: number;
  readonly plaintextOrder: readonly number[];
}

const weak = getSbox('weak');
const fixedOrder = [0x00, 0x3a, 0x5c, 0xff, 0x17, 0x80, 0xc2, 0x6d,
  0x01, 0x24, 0x4e, 0x7b, 0x93, 0xa5, 0xd0, 0xee];

export function fourRoundExample(): Experiment {
  return { kind: 'four-round', hiddenKey: 0x1234, rounds: 4, plaintextOrder: fixedOrder };
}
export function oneRoundExample(): Experiment {
  return { kind: 'one-round', hiddenKey: 0x1234, rounds: 1, plaintextOrder: fixedOrder };
}
export function randomExperiment(rounds: number): Experiment {
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 6) throw new RangeError('Rounds must be 1–6');
  const random = new Uint16Array(257);
  crypto.getRandomValues(random);
  const order = Array.from({ length: 256 }, (_, i) => i);
  for (let i = order.length - 1; i > 0; i--) {
    const j = random[i] % (i + 1);
    [order[i], order[j]] = [order[j], order[i]];
  }
  return { kind: 'random', hiddenKey: random[256], rounds, plaintextOrder: order.slice(0, 16) };
}

export function publicEvidence(experiment: Experiment, count: number): { observed: Pair[]; withheld: Pair[] } {
  if (!Number.isInteger(count) || count < 1 || count > 8) throw new RangeError('Observed pair count must be 1–8');
  const key = generateKey(experiment.hiddenKey);
  const toPair = (plain: number): Pair => ({ plain, cipher: encrypt(plain, key, weak, experiment.rounds) });
  return {
    observed: experiment.plaintextOrder.slice(0, count).map(toPair),
    withheld: experiment.plaintextOrder.slice(count, count + 8).map(toPair),
  };
}
