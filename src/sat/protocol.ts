export interface Query {
  jobId: number;
  variableCount: number;
  clauses: number[][];
  previous: number[];
  maxResults: number;
  candidate?: number;
  conflictLimit: number;
}
export type SatMessage =
  | { jobId: number; kind: 'candidate'; key: number; count: number }
  | { jobId: number; kind: 'done'; status: 'SAT' | 'UNSAT' | 'UNKNOWN' | 'CAP'; count: number; loadMs: number; clauseMs: number; solveMs: number; modelMs: number; totalMs: number }
  | { jobId: number; kind: 'error'; error: string };
