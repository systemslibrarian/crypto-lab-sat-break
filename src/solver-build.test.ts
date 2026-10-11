import { afterEach, expect, test } from 'vitest';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

// Offline subprocess controls, not evidence that a mock compiler reproduces WASM.
const owned: string[] = [];
afterEach(() => { for (const dir of owned.splice(0)) rmSync(dir, { recursive: true, force: true }); });

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'sat-build-control-'));
  owned.push(root);
  for (const path of ['solver', 'public', 'bin', 'cache', 'fixture/src', '.solver-build']) mkdirSync(join(root, path), { recursive: true });
  copyFileSync(resolve('solver/build.sh'), join(root, 'solver/build.sh'));
  writeFileSync(join(root, 'solver/wrapper.cpp'), 'wrapper fixture');
  writeFileSync(join(root, 'fixture/LICENSE'), 'license fixture');
  for (const file of ['current.cpp', 'cadical.cpp', 'mobical.cpp', 'kitten.c']) writeFileSync(join(root, 'fixture/src', file), 'source fixture');
  writeFileSync(join(root, 'cache/untracked.cpp'), 'Never compile cache worktree dirt');
  writeFileSync(join(root, '.solver-build/stale.o'), 'Never link old objects');
  writeFileSync(join(root, '.solver-build/libcadical.a'), 'Never reuse old archives');
  writeFileSync(join(root, 'public/cadical.mjs'), 'JS fixture');
  writeFileSync(join(root, 'public/cadical.wasm'), 'WASM fixture');
  const stub = join(root, 'bin/tool.cjs');
  writeFileSync(stub, `#!${process.execPath}\n` + String.raw`
const fs = require('node:fs');
const path = require('node:path');
const cp = require('node:child_process');
const tool = path.basename(process.argv[1]);
const args = process.argv.slice(2);
fs.appendFileSync(process.env.CONTROL_LOG, JSON.stringify({tool,args,cache:process.env.EM_CACHE,flags:process.env.EMCC_CFLAGS,ccache:process.env.CCACHE_DISABLE})+'\n');
if (tool==='git') {
  if (args.includes('remote')) console.log(process.env.CONTROL_BAD_ORIGIN ? 'https://example.invalid/wrong.git' : 'https://github.com/arminbiere/cadical.git');
  else if (args.includes('fetch')) process.exit(process.env.CONTROL_FETCH_FAIL ? 7 : 0);
  else if (args.includes('rev-parse')) console.log(process.env.CONTROL_BAD_PIN ? 'bad-pin' : 'c60730422e758ef1cebe7aeddf2dda31c996bf04');
  else if (args.includes('archive')) process.stdout.write(cp.execFileSync('tar',['-C',process.env.CONTROL_SOURCE,'-cf','-','.']));
  else throw Error('Unexpected fixture git operation: '+args);
} else if (args[0]==='--version') console.log('OFFLINE MOCK TOOLCHAIN '+(process.env.CONTROL_COMPILER || 'one'));
else if (process.env.CONTROL_COMPILE_FAIL) process.exit(9);
else if (tool==='emar') {
  for (const object of args.slice(2)) if (!fs.existsSync(object)) throw Error('Missing object');
  fs.writeFileSync(args[1], 'archive fixture');
} else {
  const output = args[args.indexOf('-o')+1];
  if (args.includes('-c')) fs.writeFileSync(output,'object fixture');
  else {
    if (process.env.CONTROL_CHANGE_WRAPPER) fs.writeFileSync(path.join(process.env.CONTROL_ROOT,'solver/wrapper.cpp'),'changed during build');
    if (process.env.CONTROL_CHANGE_ASSET) fs.writeFileSync(path.join(process.env.CONTROL_ROOT,'public/cadical.wasm'),'changed during build');
    fs.writeFileSync(output,process.env.CONTROL_BAD_JS ? 'bad JS' : 'JS fixture');
    if (!process.env.CONTROL_OMIT_WASM) fs.writeFileSync(output.replace(/\.mjs$/,'.wasm'),process.env.CONTROL_BAD_WASM ? 'bad WASM' : 'WASM fixture');
  }
}
`, { mode: 0o755 });
  for (const name of ['git', 'emcc', 'em++', 'emar']) symlinkSync(stub, join(root, 'bin', name));
  const log = join(root, 'commands.jsonl');
  const run = (extra: Record<string, string> = {}) => spawnSync('bash', ['solver/build.sh', '--verify', join(root, 'cache')], {
    cwd: root, encoding: 'utf8', env: { ...process.env, PATH: join(root, 'bin') + ':' + process.env.PATH,
      CONTROL_LOG: log, CONTROL_ROOT: root, CONTROL_SOURCE: join(root, 'fixture'), EMCC_CFLAGS: '--unexpected-inherited-flags', ...extra },
  });
  const commands = () => readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line));
  const assets = () => ['cadical.mjs', 'cadical.wasm'].map(file => readFileSync(join(root, 'public', file), 'utf8'));
  return { root, run, commands, assets };
}

test('verification compiles only captured source into fresh objects and never replaces shipped assets', () => {
  const f = fixture();
  const before = f.assets();
  const result = f.run();
  expect(result.status, result.stderr).toBe(0);
  expect(result.stdout).toContain('MATCH public/cadical.mjs');
  expect(result.stdout).toContain('MATCH public/cadical.wasm');
  const compiles = f.commands().filter(x => x.args.includes('-c'));
  expect(compiles.map(x => basename(x.args[x.args.indexOf('-c') + 1])).sort()).toEqual(['current.cpp', 'kitten.c', 'wrapper.cpp']);
  const archive = f.commands().find(x => x.tool === 'emar' && x.args[0] === 'rcs');
  expect(archive.args.slice(2).map((x: string) => basename(x))).toEqual(['current.o', 'kitten.o']);
  expect(f.commands().some(x => x.args.includes('checkout') || x.args.includes('reset'))).toBe(false);
  expect(compiles.every(x => x.ccache === '1' && !x.flags && x.cache.includes('cadical-clean.'))).toBe(true);
  expect(f.assets()).toEqual(before);
  expect(readFileSync(join(f.root, '.solver-build/stale.o'), 'utf8')).toBe('Never link old objects');
  expect(readFileSync(join(f.root, 'cache/untracked.cpp'), 'utf8')).toBe('Never compile cache worktree dirt');
});

test('compiler changes cannot reuse objects or the previous compiler cache', () => {
  const f = fixture();
  expect(f.run().status).toBe(0);
  expect(f.run({ CONTROL_COMPILER: 'two' }).status).toBe(0);
  const compiles = f.commands().filter(x => x.args.includes('-c'));
  expect(compiles).toHaveLength(6);
  expect(new Set(compiles.map(x => x.cache)).size).toBe(2);
});

test('symlinked temporary roots use canonical compiler-cache paths', () => {
  const f = fixture();
  const real = join(f.root, 'real-tmp');
  const alias = join(f.root, 'tmp-alias');
  mkdirSync(real);
  symlinkSync(real, alias);
  expect(f.run({ TMPDIR: alias }).status).toBe(0);
  const compiles = f.commands().filter(x => x.args.includes('-c'));
  expect(compiles.every(x => x.cache.startsWith(realpathSync(real) + '/'))).toBe(true);
  expect(compiles.every(x => !x.cache.includes('/tmp-alias/'))).toBe(true);
});

test.each(['CONTROL_BAD_JS', 'CONTROL_BAD_WASM'])('mismatching %s is a nonzero verification, with both comparisons reported', key => {
  const f = fixture();
  const before = f.assets();
  const result = f.run({ [key]: '1' });
  expect(result.status).toBe(1);
  expect(result.stdout + result.stderr).toContain('public/cadical.mjs');
  expect(result.stdout + result.stderr).toContain('public/cadical.wasm');
  expect(result.stderr).toContain('MISMATCH');
  expect(f.assets()).toEqual(before);
});

test.each(['CONTROL_BAD_PIN', 'CONTROL_BAD_ORIGIN', 'CONTROL_FETCH_FAIL', 'CONTROL_COMPILE_FAIL', 'CONTROL_OMIT_WASM'])('incomplete %s cannot verify from stale assets', key => {
  const f = fixture();
  const before = f.assets();
  const result = f.run({ [key]: '1' });
  expect(result.status).not.toBe(0);
  expect(result.stdout).not.toContain('MATCH public/');
  expect(f.assets()).toEqual(before);
});

test.each(['CONTROL_CHANGE_WRAPPER', 'CONTROL_CHANGE_ASSET'])('concurrent %s invalidates verification', key => {
  const f = fixture();
  const result = f.run({ [key]: '1' });
  expect(result.status).not.toBe(0);
  expect(result.stdout).not.toContain('MATCH public/');
});
