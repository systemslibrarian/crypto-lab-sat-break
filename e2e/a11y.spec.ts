import { test } from '@playwright/test';
import { boot, driveAllStates } from './gate';

test('WCAG 2.1 A/AA across the teaching states at desktop width', async ({ page }) => {
  test.setTimeout(180_000);
  await boot(page);
  await driveAllStates(page);
});

test('WCAG 2.1 A/AA across the teaching states at phone width', async ({ page }) => {
  test.setTimeout(180_000);
  await page.setViewportSize({ width: 380, height: 800 });
  await boot(page);
  await driveAllStates(page);
});
