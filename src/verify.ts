import { encrypt, generateKey } from './crypto/spn.ts';
import { getSbox } from './crypto/sbox.ts';
import type { Pair } from './cnf/encode.ts';

const weak = getSbox('weak');
export interface PairCheck extends Pair { readonly computed: number; readonly pass: boolean }
export function checkPairs(key: number, pairs: readonly Pair[], rounds: number): PairCheck[] {
  const cipherKey = generateKey(key);
  return pairs.map(pair => {
    const computed = encrypt(pair.plain, cipherKey, weak, rounds);
    return { ...pair, computed, pass: computed === pair.cipher };
  });
}
export function codebookEqual(a: number, b: number, rounds: number): boolean {
  const keyA = generateKey(a), keyB = generateKey(b);
  for (let plain = 0; plain < 256; plain++) {
    if (encrypt(plain, keyA, weak, rounds) !== encrypt(plain, keyB, weak, rounds)) return false;
  }
  return true;
}
