import { getPermutation } from '../crypto/permutation.ts';
import { getSbox } from '../crypto/sbox.ts';

export interface Pair { readonly plain: number; readonly cipher: number }
export interface Gate {
  readonly kind: 'xor' | 'sbox' | 'final';
  readonly label: string;
  readonly inputs: readonly number[];
  readonly outputs: readonly number[];
  readonly clauseStart: number;
  readonly clauseCount: number;
}
export interface Formula {
  readonly variableCount: number;
  readonly clauses: readonly (readonly number[])[];
  readonly wires: readonly string[];
  readonly gates: readonly Gate[];
}

function byte(value: number, name: string): void {
  if (!Number.isInteger(value) || value < 0 || value > 255) throw new RangeError(`${name} must be a byte`);
}
export function validatePairs(pairs: readonly Pair[], rounds: number): void {
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 6) throw new RangeError('Rounds must be 1–6');
  if (pairs.length < 1 || pairs.length > 8) throw new RangeError('Observed pairs must number 1–8');
  const seen = new Set<number>();
  for (const pair of pairs) {
    byte(pair.plain, 'Plaintext'); byte(pair.cipher, 'Ciphertext');
    if (seen.has(pair.plain)) throw new RangeError('Observed plaintexts must be distinct');
    seen.add(pair.plain);
  }
}

const keyWire = (round: number, bit: number): number => 1 + ((bit - 4 * round + 64) % 16);

export function xorClauses(a: number, b: number, z: number): number[][] {
  if (!a || !b || !z) throw new RangeError('XOR literals must be nonzero');
  return [[a, b, -z], [a, -b, z], [-a, b, z], [-a, -b, -z]];
}

export function encode(pairs: readonly Pair[], rounds: number): Formula {
  validatePairs(pairs, rounds);
  const clauses: number[][] = [];
  const wires: string[] = ['unused index 0'];
  const gates: Gate[] = [];
  for (let bit = 0; bit < 16; bit++) wires.push(`master key bit ${bit}`);
  const alloc = (name: string): number => { wires.push(name); return wires.length - 1; };
  const sbox = getSbox('weak').table;
  const permutation = getPermutation();

  pairs.forEach((pair, pairIndex) => {
    let state = Array.from({ length: 8 }, (_, bit) =>
      ((pair.plain >> bit) & 1) ? -keyWire(0, bit) : keyWire(0, bit));
    for (let round = 0; round < rounds; round++) {
      if (round > 0) {
        state = state.map((a, bit) => {
          const b = keyWire(round, bit);
          const z = alloc(`pair ${pairIndex + 1} round ${round + 1} XOR bit ${bit}`);
          const start = clauses.length;
          // [extension] point: a future solver may accept native XOR constraints.
          clauses.push(...xorClauses(a, b, z));
          gates.push({ kind: 'xor', label: `Pair ${pairIndex + 1}, round ${round + 1}, bit ${bit}`, inputs: [a, b], outputs: [z], clauseStart: start, clauseCount: 4 });
          return z;
        });
      }
      const substituted: number[] = [];
      for (let nibble = 0; nibble < 2; nibble++) {
        const input = state.slice(nibble * 4, nibble * 4 + 4);
        const output = Array.from({ length: 4 }, (_, bit) => alloc(`pair ${pairIndex + 1} round ${round + 1} S-box ${nibble} output bit ${bit}`));
        const start = clauses.length;
        // [extension] point: a different target S-box needs its own fixtures.
        for (let pattern = 0; pattern < 16; pattern++) {
          const mismatch = input.map((lit, bit) => ((pattern >> bit) & 1) ? -lit : lit);
          for (let bit = 0; bit < 4; bit++) clauses.push([...mismatch, ((sbox[pattern] >> bit) & 1) ? output[bit] : -output[bit]]);
        }
        gates.push({ kind: 'sbox', label: `Pair ${pairIndex + 1}, round ${round + 1}, ${nibble ? 'high' : 'low'} S-box`, inputs: input, outputs: output, clauseStart: start, clauseCount: 64 });
        substituted.push(...output);
      }
      if (round < rounds - 1) {
        state = Array<number>(8);
        for (let bit = 0; bit < 8; bit++) state[permutation[bit]] = substituted[bit];
      } else state = substituted;
    }
    for (let bit = 0; bit < 8; bit++) {
      const a = state[bit], b = keyWire(rounds, bit), c = (pair.cipher >> bit) & 1;
      const start = clauses.length;
      if (c === 0) clauses.push([-a, b], [a, -b]);
      else clauses.push([a, b], [-a, -b]);
      gates.push({ kind: 'final', label: `Pair ${pairIndex + 1}, ciphertext bit ${bit}`, inputs: [a, b], outputs: [], clauseStart: start, clauseCount: 2 });
    }
  });
  return { variableCount: wires.length - 1, clauses, wires, gates };
}

export function toDimacs(formula: Formula, label = 'Observed pairs only'): string {
  const lines = [`c SAT Break: ${label}`];
  for (let i = 1; i < formula.wires.length; i++) lines.push(`c var ${i} ${formula.wires[i]}`);
  lines.push(`p cnf ${formula.variableCount} ${formula.clauses.length}`);
  for (const clause of formula.clauses) lines.push(`${clause.join(' ')} 0`);
  return lines.join('\n') + '\n';
}

export function blockingClause(key: number): number[] {
  if (!Number.isInteger(key) || key < 0 || key > 0xffff) throw new RangeError('Key must be a 16-bit integer');
  return Array.from({ length: 16 }, (_, bit) => ((key >> bit) & 1) ? -(bit + 1) : bit + 1);
}
