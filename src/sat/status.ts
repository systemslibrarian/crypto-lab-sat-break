export type SolveStatus = 'SAT' | 'UNSAT' | 'UNKNOWN';

export function statusFromCode(code: number): SolveStatus {
  if (code === 10) return 'SAT';
  if (code === 20) return 'UNSAT';
  if (code === 0) return 'UNKNOWN';
  throw new Error(`Unknown CaDiCaL return code ${code}`);
}
