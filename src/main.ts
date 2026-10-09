import './style.css';
import { encode, toDimacs, type Formula } from './cnf/encode.ts';
import { fourRoundExample, oneRoundExample, publicEvidence, randomExperiment, type Experiment } from './experiment.ts';
import { checkPairs, codebookEqual } from './verify.ts';
import { generateKey, traceEncryption } from './crypto/spn.ts';
import { getSbox } from './crypto/sbox.ts';
import type { Pair } from './cnf/encode.ts';
import type { Query, SatMessage } from './sat/protocol.ts';
import { isCurrentJob } from './sat/jobs.ts';

const app = document.querySelector<HTMLElement>('#app');
if (!app) throw new Error('Missing app mount');
app.innerHTML = `
<main class="shell">
  <header class="cl-hero">
    <div class="cl-hero-main"><h1 class="cl-hero-title">SAT Break</h1><p class="cl-hero-sub">Toy SPN · Boolean constraints · SAT key search</p>
    <p class="cl-hero-desc">Turn a small cipher into clauses, ask a real SAT solver for keys, and check what those keys actually explain.</p></div>
    <aside class="cl-hero-why" aria-label="Why it matters"><span class="cl-hero-why-label">WHY IT MATTERS</span><p class="cl-hero-why-text">A solver can find a key that fits every example you gave it. Whether that key is unique, works on unseen messages, or equals the original key takes separate evidence.</p></aside>
  </header>
  <nav class="chapter-nav" aria-label="Lab steps"><a href="#experiment">01 Experiment</a><a href="#encoding">02 Encode</a><a href="#solve">03 Solve</a><a href="#evidence">04 Verify</a><a href="#measure">05 Measure</a></nav>
  <section class="intro panel"><h2>What a SAT answer means</h2><p>A <strong>variable</strong> is one Boolean wire. A <strong>literal</strong> is a wire or its negation. A <strong>clause</strong> is an OR of literals; <strong>CNF</strong> is an AND of clauses. <strong>SAT</strong> means an assignment satisfies them all. <strong>UNSAT</strong> means no assignment does.</p><p class="scope">This is a teaching cipher with an 8-bit block and a 16-bit key. Exhaustive search is practical at this size. These results do not establish a practical attack on AES or another modern cipher.</p></section>
  <section id="experiment" class="panel"><div class="section-heading"><span class="step">01 / MEET THE CIPHER</span><h2>Choose the evidence</h2><p>The attack sees plaintext and ciphertext pairs. The original key stays outside the solver.</p></div>
    <div class="controls"><button id="fixture-four" type="button">Four-round example</button><button id="fixture-one" type="button">One-round equivalent keys</button><button id="random" type="button">Fresh random experiment</button></div>
    <div class="controls"><label>Rounds <select id="rounds">${[1,2,3,4,5,6].map(n=>`<option value="${n}" ${n===4?'selected':''}>${n}</option>`).join('')}</select></label><label>Observed pairs <select id="pair-count">${[1,2,3,4,5,6,7,8].map(n=>`<option value="${n}">${n}</option>`).join('')}</select></label><button id="add-pair" type="button">Add next observation</button><span id="experiment-kind" class="chip"></span></div>
    <div class="two-col"><div><h3>Observed pairs</h3><table><thead><tr><th scope="col">Plaintext</th><th scope="col">Ciphertext</th></tr></thead><tbody id="observed-rows"></tbody></table></div><div><h3>Withheld checks</h3><p id="withheld-summary"></p><p>Withheld means withheld from the attack worker, not protected from browser developer tools.</p><button id="reveal" type="button">Reveal original key</button><p id="revealed-key" class="key-display"></p></div></div>
    <details class="explorer"><summary>Explore a visible example key and round states</summary><div class="controls"><label>Example key (hex) <input id="trace-key" value="1234" inputmode="text" maxlength="4" pattern="[0-9A-Fa-f]{1,4}"></label><label>Plaintext (hex) <input id="trace-plain" value="00" inputmode="text" maxlength="2" pattern="[0-9A-Fa-f]{1,2}"></label><button id="trace-run" type="button">Show trace</button></div><p id="trace-error" role="status"></p><div id="trace-output" class="scroll-region" role="region" aria-label="Visible example cipher trace" tabindex="0"></div></details>
  </section>
  <section id="encoding" class="panel"><div class="section-heading"><span class="step">02 / TURN OPERATIONS INTO CLAUSES</span><h2>Inspect the actual circuit</h2><p>The same clauses displayed here go to CaDiCaL. The first 16 variables are the master-key bits.</p></div>
    <div class="stats"><div><strong id="variable-count"></strong><span>allocated variables</span></div><div><strong id="clause-count"></strong><span>base clauses</span></div><div><strong id="gate-count"></strong><span>gates to inspect</span></div></div>
    <div class="controls"><label>Operation <select id="gate-select"></select></label><button id="dimacs" type="button">Download base DIMACS</button></div>
    <p id="gate-wires" class="mono"></p><div class="controls"><label>Proposed input bits <input id="gate-input" type="number" min="0" max="15" value="0"></label><label>Proposed output bits <input id="gate-output" type="number" min="0" max="15" value="0"></label></div><p id="gate-verdict" role="status"></p><div id="gate-clauses" class="scroll-region mono" role="region" aria-label="Actual clauses for selected operation" tabindex="0"></div>
    <details><summary>Why two-input XOR needs four clauses</summary><p>Each clause forbids one invalid assignment to two inputs and one output. A parity constraint over m wires directly encoded without helper variables needs 2<sup>m−1</sup> clauses; chains of two-input XOR gates use a linear number of clauses.</p></details>
  </section>
  <section id="solve" class="panel"><div class="section-heading"><span class="step">03 / ASK THE SOLVER</span><h2>Find consistent keys</h2><p>CaDiCaL runs locally in a WebAssembly worker. Every returned key is checked by the direct cipher.</p></div>
    <div class="controls"><button id="solve-first" type="button" class="primary">Find a key</button><button id="solve-next" type="button">Find another key</button><button id="enumerate" type="button">Enumerate up to 512 more</button><button id="stop" type="button">Stop</button></div>
    <div class="controls"><label>Check a supplied key (hex) <input id="candidate-input" value="003F" inputmode="text" maxlength="4" pattern="[0-9A-Fa-f]{1,4}"></label><button id="check-candidate" type="button">Check supplied candidate with SAT</button></div>
    <p id="solve-status" role="status" class="status">Ready. The formula contains only observed pairs.</p><p id="timings" class="small"></p>
    <div class="two-col"><div><h3>Keys returned by SAT <span id="sat-count">0</span></h3><div class="scroll-region" role="region" aria-label="SAT candidate table" tabindex="0"><table><thead><tr><th scope="col">Key</th><th scope="col">Observed check</th><th scope="col">Inspect</th></tr></thead><tbody id="candidate-rows"></tbody></table></div><div class="controls"><button id="previous-page" type="button">Previous page</button><span id="page-label"></span><button id="next-page" type="button">Next page</button></div></div><div><h3>Independent exhaustive scan</h3><p>Try all 65,536 master keys against exactly the same observed pairs.</p><button id="run-exhaustive" type="button">Count all fitting keys</button><p id="exhaustive-status" role="status">Not run yet.</p><p id="set-comparison"></p></div></div>
  </section>
  <section id="evidence" class="panel"><div class="section-heading"><span class="step">04 / VERIFY THE CLAIM</span><h2>Check a candidate</h2><p id="selected-key">Select a solver candidate to see independent checks.</p></div><div id="verification"></div></section>
  <section id="measure" class="panel"><div class="section-heading"><span class="step">05 / MEASURE THE TASK</span><h2>Compare like with like</h2><p>Run five fresh SAT trials and five exhaustive trials on the selected public observations. The first-match task and complete-set task are separate.</p></div>
    <div class="controls"><label>Task <select id="benchmark-task"><option value="first">First matching key</option><option value="complete">Complete candidate set</option></select></label><button id="benchmark" type="button">Run five-trial benchmark</button></div><p id="benchmark-status" role="status">Run this explicitly when ready.</p><div id="benchmark-output"></div>
  </section>
  <section class="panel limits"><h2>What this does not claim</h2><p>A satisfying assignment fits the observed pairs. It may fail unseen pairs. Passing sampled unseen checks does not prove original-key identity. Even matching all 256 outputs can leave different master-key bits, as the one-round example shows.</p><p>This lab uses ordinary CNF and a real CDCL solver; it does not use native XOR reasoning, attack a modern cipher, or claim SAT always beats exhaustive search.</p><p>Source and build details are in the repository README and <a href="https://github.com/systemslibrarian/crypto-lab-sat-break/blob/main/docs/solver-build.md">solver provenance</a>.</p></section>
  <footer class="scripture-footer"><p>So whether you eat or drink or whatever you do, do it all for the glory of God. — 1 Corinthians 10:31</p></footer>
</main>`;

const byId = <T extends HTMLElement = HTMLElement>(id: string): T => {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Missing ${id}`);
  return element as T;
};
const say = (id: string, value: string): void => { byId(id).textContent = value; };
const hex = (number: number, width = 2): string => number.toString(16).toUpperCase().padStart(width, '0');
const parseHex = (value: string, width: number): number => {
  if (!new RegExp(`^[0-9a-fA-F]{1,${width}}$`).test(value.trim())) throw new Error(`Enter 1–${width} hexadecimal digits`);
  return parseInt(value.trim(), 16);
};
const weak = getSbox('weak');
let experiment: Experiment = fourRoundExample();
let observedCount = 1;
let evidence = publicEvidence(experiment, observedCount);
let formula: Formula = encode(evidence.observed, experiment.rounds);
let foundKeys: number[] = [];
let satComplete = false;
let exhaustiveKeys: number[] | undefined;
let selected: number | undefined;
let revealed = false;
let currentJob = 0;
let satWorker: Worker | undefined;
let exhaustiveWorker: Worker | undefined;
let watchdog: number | undefined;
let pageIndex = 0;
let cancelBenchmark: (() => void) | undefined;

function retire(reason: string): void {
  currentJob++;
  if (cancelBenchmark) say('benchmark-status', 'Benchmark stopped; measurements incomplete.');
  cancelBenchmark?.(); cancelBenchmark = undefined;
  satWorker?.terminate(); satWorker = undefined;
  exhaustiveWorker?.terminate(); exhaustiveWorker = undefined;
  if (watchdog !== undefined) clearTimeout(watchdog);
  watchdog = undefined;
  if (reason) say('solve-status', reason);
}
function resetQuery(reason: string): void {
  retire(reason);
  evidence = publicEvidence(experiment, observedCount);
  formula = encode(evidence.observed, experiment.rounds);
  foundKeys = []; satComplete = false; exhaustiveKeys = undefined; selected = undefined; pageIndex = 0; revealed = false;
  say('revealed-key', 'Original key is concealed until Reveal.');
  say('exhaustive-status', 'Not run yet.'); say('set-comparison', ''); say('timings', ''); say('benchmark-status', 'Run this explicitly when ready.');
  byId<HTMLSelectElement>('rounds').value = String(experiment.rounds);
  byId<HTMLSelectElement>('pair-count').value = String(observedCount);
  byId<HTMLButtonElement>('add-pair').disabled = observedCount >= 8;
  renderExperiment(); renderGateOptions(); renderCandidates(); renderVerification();
}
function renderExperiment(): void {
  say('experiment-kind', experiment.kind === 'four-round' ? 'Fixed four-round fixture' : experiment.kind === 'one-round' ? 'Fixed one-round fixture' : experiment.kind === 'random' ? 'Fresh random key' : 'Custom round count');
  byId('observed-rows').innerHTML = evidence.observed.map(pair => `<tr><td>${hex(pair.plain)}</td><td>${hex(pair.cipher)}</td></tr>`).join('');
  say('withheld-summary', `${evidence.withheld.length} distinct plaintexts held aside from the SAT query. Promoted observations are replaced in this pool.`);
  say('variable-count', String(formula.variableCount)); say('clause-count', String(formula.clauses.length)); say('gate-count', String(formula.gates.length));
}
function renderGateOptions(): void {
  const select = byId<HTMLSelectElement>('gate-select');
  const preferred = formula.gates.findIndex(gate => gate.kind === 'xor');
  select.innerHTML = formula.gates.map((gate, index) => `<option value="${index}">${gate.label}</option>`).join('');
  select.value = String(preferred < 0 ? 0 : preferred);
  renderGate();
}
function renderGate(): void {
  const gate = formula.gates[Number(byId<HTMLSelectElement>('gate-select').value)];
  if (!gate) return;
  const max = gate.kind === 'sbox' ? 15 : gate.kind === 'xor' ? 3 : 3;
  const outputMax = gate.kind === 'sbox' ? 15 : 1;
  const inputControl = byId<HTMLInputElement>('gate-input'), outputControl = byId<HTMLInputElement>('gate-output');
  inputControl.max = String(max); outputControl.max = String(outputMax);
  outputControl.disabled = gate.kind === 'final';
  const inValue = Math.min(max, Math.max(0, Number(inputControl.value) || 0));
  const outValue = Math.min(outputMax, Math.max(0, Number(outputControl.value) || 0));
  const assignments = new Map<number, boolean>();
  gate.inputs.forEach((lit, i) => assignments.set(Math.abs(lit), Boolean((inValue >> i) & 1) === (lit > 0)));
  gate.outputs.forEach((lit, i) => assignments.set(Math.abs(lit), Boolean((outValue >> i) & 1) === (lit > 0)));
  const gateClauses = formula.clauses.slice(gate.clauseStart, gate.clauseStart + gate.clauseCount);
  const evaluations = gateClauses.map(clause => clause.some(lit => {
    const value = assignments.get(Math.abs(lit));
    return value === undefined ? false : value === (lit > 0);
  }));
  const good = evaluations.filter(Boolean).length;
  say('gate-wires', `Inputs: ${gate.inputs.map(lit => `${lit} (${formula.wires[Math.abs(lit)]})`).join(', ')}${gate.outputs.length ? ` · Outputs: ${gate.outputs.join(', ')}` : ''}`);
  say('gate-verdict', `${good}/${gateClauses.length} actual clauses satisfied by this proposed assignment${good === gateClauses.length ? '.' : '; invalid assignment.'}`);
  byId('gate-clauses').innerHTML = gateClauses.map((clause, i) => `<div class="clause ${evaluations[i] ? 'pass' : 'fail'}"><span>${evaluations[i] ? '✓' : '×'}</span> (${clause.join(' ∨ ')})</div>`).join('');
}

function renderCandidates(): void {
  say('sat-count', String(foundKeys.length));
  const pages = Math.max(1, Math.ceil(foundKeys.length / 20));
  pageIndex = Math.min(pageIndex, pages - 1);
  const rows = foundKeys.slice(pageIndex * 20, pageIndex * 20 + 20);
  byId('candidate-rows').innerHTML = rows.length ? rows.map(key => `<tr><td class="mono">${hex(key,4)}</td><td>Fits observed pairs</td><td><button type="button" data-key="${key}">Inspect</button></td></tr>`).join('') : '<tr><td>None yet</td><td>Pending</td><td>No candidate to inspect</td></tr>';
  say('page-label', `Page ${pageIndex + 1} of ${pages}`);
  byId<HTMLButtonElement>('previous-page').disabled = pageIndex === 0;
  byId<HTMLButtonElement>('next-page').disabled = pageIndex >= pages - 1;
  renderSetComparison();
}
function renderSetComparison(): void {
  if (!exhaustiveKeys) return;
  if (!satComplete) { say('set-comparison', 'Counts are shown separately. SAT enumeration is incomplete, so set equality is unproved.'); return; }
  const a = [...foundKeys].sort((x,y)=>x-y), b = [...exhaustiveKeys].sort((x,y)=>x-y);
  const equal = a.length === b.length && a.every((key,i)=>key===b[i]);
  say('set-comparison', equal ? `Complete SAT set equals the exhaustive set: ${a.length} identical key values.` : 'ERROR: complete SAT key set differs from exhaustive search.');
}
function tableForPairs(pairs: readonly Pair[], key: number): string {
  const checks = checkPairs(key, pairs, experiment.rounds);
  return `<table><thead><tr><th scope="col">Plaintext</th><th scope="col">Expected</th><th scope="col">Computed</th><th scope="col">Check</th></tr></thead><tbody>${checks.map(item => `<tr><td>${hex(item.plain)}</td><td>${hex(item.cipher)}</td><td>${hex(item.computed)}</td><td>${item.pass ? '✓ Pass' : '× Fails'}</td></tr>`).join('')}</tbody></table>`;
}
function renderVerification(): void {
  if (selected === undefined) { say('selected-key', 'Select a solver candidate to see independent checks.'); byId('verification').replaceChildren(); return; }
  const key = selected;
  const observedChecks = checkPairs(key, evidence.observed, experiment.rounds);
  const withheldChecks = checkPairs(key, evidence.withheld, experiment.rounds);
  const observedPass = observedChecks.every(item => item.pass);
  const withheldPass = withheldChecks.every(item => item.pass);
  const fullMatch = codebookEqual(key, experiment.hiddenKey, experiment.rounds);
  say('selected-key', `Candidate ${hex(key,4)} · ${observedPass ? 'fits all observed pairs' : 'INTERNAL ERROR: fails observed pairs'}`);
  const identity = revealed ? (key === experiment.hiddenKey ? 'Matches original master-key bits.' : `Different master-key bits from ${hex(experiment.hiddenKey,4)}.`) : 'Original key bits remain concealed.';
  const limitation = fullMatch && key !== experiment.hiddenKey ? '<p class="limitation">Every encryption check passes. The original key bits still have not been uniquely identified.</p>' : '';
  byId('verification').innerHTML = `<div class="verdicts"><p class="${observedPass?'good':'bad'}">${observedPass?'✓':'×'} Candidate fits all observed pairs: ${observedPass?'yes':'no'}</p><p class="${withheldPass?'good':'bad'}">${withheldPass?'✓':'×'} Passes ${withheldChecks.length} withheld checks: ${withheldPass?'yes':'no'}</p><p class="${fullMatch?'good':'neutral'}">${fullMatch?'✓':'○'} Same complete encryption function (all 256 plaintexts): ${fullMatch?'yes':'no'}</p><p class="neutral">${identity}</p>${limitation}</div><div class="two-col"><div><h3>Observed verification</h3>${tableForPairs(evidence.observed,key)}</div><div><h3>Withheld verification</h3>${tableForPairs(evidence.withheld,key)}</div></div>`;
}

function startSat(mode: 'first' | 'next' | 'enumerate' | 'check'): void {
  retire('Starting SAT query…');
  const jobId = currentJob;
  let candidate: number | undefined;
  if (mode === 'check') {
    try { candidate = parseHex(byId<HTMLInputElement>('candidate-input').value, 4); }
    catch (error) { say('solve-status', String(error)); return; }
    selected = undefined; renderVerification();
  }
  if (mode === 'first') { foundKeys = []; satComplete = false; selected = undefined; pageIndex = 0; renderCandidates(); renderVerification(); }
  if (mode !== 'check' && satComplete) { say('solve-status', 'All consistent keys were already enumerated for this query.'); return; }
  const previous = mode === 'first' || mode === 'check' ? [] : [...foundKeys];
  const query: Query = { jobId, variableCount: formula.variableCount, clauses: formula.clauses.map(clause => [...clause]), previous, maxResults: mode === 'enumerate' ? 512 : 1, candidate, conflictLimit: 0 };
  const worker = new Worker(new URL('./workers/solve.ts', import.meta.url), { type: 'module' });
  satWorker = worker;
  const started = performance.now();
  watchdog = window.setTimeout(() => {
    if (jobId !== currentJob) return;
    retire(`Timeout after 30 seconds. At least ${foundKeys.length} keys found; enumeration incomplete.`);
    renderCandidates();
  }, 30_000);
  worker.onerror = event => { if (jobId === currentJob) { retire(`Solver load or worker error: ${event.message}`); } };
  worker.onmessage = (event: MessageEvent<SatMessage>) => {
    const message = event.data;
    if (!isCurrentJob(message.jobId, currentJob)) return;
    if (message.kind === 'error') { retire(`Solver error: ${message.error}`); return; }
    if (message.kind === 'candidate') {
      if (!checkPairs(message.key, evidence.observed, experiment.rounds).every(item=>item.pass)) { retire('INTERNAL ERROR: solver candidate fails direct observed-pair verification.'); return; }
      if (mode !== 'check') {
        if (foundKeys.includes(message.key)) { retire('INTERNAL ERROR: duplicate SAT key.'); return; }
        foundKeys.push(message.key); selected = message.key;
        if (foundKeys.length % 25 === 0) say('solve-status', `At least ${foundKeys.length} keys found; enumeration still running.`);
      } else selected = message.key;
      renderVerification();
    } else {
      if (watchdog !== undefined) clearTimeout(watchdog);
      watchdog = undefined; satWorker?.terminate(); satWorker = undefined;
      const elapsed = performance.now() - started;
      say('timings', `Worker startup + query ${elapsed.toFixed(1)} ms · WASM load ${message.loadMs.toFixed(1)} · clause loading ${message.clauseMs.toFixed(1)} · solving ${message.solveMs.toFixed(1)} · model extraction ${message.modelMs.toFixed(1)} ms.`);
      if (mode === 'check') {
        say('solve-status', message.status === 'UNSAT' ? `Supplied key ${hex(candidate!,4)} cannot fit these observed pairs (UNSAT).` : message.status === 'CAP' ? `Supplied key ${hex(candidate!,4)} is SAT for the observed pairs; direct checks follow below.` : `Candidate check ${message.status}; no success claim.`);
      } else if (message.status === 'UNSAT') {
        satComplete = true;
        say('solve-status', foundKeys.length ? `UNSAT after blocking: all ${foundKeys.length} consistent master keys found.` : 'INTERNAL ERROR: generated observations were UNSAT.');
      } else if (message.status === 'UNKNOWN') say('solve-status', `Solver returned UNKNOWN. At least ${foundKeys.length} keys found; enumeration incomplete.`);
      else say('solve-status', `At least ${foundKeys.length} keys found; enumeration incomplete (limit reached).`);
      renderCandidates(); renderVerification();
    }
  };
  worker.postMessage(query);
}

function runExhaustive(): void {
  exhaustiveWorker?.terminate();
  const worker = new Worker(new URL('./workers/exhaustive.ts', import.meta.url), { type: 'module' });
  exhaustiveWorker = worker;
  const jobId = currentJob;
  say('exhaustive-status', 'Scanning all 65,536 master keys…');
  worker.onerror = event => { if (jobId === currentJob) say('exhaustive-status', `Exhaustive worker error: ${event.message}`); worker.terminate(); };
  worker.onmessage = event => {
    if (jobId !== currentJob) return;
    worker.terminate(); exhaustiveWorker = undefined;
    if (event.data.kind === 'error') { say('exhaustive-status', event.data.error); return; }
    exhaustiveKeys = event.data.keys;
    say('exhaustive-status', `${exhaustiveKeys!.length} keys fit the observed pairs; full scan ${event.data.elapsedMs.toFixed(1)} ms.`);
    renderSetComparison();
  };
  worker.postMessage({ jobId, pairs: evidence.observed, rounds: experiment.rounds, firstOnly: false });
}

function trace(): void {
  try {
    const key = parseHex(byId<HTMLInputElement>('trace-key').value,4);
    const plain = parseHex(byId<HTMLInputElement>('trace-plain').value,2);
    say('trace-error', 'This visible example is separate from the hidden experiment key.');
    const stages = traceEncryption(plain, generateKey(key), weak, experiment.rounds);
    byId('trace-output').innerHTML = `<table><thead><tr><th scope="col">Stage</th><th scope="col">Byte</th></tr></thead><tbody>${stages.map(stage=>`<tr><td>${stage.label}</td><td>${hex(stage.state)}</td></tr>`).join('')}</tbody></table>`;
  } catch (error) { say('trace-error', String(error)); }
}

function downloadDimacs(): void {
  const blob = new Blob([toDimacs(formula)], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a'); link.href = url; link.download = 'sat-break-observed.cnf'; link.click();
  setTimeout(()=>URL.revokeObjectURL(url),1000);
}

const median = (samples: number[]): number => [...samples].sort((a,b)=>a-b)[Math.floor(samples.length/2)];
async function benchmark(): Promise<void> {
  retire('Benchmarking the selected public query…');
  const jobId = currentJob;
  const complete = byId<HTMLSelectElement>('benchmark-task').value === 'complete';
  const satSamples: number[] = [], exSamples: number[] = [];
  const fixture = evidence.observed.map(p=>`${hex(p.plain)}→${hex(p.cipher)}`).join(', ');
  let backgrounded = document.visibilityState !== 'visible';
  const markBackground = () => { if (document.visibilityState !== 'visible') backgrounded = true; };
  document.addEventListener('visibilitychange', markBackground);
  const trials = async (kind: 'sat' | 'exhaustive'): Promise<void> => {
    for (let trial = 0; trial < 6; trial++) {
      if (jobId !== currentJob) throw new Error('Benchmark stopped');
      say('benchmark-status', `${kind === 'sat' ? 'SAT' : 'Exhaustive'} ${trial === 0 ? 'warmup' : `trial ${trial}/5`}…`);
      const started = performance.now();
      const outcome = await new Promise<{ status: string; keys?: number[] }>((resolve,reject) => {
        const worker = kind === 'sat' ? new Worker(new URL('./workers/solve.ts',import.meta.url),{type:'module'}) : new Worker(new URL('./workers/exhaustive.ts',import.meta.url),{type:'module'});
        const candidateKeys: number[] = [];
        const cancel = () => { clearTimeout(timer); worker.terminate(); reject(new Error('Benchmark stopped')); };
        cancelBenchmark = cancel;
        const timer = window.setTimeout(()=>{cancelBenchmark=undefined;worker.terminate();reject(new Error('Benchmark trial timed out after 30 seconds'));},30_000);
        worker.onerror = event => {clearTimeout(timer);cancelBenchmark=undefined;worker.terminate();reject(new Error(event.message));};
        worker.onmessage = event => {
          if (event.data.kind === 'error') { clearTimeout(timer);cancelBenchmark=undefined;worker.terminate();reject(new Error(event.data.error)); }
          else if (event.data.kind === 'candidate') candidateKeys.push(event.data.key);
          else if (event.data.kind === 'done') { clearTimeout(timer);cancelBenchmark=undefined;worker.terminate();resolve({ ...event.data, keys: kind === 'sat' ? candidateKeys : event.data.keys }); }
        };
        if (kind === 'sat') worker.postMessage({ jobId, variableCount: formula.variableCount, clauses: formula.clauses.map(c=>[...c]), previous: [], maxResults: complete ? 65536 : 1, conflictLimit: 0 } satisfies Query);
        else worker.postMessage({ jobId, pairs: evidence.observed, rounds: experiment.rounds, firstOnly: !complete });
      });
      if (jobId !== currentJob) throw new Error('Benchmark stopped');
      if (kind === 'sat' && (complete ? outcome.status !== 'UNSAT' : outcome.status !== 'CAP')) throw new Error(`SAT benchmark incomplete: ${outcome.status}`);
      if (kind === 'sat' && (!outcome.keys?.length || !outcome.keys.every(key => checkPairs(key, evidence.observed, experiment.rounds).every(check => check.pass)))) throw new Error('SAT benchmark model failed direct verification');
      if (trial) (kind === 'sat' ? satSamples : exSamples).push(performance.now()-started);
    }
  };
  try {
    await trials('sat'); await trials('exhaustive');
    const display = (ms:number) => ms < .05 ? 'below timer resolution' : `${ms.toFixed(1)} ms`;
    const spread = (v:number[]) => `${display(Math.min(...v))}–${display(Math.max(...v))}`;
    say('benchmark-status', `Five measured repetitions per method completed for ${complete?'complete-set':'first-match'} task.`);
    byId('benchmark-output').innerHTML = `<table><thead><tr><th scope="col">Method</th><th scope="col">Median total elapsed</th><th scope="col">Range</th><th scope="col">Samples</th></tr></thead><tbody><tr><td>CaDiCaL WASM</td><td>${display(median(satSamples))}</td><td>${spread(satSamples)}</td><td>5</td></tr><tr><td>Exhaustive worker</td><td>${display(median(exSamples))}</td><td>${spread(exSamples)}</td><td>5</td></tr></tbody></table><p id="benchmark-meta" class="small"></p>`;
    say('benchmark-meta', `${navigator.userAgent} · CaDiCaL c607304 · ${experiment.rounds} rounds · ${observedCount} pairs · ${fixture}. Total includes worker startup and direct verification of SAT candidates. ${backgrounded ? 'Background tab detected; timings may be distorted.' : 'Tab remained visible during measurement.'}`);
  } catch (error) { if (jobId === currentJob) say('benchmark-status', `Benchmark incomplete: ${error instanceof Error ? error.message : String(error)}`); }
  finally { document.removeEventListener('visibilitychange', markBackground); }
}

byId('fixture-four').addEventListener('click',()=>{ experiment=fourRoundExample(); observedCount=1; resetQuery('Four-round fixture selected.'); });
byId('fixture-one').addEventListener('click',()=>{ experiment=oneRoundExample(); observedCount=1; resetQuery('One-round fixture selected. Try supplied candidate 1034.'); byId<HTMLInputElement>('candidate-input').value='1034'; });
byId('random').addEventListener('click',()=>{ experiment=randomExperiment(Number(byId<HTMLSelectElement>('rounds').value)); observedCount=1; resetQuery('Fresh random experiment selected.'); });
byId('rounds').addEventListener('change',()=>{ const rounds=Number(byId<HTMLSelectElement>('rounds').value); if (rounds!==experiment.rounds){ experiment={...experiment,kind:'custom',rounds};resetQuery('Round count changed; prior query retired.'); } });
byId('pair-count').addEventListener('change',()=>{ const count=Number(byId<HTMLSelectElement>('pair-count').value);if(count!==observedCount){observedCount=count;resetQuery('Observed evidence changed; prior query retired.');} });
byId('add-pair').addEventListener('click',()=>{if(observedCount<8){observedCount++;resetQuery('The next withheld example is now an observation; a replacement remains withheld.');}});
byId('reveal').addEventListener('click',()=>{revealed=true;say('revealed-key',`Original master key: ${hex(experiment.hiddenKey,4)}.`);renderVerification();});
byId('trace-run').addEventListener('click',trace);
byId('gate-select').addEventListener('change',renderGate);
byId('gate-input').addEventListener('input',renderGate);
byId('gate-output').addEventListener('input',renderGate);
byId('dimacs').addEventListener('click',downloadDimacs);
byId('solve-first').addEventListener('click',()=>startSat('first'));
byId('solve-next').addEventListener('click',()=>startSat('next'));
byId('enumerate').addEventListener('click',()=>startSat('enumerate'));
byId('check-candidate').addEventListener('click',()=>startSat('check'));
byId('stop').addEventListener('click',()=>{
  if (satWorker || cancelBenchmark) retire(`Stopped. At least ${foundKeys.length} keys found; enumeration incomplete.`);
  else say('solve-status', satComplete ? `No query running. All ${foundKeys.length} consistent master keys were already found.` : `No query running. At least ${foundKeys.length} keys found; enumeration incomplete.`);
});
byId('run-exhaustive').addEventListener('click',runExhaustive);
byId('candidate-rows').addEventListener('click',event=>{const button=(event.target as HTMLElement).closest<HTMLButtonElement>('button[data-key]');if(button){selected=Number(button.dataset.key);renderVerification();}});
byId('previous-page').addEventListener('click',()=>{pageIndex--;renderCandidates();});
byId('next-page').addEventListener('click',()=>{pageIndex++;renderCandidates();});
byId('benchmark').addEventListener('click',()=>{void benchmark();});
resetQuery('Ready. The formula contains only observed pairs.');
trace();
