import { test, expect } from '@playwright/test';
import path from 'path';

const baseURL = 'http://127.0.0.1:4173';
const importFile = path.resolve('tests/fixtures/import.json');

async function resetAppState(page) {
  await page.goto(baseURL, { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {
    try {
      localStorage.clear();
      indexedDB.deleteDatabase('ContinuumDB');
    } catch {}
  });
  await page.reload({ waitUntil: 'domcontentloaded' });
}

async function waitForAppReady(page) {
  await page.waitForSelector('.app', { state: 'visible', timeout: 20000 });
  // Dismiss energy check-in modal if present
  const energyModal = page.locator('.energy-modal');
  if (await energyModal.isVisible().catch(() => false)) {
    const firstEnergy = energyModal.locator('.energy-btn').first();
    if (await firstEnergy.isVisible().catch(() => false)) {
      await firstEnergy.click();
    }
  }
}

test('Import rehydrates settings', async ({ page }) => {
  await resetAppState(page);
  await waitForAppReady(page);

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('heading', { name: 'Settings' }).waitFor();

  const fileInput = page.locator('input[type="file"]');
  await fileInput.setInputFiles(importFile);

  // Wait for import toast if it appears
  const toast = page.locator('.toast');
  await toast.first().waitFor({ timeout: 10000 }).catch(() => {});

  const nutritionWidget = page.locator('.widget-tile', { hasText: 'Nutrition Goals' });
  const proteinInput = nutritionWidget.locator('input[type="number"]').first();
  await expect(proteinInput).toHaveValue('200');
});

test('Day-boundary tasks appear in current list', async ({ page, context }) => {
  await context.route('https://worldtimeapi.org/**', route => route.abort());
  await context.route('https://timeapi.io/**', route => route.abort());
  await page.addInitScript(({ now }) => {
    const fixed = new Date(now).valueOf();
    const OriginalDate = Date;
    class MockDate extends OriginalDate {
      constructor(...args) {
        if (args.length === 0) {
          super(fixed);
        } else {
          super(...args);
        }
      }
      static now() {
        return fixed;
      }
    }
    MockDate.UTC = OriginalDate.UTC;
    MockDate.parse = OriginalDate.parse;
    window.Date = MockDate;
  }, { now: '2026-02-03T03:00:00' });

  await resetAppState(page);
  await waitForAppReady(page);

  await page.getByRole('button', { name: 'Tasks' }).click();
  await page.getByRole('heading', { name: 'Tasks' }).waitFor();

  // Switch to list view for simpler assertions
  await page.locator('button[title="List View"]').click();

  await page.getByRole('button', { name: /Add Task/i }).click();
  await page.getByLabel('Task Title *').fill('Boundary Task');
  await page.getByRole('button', { name: 'Add Task' }).click();

  await expect(page.getByText('Boundary Task')).toBeVisible();
});

test('Workout resumes after reload', async ({ page }) => {
  await resetAppState(page);
  await waitForAppReady(page);

  await page.getByRole('button', { name: 'Training' }).click();
  await page.getByRole('heading', { name: 'Training' }).waitFor();

  await page.getByRole('button', { name: /Gym Workout/i }).click();
  await page.getByRole('button', { name: /Upper Body/i }).click();
  await page.getByRole('button', { name: 'Chest' }).click();
  await page.getByRole('button', { name: /Start Workout/i }).click();

  await expect(page.getByText(/Exercise 1 of/i)).toBeVisible();

  await page.reload({ waitUntil: 'domcontentloaded' });
  await waitForAppReady(page);
  await page.getByRole('button', { name: 'Training' }).click();

  await expect(page.getByText(/Exercise 1 of/i)).toBeVisible();
});

test('Quick add updates protein immediately', async ({ page }) => {
  await resetAppState(page);
  await waitForAppReady(page);

  await page.getByRole('button', { name: 'Meals' }).click();
  await page.getByRole('heading', { name: 'Nutrition' }).waitFor();

  const quickButtons = page.locator('.quick-btn');
  await expect(quickButtons.first()).toBeVisible();

  await quickButtons.first().click();

  await expect(page.locator('.protein-value')).toHaveText(/\d+g/);
});

test('Locked day prevents task completion', async ({ page }) => {
  await resetAppState(page);
  await waitForAppReady(page);

  await page.getByRole('button', { name: 'Tasks' }).click();
  await page.getByRole('heading', { name: 'Tasks' }).waitFor();
  await page.locator('button[title="List View"]').click();

  await page.getByRole('button', { name: /Add Task/i }).click();
  await page.getByLabel('Task Title *').fill('Lock Test');
  await page.getByRole('button', { name: 'Add Task' }).click();

  await expect(page.getByText('Lock Test')).toBeVisible();

  // Close day
  page.once('dialog', d => d.accept());
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('heading', { name: 'Settings' }).waitFor();
  await page.getByRole('button', { name: /Close Today/i }).click();

  // Back to tasks
  await page.getByRole('button', { name: 'Tasks' }).click();
  const taskItem = page.locator('.task-item', { hasText: 'Lock Test' });
  await expect(taskItem).toBeVisible();

  await taskItem.locator('.task-checkbox').click();

  await expect(taskItem).not.toHaveClass(/completed/);
});
