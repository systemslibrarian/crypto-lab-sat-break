/// <reference lib="webworker" />
import { encrypt, generateKey } from '../crypto/spn.ts';
import { getSbox } from '../crypto/sbox.ts';
import { validatePairs, type Pair } from '../cnf/encode.ts';

interface ExhaustiveQuery { jobId: number; pairs: Pair[]; rounds: number; firstOnly: boolean }
const weak = getSbox('weak');
self.onmessage = (event: MessageEvent<ExhaustiveQuery>) => {
  const { jobId, pairs, rounds, firstOnly } = event.data;
  try {
    validatePairs(pairs, rounds);
    const started = performance.now();
    const keys: number[] = [];
    for (let key = 0; key < 65536; key++) {
      const schedule = generateKey(key);
      if (pairs.every(pair => encrypt(pair.plain, schedule, weak, rounds) === pair.cipher)) {
        keys.push(key);
        if (firstOnly) break;
      }
    }
    self.postMessage({ jobId, kind: 'done', keys, elapsedMs: performance.now() - started, firstOnly });
  } catch (error) {
    self.postMessage({ jobId, kind: 'error', error: error instanceof Error ? error.message : String(error) });
  }
};
