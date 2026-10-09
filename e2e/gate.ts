import AxeBuilder from '@axe-core/playwright';
import { expect, type Page } from '@playwright/test';
import { auditContrast, formatContrastFailures } from './contrast';
import { auditNonText, formatNonTextFailures } from './nontext';

const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

export async function boot(page: Page): Promise<void> {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.goto('./');
  await expect(page.getByRole('heading', { name: 'SAT Break', level: 1 })).toBeVisible();
  await expect(page.locator('#clause-count')).toHaveText('624');
  expect(await page.evaluate(() => matchMedia('(prefers-reduced-motion: reduce)').matches)).toBe(true);
  expect(await page.locator('[role="banner"]').count()).toBe(1);
  expect(errors).toEqual([]);
}

export async function scan(page: Page, state: string): Promise<void> {
  const axe = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  expect(axe.violations.map(v=>`${v.id}: ${v.nodes.map(n=>n.target.join(' ')).join(', ')}`), `${state}: axe violations`).toEqual([]);
  // Chromium cannot resolve some CSS color mixtures in axe. The copied
  // arithmetic oracle below measures the painted foreground and backdrop.
  expect(axe.incomplete.filter(v=>v.id!=='color-contrast').map(v=>v.id), `${state}: unresolved axe rules`).toEqual([]);
  const contrast = await auditContrast(page);
  expect(formatContrastFailures(contrast), `${state}: text contrast`).toEqual([]);
  const nontext = await auditNonText(page);
  expect(formatNonTextFailures(nontext), `${state}: control and graphic contrast`).toEqual([]);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
  expect(overflow, `${state}: horizontal overflow`).toBeLessThanOrEqual(1);
  const invisibleText = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>('main *')].filter(el => {
    const own = [...el.childNodes].some(node => node.nodeType === Node.TEXT_NODE && !!node.textContent?.trim());
    return own && el.checkVisibility({ checkVisibilityCSS: true }) && Number(getComputedStyle(el).opacity) === 0;
  }).map(el=>el.tagName));
  expect(invisibleText, `${state}: reduced motion must not blank text`).toEqual([]);
}

export async function driveAllStates(page: Page): Promise<void> {
  await scan(page, 'arrival');
  await page.locator('.cl-skip-link').focus();
  await expect(page.locator('.cl-skip-link')).toBeFocused();
  await page.locator('#gate-input').fill('1');
  await expect(page.locator('#gate-verdict')).toContainText('clauses satisfied');
  await scan(page, 'changed clause assignment');
  await page.getByRole('button', { name: 'Check supplied candidate with SAT' }).click();
  await expect(page.locator('#solve-status')).toContainText('is SAT', { timeout: 45_000 });
  await expect(page.locator('#verification')).toContainText('Fails');
  await scan(page, 'observed fit with withheld failure');
  await page.getByRole('button', { name: 'One-round equivalent keys' }).click();
  await page.getByRole('button', { name: 'Reveal original key' }).click();
  await page.getByRole('button', { name: 'Check supplied candidate with SAT' }).click();
  await expect(page.locator('.limitation')).toBeVisible({ timeout: 45_000 });
  await scan(page, 'equivalent-key limitation');
  await page.getByLabel('Check a supplied key (hex)').fill('bad-key');
  await page.getByRole('button', { name: 'Check supplied candidate with SAT' }).click();
  await expect(page.locator('#solve-status')).toContainText('hexadecimal');
  await scan(page, 'invalid candidate');
  await page.getByLabel('Observed pairs').selectOption('3');
  await page.getByLabel('Task').selectOption('complete');
  await page.getByRole('button', { name: 'Run five-trial benchmark' }).click();
  await expect(page.locator('#benchmark-status')).toContainText('Five measured repetitions', { timeout: 60_000 });
  await scan(page, 'measured comparison');
}
