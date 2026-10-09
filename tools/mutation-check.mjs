// Mutation gate: prove each named safety claim has a failing owner.
// Run from the repo root with: node tools/mutation-check.mjs
import { execFileSync, spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const run = (command, args, env = {}) => {
  try {
    const output = execFileSync(command, args, { cwd: root, env: { ...process.env, ...env }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 240_000 });
    return { ok: true, output };
  } catch (error) {
    return { ok: false, output: `${error.stdout ?? ''}\n${error.stderr ?? ''}` };
  }
};
const sha = data => createHash('sha256').update(data).digest('hex');
const assetHash = () => {
  const files = readdirSync(join(root, 'dist/assets')).sort();
  return sha(Buffer.concat(files.map(file => readFileSync(join(root, 'dist/assets', file)))));
};
const replaceOnce = (source, before, after) => {
  if (source.split(before).length !== 2) throw new Error(`Mutation anchor missing or duplicated: ${before}`);
  return source.replace(before, after);
};
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

async function proveServedAsset() {
  const server = spawn('node', ['node_modules/vite/bin/vite.js', 'preview', '--port', '4216', '--strictPort'], { cwd: root, stdio: 'ignore' });
  try {
    let html;
    for (let attempt = 0; attempt < 50; attempt++) {
      try {
        const response = await fetch('http://localhost:4216/crypto-lab-sat-break/');
        if (response.ok) { html = await response.text(); break; }
      } catch { /* Wait for this owned preview process. */ }
      await delay(100);
    }
    if (!html) throw new Error('Mutated preview did not start');
    const path = html.match(/src="(\/crypto-lab-sat-break\/assets\/[^\"]+\.js)"/)?.[1];
    if (!path) throw new Error('No built script in served HTML');
    const served = Buffer.from(await (await fetch(`http://localhost:4216${path}`)).arrayBuffer());
    const local = readFileSync(join(root, 'dist/assets', path.split('/').at(-1)));
    if (sha(served) !== sha(local)) throw new Error('Served asset differs from mutated build');
    return sha(served).slice(0, 12);
  } finally {
    const stopped = new Promise(resolve => server.once('exit', resolve));
    server.kill('SIGTERM');
    await stopped;
  }
}

const unit = (file, name) => ['npx', ['vitest', 'run', file, '--reporter=dot', '-t', name]];
const browser = name => ['npx', ['playwright', 'test', '--project=claims', '--workers=1', '-g', name]];
const mutations = [
  {
    name: 'Flip an S-box output literal', file: 'src/cnf/encode.ts',
    changes: [['? output[bit] : -output[bit]', '? -output[bit] : output[bit]']],
    test: unit('src/cnf/encode.test.ts', 'accepts precisely the 16 valid S-box'),
  },
  {
    name: 'Use separate master-key variables for later pairs', file: 'src/cnf/encode.ts',
    changes: [
      ['const keyWire = (round: number, bit: number): number => 1 + ((bit - 4 * round + 64) % 16);', 'let pairKeyBase = 0;\nconst keyWire = (round: number, bit: number): number => pairKeyBase + 1 + ((bit - 4 * round + 64) % 16);'],
      ['pairs.forEach((pair, pairIndex) => {', 'pairs.forEach((pair, pairIndex) => {\n    if (pairIndex) { pairKeyBase = wires.length - 1; for (let bit = 0; bit < 16; bit++) alloc(`pair ${pairIndex + 1} private key bit ${bit}`); }'],
    ],
    test: unit('src/cnf/encode.test.ts', 'uses shared 16 key variables'),
  },
  {
    name: 'Hard-wire direct verification to accept', file: 'src/verify.ts',
    changes: [['const computed = encrypt(pair.plain, cipherKey, weak, rounds);', 'void cipherKey; void rounds; const computed = pair.cipher;']],
    test: unit('src/verify.test.ts', 'rejects a wrong candidate'),
  },
  {
    name: 'Check observed pairs instead of withheld pairs', file: 'src/main.ts',
    changes: [['const withheldChecks = checkPairs(key, evidence.withheld, experiment.rounds);', 'const withheldChecks = checkPairs(key, evidence.observed, experiment.rounds);']],
    test: browser('real WASM solver fits a public pair'),
  },
  {
    name: 'Drop the master-key blocking clause', file: 'src/workers/solve.ts',
    changes: [['addClause(native, ptr, block);', 'void block;']],
    test: browser('completed SAT sets match exhaustive keys'),
  },
  {
    name: 'Treat UNKNOWN as UNSAT', file: 'src/sat/status.ts',
    changes: [["if (code === 0) return 'UNKNOWN';", "if (code === 0) return 'UNSAT';"]],
    test: unit('src/sat/status.test.ts', 'keeps interrupted'),
  },
  {
    name: 'Claim original key after withheld success', file: 'src/main.ts',
    changes: [['key === experiment.hiddenKey ? \'Matches original master-key bits.\'', "true ? 'Matches original master-key bits.'"]],
    test: browser('different one-round keys pass every encryption check'),
  },
  {
    name: 'Delete the visible equivalence limitation', file: 'src/main.ts',
    changes: [['Every encryption check passes. The original key bits still have not been uniquely identified.', 'All checks passed.']],
    test: browser('different one-round keys pass every encryption check'),
  },
  {
    name: 'Accept a result from a retired job', file: 'src/sat/jobs.ts',
    changes: [['return messageJobId === currentJobId;', 'void messageJobId; void currentJobId; return true;']],
    test: unit('src/sat/jobs.test.ts', 'rejects an arriving result'),
  },
];

const report = ['# Mutation evidence', '', 'Each owner passed before mutation. Each concrete patch built successfully, changed the production bundle, was served from the project subpath, and made its owner fail. The original source was restored after each run.', '', '| Mutation | Mutated asset SHA-256 prefix | Owner failed |', '| --- | --- | --- |'];
const baseline = run('npm', ['test']);
if (!baseline.ok) throw new Error(`Baseline unit tests failed:\n${baseline.output.slice(-1800)}`);
const browserBaseline = run('npm', ['run', 'test:claims', '--', '--workers=1'], { CI: '1' });
if (!browserBaseline.ok) throw new Error(`Baseline browser claims failed:\n${browserBaseline.output.slice(-1800)}`);
const initialBuild = run('npm', ['run', 'build']);
if (!initialBuild.ok) throw new Error(`Baseline build failed:\n${initialBuild.output.slice(-1800)}`);
const baselineHash = assetHash();

for (const mutation of mutations) {
  const path = join(root, mutation.file);
  const original = readFileSync(path, 'utf8');
  let changed = original;
  for (const [before, after] of mutation.changes) changed = replaceOnce(changed, before, after);
  writeFileSync(path, changed);
  try {
    const build = run('npm', ['run', 'build']);
    if (!build.ok) throw new Error(`${mutation.name}: mutated build failed:\n${build.output.slice(-1800)}`);
    if (assetHash() === baselineHash) throw new Error(`${mutation.name}: production bundle did not change`);
    const servedHash = await proveServedAsset();
    const [command, args] = mutation.test;
    const owner = run(command, args, { CI: '1' });
    if (owner.ok || !/AssertionError|Error: expect|expected|Expected/.test(owner.output)) {
      throw new Error(`${mutation.name}: owner did not fail an assertion:\n${owner.output.slice(-2200)}`);
    }
    report.push(`| ${mutation.name} | \`${servedHash}\` | Yes |`);
    process.stdout.write(`Killed: ${mutation.name}\n`);
  } finally {
    writeFileSync(path, original);
  }
}
const restored = run('npm', ['run', 'build']);
if (!restored.ok || assetHash() !== baselineHash) throw new Error('Restored source did not reproduce baseline bundle');
report.push('', `Baseline: ${baseline.output.match(/Tests\s+\d+ passed \(\d+\)/)?.[0] ?? 'unit suite passed'}; ${browserBaseline.output.match(/\d+ passed \([^\n]+\)/)?.[0] ?? 'browser claims passed'}.`, '');
writeFileSync(join(root, 'docs/mutation-evidence.md'), report.join('\n'));
process.stdout.write('All nine mutations killed; baseline bundle restored.\n');
