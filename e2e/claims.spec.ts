import { expect, test } from '@playwright/test';
import { boot } from './gate';

test('pinned CaDiCaL bridge loads, returns SAT/UNSAT, and accepts incremental clauses', async ({ page }) => {
  await page.goto('./');
  const outcome = await page.evaluate(async () => {
    const url = new URL('cadical.mjs', location.href);
    const imported = await import(/* @vite-ignore */ url.href);
    const native = await imported.default({ locateFile: (file: string) => new URL(file, url).href, print: () => {}, printErr: () => {} });
    const ptr = native._sat_new();
    const empty = native._sat_solve(ptr);
    const freeBit = native._sat_val(ptr, 1);
    native._sat_add(ptr, 1); native._sat_add(ptr, 0);
    const sat = native._sat_solve(ptr);
    const model = native._sat_val(ptr, 1);
    native._sat_add(ptr, -1); native._sat_add(ptr, 0);
    const unsat = native._sat_solve(ptr);
    native._sat_delete(ptr);
    return { empty, freeBit, sat, model, unsat };
  });
  // Free frozen bits receive CaDiCaL's default phase even with val(..., false).
  // The worker identifies free bits from clause incidence and completes them.
  expect(outcome).toEqual({ empty: 10, freeBit: -1, sat: 10, model: 1, unsat: 20 });
});

test('cipher map and clause inspector explain the actual gate constraints', async ({ page }) => {
  await page.goto('./');
  await expect(page.locator('.cipher-flow li')).toHaveCount(5);
  await expect(page.locator('.cipher-map')).toContainText('Every pair shares the same 16-bit master key');
  await expect(page.locator('#gate-explanation')).toContainText('These input bits XOR to 0. You proposed output 0.');
  await expect(page.locator('#gate-verdict')).toContainText('Valid assignment. 4/4 actual clauses satisfied.');
  await page.locator('#gate-input').fill('1');
  await expect(page.locator('#gate-explanation')).toContainText('These input bits XOR to 1. You proposed output 0.');
  await expect(page.locator('#gate-verdict')).toContainText('Invalid assignment.');
  await page.locator('#gate-output').fill('1');
  await expect(page.locator('#gate-verdict')).toContainText('Valid assignment.');

  await page.locator('#gate-select').selectOption({ label: 'Pair 1, round 1, low S-box' });
  await page.locator('#gate-input').fill('0');
  await page.locator('#gate-output').fill('14');
  await expect(page.locator('#gate-explanation')).toContainText('The S-box maps input 0 to E. You proposed output E.');
  await expect(page.locator('#gate-verdict')).toContainText('Valid assignment.');
  await page.locator('#gate-output').fill('0');
  await expect(page.locator('#gate-verdict')).toContainText('Invalid assignment.');

  await page.locator('#gate-select').selectOption({ label: 'Pair 1, ciphertext bit 0' });
  await expect(page.locator('#gate-output-label')).toBeHidden();
  await expect(page.locator('#gate-explanation')).toContainText('the observed ciphertext requires bit 0');
  await page.locator('#gate-input').fill('1');
  await expect(page.locator('#gate-verdict')).toContainText('Invalid assignment.');
  await page.locator('#gate-select').selectOption({ label: 'Pair 1, round 2, bit 0' });
  await expect(page.locator('#gate-output-label')).toBeVisible();
  await expect(page.locator('#gate-output')).toHaveValue('0');
});

test('real WASM solver fits a public pair and the supplied wrong key fails withheld evidence', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'SAT Break' })).toBeVisible();
  await expect(page.locator('#clause-count')).toHaveText('624');
  await page.getByRole('button', { name: 'Find a key', exact: true }).click();
  await expect(page.locator('#solve-status')).toContainText('At least 1 key found', { timeout: 45_000 });
  await page.getByLabel('Check a supplied key (hex)').fill('003F');
  await page.getByRole('button', { name: 'Check supplied candidate with SAT' }).click();
  await expect(page.locator('#solve-status')).toContainText('is SAT', { timeout: 45_000 });
  await expect(page.locator('#selected-key')).toContainText('003F');
  const row = page.locator('#verification table').last().locator('tr').filter({ hasText: '3A' });
  await expect(row).toContainText('33');
  await expect(row).toContainText('26');
  await expect(row).toContainText('Fails');
  await expect(page.locator('#verification')).toContainText('Passes 8 withheld checks: no');
  await page.getByLabel('Check a supplied key (hex)').fill('0000');
  await page.getByRole('button', { name: 'Check supplied candidate with SAT' }).click();
  await expect(page.locator('#solve-status')).toContainText('cannot fit these observed pairs (UNSAT)', { timeout: 45_000 });
});

test('completed SAT sets match exhaustive keys for the fixture prefixes', async ({ page }) => {
  await page.goto('./');
  for (const [n, expected] of [[1,262],[2,2],[3,1]] as const) {
    await page.getByLabel('Observed pairs').selectOption(String(n));
    await page.getByRole('button', { name: 'Enumerate up to 512 more' }).click();
    await expect(page.locator('#solve-status')).toContainText(/all \d+ consistent master keys? found|Solver error:/, { timeout: 60_000 });
    expect(await page.locator('#solve-status').textContent()).toContain(`all ${expected} consistent master ${expected === 1 ? 'key' : 'keys'} found`);
    await page.getByRole('button', { name: 'Count all fitting keys' }).click();
    await expect(page.locator('#set-comparison')).toContainText(`Complete SAT set equals the exhaustive set: ${expected} identical key values.`, { timeout: 60_000 });
  }
});

test('different one-round keys pass every encryption check without identifying original bits', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'One-round equivalent keys' }).click();
  await page.getByRole('button', { name: 'Reveal original key' }).click();
  await page.getByRole('button', { name: 'Check supplied candidate with SAT' }).click();
  await expect(page.locator('#solve-status')).toContainText('is SAT', { timeout: 45_000 });
  await expect(page.locator('.limitation')).toContainText('original key bits still have not been uniquely identified');
  await expect(page.locator('#verification')).toContainText('Same complete encryption function (all 256 plaintexts): yes');
  await expect(page.locator('#verification')).toContainText('Different master-key bits from 1234');
});

test('a capped or stopped enumeration never claims completeness', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Find a key', exact: true }).click();
  await expect(page.locator('#solve-status')).toContainText('enumeration incomplete', { timeout: 45_000 });
  await page.getByRole('button', { name: 'Stop' }).click();
  await expect(page.locator('#solve-status')).toContainText('incomplete');
  await expect(page.locator('#solve-status')).not.toContainText('all keys');
});

test('query changes retire results and DIMACS contains only public evidence', async ({ page }) => {
  await page.goto('./');
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download base DIMACS' }).click();
  const download = await downloadPromise;
  const fs = await import('node:fs/promises');
  const text = await fs.readFile(await download.path(), 'utf8');
  expect(text).toContain('p cnf 72 624');
  expect(text).not.toContain('1234');
  await page.getByRole('button', { name: 'Find a key', exact: true }).click();
  await expect(page.locator('#sat-count')).toHaveText('1', { timeout: 45_000 });
  await page.getByLabel('Observed pairs').selectOption('2');
  await expect(page.locator('#sat-count')).toHaveText('0');
  await expect(page.locator('#clause-count')).toHaveText('1248');
  await page.getByRole('button', { name: 'Enumerate up to 512 more' }).click();
  await page.getByLabel('Observed pairs').selectOption('3');
  await expect(page.locator('#sat-count')).toHaveText('0');
  await page.waitForTimeout(700);
  await expect(page.locator('#sat-count')).toHaveText('0');
  await expect(page.locator('#clause-count')).toHaveText('1872');
});

test('one-to-six-round selected eight-pair SAT sets equal exhaustive sets', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('./');
  for (const rounds of [1,2,3,4,5,6]) {
    await page.getByLabel('Rounds').selectOption(String(rounds));
    await page.getByLabel('Observed pairs').selectOption('8');
    await page.getByRole('button', { name: 'Enumerate up to 512 more' }).click();
    await expect(page.locator('#solve-status')).toContainText(/consistent master keys? found/, { timeout: 60_000 });
    if (rounds === 1) {
      await expect(page.locator('#sat-count')).toHaveText('16');
      const keys = await page.locator('#candidate-rows tr td:first-child').allTextContents();
      expect(keys.sort()).toEqual(Array.from({ length: 16 }, (_, i) => `${i.toString(16).toUpperCase()}34`.padStart(4, '1')).sort());
    }
    await page.getByRole('button', { name: 'Count all fitting keys' }).click();
    await expect(page.locator('#set-comparison')).toContainText('Complete SAT set equals the exhaustive set:', { timeout: 60_000 });
  }
});

test('five-trial complete-set benchmark uses fresh SAT and exhaustive workers', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Observed pairs').selectOption('3');
  await page.getByLabel('Task').selectOption('complete');
  await page.getByRole('button', { name: 'Run five-trial benchmark' }).click();
  await expect(page.locator('#benchmark-status')).toContainText('Five measured repetitions per method completed for complete-set task.', { timeout: 60_000 });
  await expect(page.locator('#benchmark-output')).toContainText('CaDiCaL WASM');
  await expect(page.locator('#benchmark-output')).toContainText('Exhaustive worker');
  await expect(page.locator('#benchmark-meta')).toContainText('direct observed-pair verification of SAT candidates');
  await page.getByText('See measured stages').click();
  await expect(page.locator('#benchmark-output')).toContainText('CNF encoding, once before trials');
  await expect(page.locator('#benchmark-output')).toContainText('SAT: model extraction');
  await expect(page.locator('#benchmark-output')).toContainText('Exhaustive: key scan loop');
  await page.getByLabel('Observed pairs').selectOption('4');
  await expect(page.locator('#benchmark-output')).toBeEmpty();
  await expect(page.locator('#benchmark-status')).toContainText('Run this explicitly when ready.');
});

test('Stop cancels an active benchmark and a fresh SAT run still works', async ({ page }) => {
  await page.goto('./');
  await page.getByLabel('Task').selectOption('complete');
  await page.getByRole('button', { name: 'Run five-trial benchmark' }).click();
  await expect(page.locator('#benchmark-status')).toContainText(/SAT (warmup|trial)/);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.locator('#benchmark-status')).toContainText('Benchmark stopped; measurements incomplete.');
  await page.getByRole('button', { name: 'Find a key', exact: true }).click();
  await expect(page.locator('#solve-status')).toContainText('At least 1 key found', { timeout: 45_000 });
});

test('stopping a benchmark preserves a proven complete SAT enumeration', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'Enumerate up to 512 more' }).click();
  await expect(page.locator('#solve-status')).toContainText('all 262 consistent master keys found', { timeout: 60_000 });
  await page.getByLabel('Task').selectOption('complete');
  await page.getByRole('button', { name: 'Run five-trial benchmark' }).click();
  await expect(page.locator('#benchmark-status')).toContainText(/SAT (warmup|trial)/);
  await page.getByRole('button', { name: 'Stop', exact: true }).click();
  await expect(page.locator('#benchmark-status')).toContainText('Benchmark stopped; measurements incomplete.');
  await expect(page.locator('#solve-status')).toContainText('SAT enumeration remains complete: 262 consistent master keys.');
  await expect(page.locator('#sat-count')).toHaveText('262');
});

function cubeOracleReference(key: number[], publicRow: number): number {
  const [k1, k2, k3] = key
  const [v1, v2, v3, v4] = Array.from({ length: 4 }, (_, index) => (publicRow >>> index) & 1)
  return (v1 & v2 & (k1 ^ k2 ^ 1)) ^ (v1 & v3 & (k2 ^ k3)) ^ (v2 & v4 & (k1 ^ k2 ^ k3 ^ 1)) ^ (v3 & v4 & ((k1 & k2) ^ k3)) ^ (v1 & k3) ^ (v2 & k1) ^ (v4 & k2) ^ (k1 & k3)
}

function cubeReference(mask: number): number[] {
  const positions = Array.from({ length: 4 }, (_, index) => index).filter(index => mask & (1 << index))
  return Array.from({ length: 2 ** positions.length }, (_, assignment) => positions.reduce((row, position, index) => row | (((assignment >>> index) & 1) << position), 0))
}

function cubeKey(row: number): number[] {
  return Array.from({ length: 3 }, (_, index) => (row >>> index) & 1)
}

function cubeAnf(values: number[]): number[] {
  const coefficients = [...values]
  for (let variable = 0; variable < 3; variable++) for (let mask = 0; mask < 8; mask++) if (mask & (1 << variable)) coefficients[mask] ^= coefficients[mask ^ (1 << variable)]
  return coefficients
}

test('cube preprocessing independently exhausts every face and recovers the four superpolys', async ({ page }) => {
  await boot(page)
  const button = page.locator('#cube-preprocess')
  await button.click(); await expect(button).toBeFocused()
  await expect(page.locator('[data-cube="oracle-degree"]')).toHaveText('4')
  await expect(page.locator('[data-cube="pre-raw"]')).toHaveText('128')
  await expect(page.locator('[data-cube="pre-distinct"]')).toHaveText('72')
  await expect(page.locator('[data-verdict="ALL CUBE FACES EXHAUSTED"]')).toBeVisible()

  const cubes = [
    { id: 'C12', mask: 3, expression: '1 ⊕ k₁ ⊕ k₂', coefficients: [1, 1, 1, 0, 0, 0, 0, 0] },
    { id: 'C13', mask: 5, expression: 'k₂ ⊕ k₃', coefficients: [0, 0, 1, 0, 1, 0, 0, 0] },
    { id: 'C24', mask: 10, expression: '1 ⊕ k₁ ⊕ k₂ ⊕ k₃', coefficients: [1, 1, 1, 0, 1, 0, 0, 0] },
    { id: 'C34', mask: 12, expression: 'k₁k₂ ⊕ k₃', coefficients: [0, 0, 0, 1, 1, 0, 0, 0] },
  ]
  const oracleTerms = [
    [3, 'v₁v₂k₁'], [3, 'v₁v₂k₂'], [3, 'v₁v₂'], [5, 'v₁v₃k₂'], [5, 'v₁v₃k₃'],
    [10, 'v₂v₄k₁'], [10, 'v₂v₄k₂'], [10, 'v₂v₄k₃'], [10, 'v₂v₄'], [12, 'v₃v₄k₁k₂'],
    [12, 'v₃v₄k₃'], [1, 'v₁k₃'], [2, 'v₂k₁'], [8, 'v₄k₂'], [0, 'k₁k₃'],
  ] as const
  const detailTables = page.locator('#cube-preprocess-view > details').first().locator('details table')
  await expect(detailTables).toHaveCount(4)
  for (let cubeIndex = 0; cubeIndex < cubes.length; cubeIndex++) {
    const cube = cubes[cubeIndex], vertices = cubeReference(cube.mask)
    const sums = Array.from({ length: 8 }, (_, keyRow) => vertices.reduce((sum, row) => sum ^ cubeOracleReference(cubeKey(keyRow), row), 0))
    expect(cubeAnf(sums)).toEqual(cube.coefficients)
    await expect(page.locator(`[data-cube="${cube.id}-superpoly"]`)).toHaveText(cube.expression)
    const rendered = await detailTables.nth(cubeIndex).locator('tbody tr').evaluateAll(rows => rows.map(row => [...row.querySelectorAll('th,td')].map(cell => cell.textContent)))
    expect(rendered).toEqual(Array.from({ length: 8 }, (_, keyRow) => {
      const key = cubeKey(keyRow), outputs = vertices.map(row => cubeOracleReference(key, row))
      return [key.join(''), ...outputs.map(String), String(outputs.reduce((sum, bit) => sum ^ bit, 0))]
    }))
  }
  const cancellationRows = await page.locator('[data-cube-table="cancellation"] tbody tr').evaluateAll(rows => rows.map(row => [...row.querySelectorAll('th,td')].map(cell => cell.textContent)))
  expect(cancellationRows).toEqual(cubes.map(cube => [
    cube.id,
    oracleTerms.filter(([mask]) => mask === cube.mask).map(([, label]) => label).join(' ⊕ '),
    oracleTerms.filter(([mask]) => mask !== cube.mask && (mask & ~cube.mask) === 0).map(([, label]) => label).join(' ⊕ '),
    oracleTerms.filter(([mask]) => (mask & ~cube.mask) !== 0).map(([, label]) => label).join(' ⊕ '),
    cube.expression,
  ]))
  await expect(page.locator('[data-cube-row="C34"]')).toContainText('valid cube; nonlinear, not a maxterm')
  await expect(page.locator('[data-claim="cube-scope"]')).toContainText('executes no Trivium state or round')
})

test('cube online recovery freezes 110, verifies held-outs, and rejects both failure modes', async ({ page }) => {
  await boot(page)
  await page.locator('#cube-preprocess').click(); await page.locator('#cube-online').click()
  await expect(page.locator('[data-cube="candidate-counts"]')).toHaveText('8 → 4 → 2 → 1')
  await expect(page.locator('[data-cube="online-sums"]')).toHaveText('111')
  await expect(page.locator('[data-cube="rank"]')).toHaveText('3')
  await expect(page.locator('[data-cube="candidate"]')).toHaveText('110')
  await expect(page.locator('[data-verdict="ONE PROVISIONAL TOY KEY"]')).toBeVisible()

  const hidden = [1, 1, 0], masks = [3, 5, 10]
  const onlineRows = page.locator('#cube-online-view tbody tr')
  await expect(onlineRows).toHaveCount(3)
  for (let index = 0; index < masks.length; index++) {
    const vertices = cubeReference(masks[index]), outputs = vertices.map(row => cubeOracleReference(hidden, row))
    await expect(onlineRows.nth(index).locator('td').nth(1)).toHaveText(outputs.join(''))
    await expect(onlineRows.nth(index).locator('td').nth(2)).toHaveText(String(outputs.reduce((sum, bit) => sum ^ bit, 0)))
  }

  const frozen = await page.locator('[data-cube="candidate"]').innerText()
  await page.locator('#cube-heldout').click()
  expect(await page.locator('[data-cube="candidate"]').innerText()).toBe(frozen)
  const heldoutRows = [6, 11, 13, 7], expected = heldoutRows.map(row => cubeOracleReference(hidden, row)).join('')
  expect(expected).toBe('1011')
  await expect(page.locator('[data-cube="heldout-observed"]')).toHaveText(expected)
  await expect(page.locator('[data-cube="heldout-predicted"]')).toHaveText(expected)
  await expect(page.locator('[data-cube="online-raw"]')).toHaveText('16')
  await expect(page.locator('[data-cube="online-distinct"]')).toHaveText('12')
  await expect(page.locator('[data-verdict="HELD-OUT OUTPUTS MATCH"]')).toBeVisible()
  await page.locator('#cube-compare').click()
  await expect(page.locator('[data-verdict="TOY SECRET CONFIRMED"]')).toBeVisible()

  await page.locator('#cube-drop').click()
  await expect(page.locator('[data-cube="drop-rank"]')).toHaveText('2')
  await expect(page.locator('[data-cube="drop-candidates"]')).toHaveText('001, 110')
  await expect(page.locator('#cube-failure-view [data-verdict="AMBIGUOUS — STOP"]')).toBeVisible()
  await page.locator('#cube-flip').click()
  await expect(page.locator('[data-cube="flip-actual-sums"]')).toHaveText('111')
  await expect(page.locator('[data-cube="flip-sums"]')).toHaveText('101')
  await expect(page.locator('[data-cube="flip-candidate"]')).toHaveText('000')
  await expect(page.locator('[data-cube="flip-predicted"]')).toHaveText('0001')
  await expect(page.locator('[data-verdict="HELD-OUT CHECK REJECTED 000"]')).toBeVisible()

  const preprocess = page.locator('#cube-preprocess')
  await preprocess.click(); await expect(preprocess).toBeFocused()
  await expect(page.locator('[data-verdict="TOY SECRET CONFIRMED"]')).toHaveCount(0)
  await expect(page.locator('[data-verdict="HELD-OUT CHECK REJECTED 000"]')).toHaveCount(0)
  await expect(page.locator('#cube-heldout')).toBeDisabled()
  await expect(page.locator('#cube-compare')).toBeDisabled()
})
