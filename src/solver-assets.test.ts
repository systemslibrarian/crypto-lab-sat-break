import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';

const paths = ['public/cadical.mjs', 'public/cadical.wasm'];
const doc = readFileSync(new URL('../docs/solver-build.md', import.meta.url), 'utf8');
const assets = new Map(paths.map(path => [path, readFileSync(new URL(`../${path}`, import.meta.url))]));

function verifyDigests(document: string, bytes: Map<string, Buffer>) {
  const blocks = [...document.matchAll(/```text\r?\n([\s\S]*?)```/g)];
  if (blocks.length !== 1) throw new Error('Expected one checksum block');
  const rows = blocks[0][1].trim().split(/\r?\n/);
  if (rows.length !== paths.length) throw new Error('Expected both solver checksums');
  const seen = new Set<string>();
  for (const row of rows) {
    const match = /^([0-9a-fA-F]{64}) {2}(public\/cadical\.(?:mjs|wasm))$/.exec(row);
    if (!match) throw new Error('Expected a 64-hex SHA-256 and solver asset path');
    const [, digest, path] = match;
    if (seen.has(path)) throw new Error('Duplicate solver checksum');
    seen.add(path);
    const asset = bytes.get(path);
    if (!asset) throw new Error(`Missing asset: ${path}`);
    if (createHash('sha256').update(asset).digest('hex') !== digest.toLowerCase()) {
      throw new Error(`Checksum mismatch: ${path}`);
    }
  }
}

it('matches both documented SHA-256 digests to the checked-in solver assets', () => {
  expect(() => verifyDigests(doc, assets)).not.toThrow();
});

it('rejects the original truncated JavaScript digest', () => {
  const truncated = doc.replace(/[0-9a-f]{64}(?= {2}public\/cadical\.mjs)/, '2f070595a1bc8877effc74012a440588bf277c5d7a5a952cc');
  expect(() => verifyDigests(truncated, assets)).toThrow('64-hex');
});

it('rejects non-hex digests of the correct length', () => {
  expect(() => verifyDigests(doc.replace(/[0-9a-f]{64}/, 'g'.repeat(64)), assets)).toThrow('64-hex');
});

it.each(paths)('rejects changed bytes in %s', path => {
  const changed = new Map(assets);
  const bytes = Buffer.from(assets.get(path)!);
  bytes[0] ^= 1;
  changed.set(path, bytes);
  expect(() => verifyDigests(doc, changed)).toThrow(`Checksum mismatch: ${path}`);
});

it('rejects a missing checksum', () => {
  expect(() => verifyDigests(doc.replace(/^.* {2}public\/cadical\.wasm\r?\n/m, ''), assets)).toThrow('both solver checksums');
});
