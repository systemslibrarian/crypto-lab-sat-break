/// <reference lib="webworker" />
import type { Query, SatMessage } from '../sat/protocol.ts';
import { statusFromCode } from '../sat/status.ts';

type Native = {
  _sat_new(): number;
  _sat_delete(ptr: number): void;
  _sat_add(ptr: number, lit: number): void;
  _sat_assume(ptr: number, lit: number): void;
  _sat_solve(ptr: number): number;
  _sat_val(ptr: number, variable: number): number;
  _sat_limit_conflicts(ptr: number, conflicts: number): number;
};

const send = (message: SatMessage) => self.postMessage(message);
// [extension] point: a second pinned solver can implement this Query/SatMessage
// boundary without changing the cipher, encoder, or direct verifier.
let nativePromise: Promise<Native> | undefined;
async function loadNative(): Promise<Native> {
  if (!nativePromise) {
    const url = new URL(`${import.meta.env.BASE_URL}cadical.mjs`, self.location.origin);
    nativePromise = import(/* @vite-ignore */ url.href).then(module => module.default({
      locateFile: (file: string) => new URL(file, url).href,
      print: () => {}, printErr: () => {},
    }) as Promise<Native>);
  }
  return nativePromise;
}

function addClause(native: Native, ptr: number, clause: readonly number[]): void {
  for (const lit of clause) native._sat_add(ptr, lit);
  native._sat_add(ptr, 0);
}

function validateQuery(q: Query): void {
  if (!Number.isInteger(q.jobId) || !Number.isInteger(q.variableCount) || q.variableCount < 16 ||
      !Number.isInteger(q.maxResults) || q.maxResults < 1 || q.maxResults > 65536 ||
      !Number.isInteger(q.conflictLimit) || q.conflictLimit < 0 ||
      q.previous.some(k => !Number.isInteger(k) || k < 0 || k > 65535)) throw new Error('Malformed SAT query');
  for (const clause of q.clauses) {
    if (!Array.isArray(clause) || clause.some(lit => !Number.isInteger(lit) || lit === 0 || Math.abs(lit) > q.variableCount)) throw new Error('Malformed clause');
  }
}

function keyFromModel(native: Native, ptr: number, used: Set<number>): number {
  const values = Array.from({ length: 16 }, (_, i) => native._sat_val(ptr, i + 1));
  let key = 0;
  const fixed: number[] = [];
  for (let bit = 0; bit < 16; bit++) {
    const value = values[bit];
    // Frozen yet unused variables may still get a default phase in CaDiCaL.
    // Complete those genuinely free bits explicitly as zero for this model.
    if (!used.has(bit + 1)) { fixed.push(-(bit + 1)); }
    else if (value === bit + 1) { key |= 1 << bit; fixed.push(bit + 1); }
    else if (value === -(bit + 1)) fixed.push(-(bit + 1));
    else if (value !== 0) throw new Error('Malformed SAT model value');
  }
  // CaDiCaL reports 0 for genuinely unused bits. A used but unresolved bit
  // needs a satisfiable completion; an arbitrary zero could omit keys.
  for (let bit = 0; bit < 16; bit++) {
    if (values[bit] !== 0 || !used.has(bit + 1)) continue;
    for (const lit of fixed) native._sat_assume(ptr, lit);
    native._sat_assume(ptr, -(bit + 1));
    let answer = native._sat_solve(ptr);
    if (answer === 10) fixed.push(-(bit + 1));
    else if (answer === 20) {
      for (const lit of fixed) native._sat_assume(ptr, lit);
      native._sat_assume(ptr, bit + 1);
      answer = native._sat_solve(ptr);
      if (answer !== 10) throw new Error('Unable to complete partial SAT model');
      fixed.push(bit + 1); key |= 1 << bit;
    } else throw new Error('SAT model completion interrupted');
  }
  return key;
}

self.onmessage = async (event: MessageEvent<Query>) => {
  const q = event.data;
  const started = performance.now();
  let ptr = 0;
  try {
    validateQuery(q);
    const native = await loadNative();
    const loaded = performance.now();
    ptr = native._sat_new();
    if (!ptr) throw new Error('CaDiCaL allocation failed');
    const used = new Set<number>();
    for (const clause of q.clauses) {
      for (const lit of clause) used.add(Math.abs(lit));
      addClause(native, ptr, clause);
    }
    for (const key of q.previous) {
      const clause = Array.from({ length: 16 }, (_, bit) => ((key >> bit) & 1) ? -(bit + 1) : bit + 1);
      clause.forEach(lit => used.add(Math.abs(lit)));
      addClause(native, ptr, clause);
    }
    const clausesLoaded = performance.now();
    let solveMs = 0, modelMs = 0, count = 0;
    const seen = new Set(q.previous);
    for (;;) {
      if (q.conflictLimit && !native._sat_limit_conflicts(ptr, q.conflictLimit)) throw new Error('Invalid conflict limit');
      if (q.candidate !== undefined) {
        if (!Number.isInteger(q.candidate) || q.candidate < 0 || q.candidate > 65535) throw new Error('Candidate must be a 16-bit key');
        for (let bit = 0; bit < 16; bit++) native._sat_assume(ptr, ((q.candidate >> bit) & 1) ? bit + 1 : -(bit + 1));
      }
      const solveStart = performance.now();
      const answer = native._sat_solve(ptr);
      solveMs += performance.now() - solveStart;
      const status = statusFromCode(answer);
      if (status !== 'SAT') {
        const ended = performance.now();
        send({ jobId: q.jobId, kind: 'done', status, count, loadMs: loaded - started, clauseMs: clausesLoaded - loaded, solveMs, modelMs, totalMs: ended - started });
        return;
      }
      const modelStart = performance.now();
      const key = keyFromModel(native, ptr, used);
      modelMs += performance.now() - modelStart;
      if (q.candidate !== undefined && key !== q.candidate) throw new Error('Candidate assumptions did not match model');
      if (seen.has(key)) throw new Error('Solver repeated a blocked key');
      seen.add(key); count++;
      send({ jobId: q.jobId, kind: 'candidate', key, count });
      if (q.candidate !== undefined || count >= q.maxResults) {
        const ended = performance.now();
        send({ jobId: q.jobId, kind: 'done', status: 'CAP', count, loadMs: loaded - started, clauseMs: clausesLoaded - loaded, solveMs, modelMs, totalMs: ended - started });
        return;
      }
      const block = Array.from({ length: 16 }, (_, bit) => ((key >> bit) & 1) ? -(bit + 1) : bit + 1);
      block.forEach(lit => used.add(Math.abs(lit)));
      addClause(native, ptr, block);
    }
  } catch (error) {
    send({ jobId: q.jobId, kind: 'error', error: error instanceof Error ? error.message : String(error) });
  } finally {
    if (ptr) (await loadNative())._sat_delete(ptr);
  }
};
