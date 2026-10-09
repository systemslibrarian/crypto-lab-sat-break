import { expect, test } from '@playwright/test';

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
