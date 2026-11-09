import { expect, test, type Page } from '@playwright/test';
import { themes } from '../src/themes/themes';

const practiceButton = (page: Page) => page.getByRole('button', { name: /practice/i });

async function startPractice(page: Page): Promise<void> {
  await practiceButton(page).click();
  await expect(page.getByText('GET READY', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'FLAP', exact: true })).toBeVisible({ timeout: 7_000 });
}

async function savedSetting(page: Page, key: string): Promise<unknown> {
  return page.evaluate((settingKey) => {
    const settings = JSON.parse(localStorage.getItem('drop-flap-settings') || '{}');
    return settings[settingKey];
  }, key);
}

test('home presents the playable cabinet and clear camera/practice choices', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto('./');
  await expect(page.getByRole('button', { name: /start a set/i })).toBeVisible();
  await expect(practiceButton(page)).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible();
  const canvas = page.locator('canvas');
  await expect(canvas).toBeVisible();
  await expect.poll(() => canvas.evaluate((element) => {
    const pixels = (element as HTMLCanvasElement).getContext('2d')?.getImageData(120, 200, 30, 30).data;
    return pixels?.some((value, index) => index % 4 === 3 && value > 0) ?? false;
  })).toBe(true);
  expect(errors).toEqual([]);
});

test('a practice round counts down, accepts flap controls, and persists separately from rep totals', async ({ page }) => {
  await page.goto('./');
  await startPractice(page);
  await page.getByRole('button', { name: 'FLAP', exact: true }).click();
  await page.locator('canvas').click();
  await page.keyboard.press('ArrowUp');
  // A bird left without lift hits the ground in under a second. Surviving this
  // interval confirms that the practice controls reach the real game engine.
  await page.waitForTimeout(950);
  await expect(page.getByRole('button', { name: 'FLAP', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /end this set/i }).click();
  await expect(page.getByRole('button', { name: /save image/i })).toBeVisible();
  await page.getByRole('button', { name: 'HISTORY', exact: true }).click();
  await expect(page.locator('.history-row')).toHaveCount(1);
  await expect(page.getByLabel('Practice round')).toBeVisible();
  const totals = page.getByLabel('Camera workout totals');
  await expect(totals.locator('.stat-value')).toHaveText(['0', '0', '0']);
  await page.reload();
  await page.getByRole('button', { name: 'HISTORY', exact: true }).click();
  await expect(page.locator('.history-row')).toHaveCount(1);
  await expect(page.getByLabel('Practice round')).toBeVisible();
});

test('all twelve themes apply and the chosen theme and reduced motion survive reload', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  await expect(page.locator('.theme-option')).toHaveCount(12);
  for (const theme of themes) {
    const option = page.getByRole('button', { name: new RegExp(`^${theme.name}`) });
    await option.click();
    await expect(option).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('.app')).toHaveClass(new RegExp(`theme-${theme.id}`));
    await expect.poll(() => savedSetting(page, 'theme')).toBe(theme.id);
  }
  await page.getByRole('checkbox', { name: /reduced motion/i }).check();
  await expect(page.locator('.app')).toHaveClass(/reduced-motion/);
  await page.reload();
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  await expect(page.getByRole('button', { name: /^One-Bit Mac/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('checkbox', { name: /reduced motion/i })).toBeChecked();
  await expect(page.locator('.app')).toHaveClass(/reduced-motion/);
});

test('a local photo can be uploaded, restored, and removed', async ({ page }) => {
  await page.goto('./');
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  await page.getByRole('button', { name: /^Your photo/ }).click();
  // A tiny valid PNG fixture exercises image decoding and IndexedDB storage.
  await page.getByLabel('Choose a background photo').setInputFiles({
    name: 'test-background.png',
    mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64'),
  });
  await expect(page.getByAltText('Your saved game background')).toBeVisible();
  await expect.poll(() => savedSetting(page, 'background')).toBe('photo');
  await page.reload();
  await page.getByRole('button', { name: 'SETTINGS', exact: true }).click();
  await expect(page.getByAltText('Your saved game background')).toBeVisible();
  await page.getByRole('button', { name: 'Remove photo', exact: true }).click();
  await expect(page.getByAltText('Your saved game background')).toHaveCount(0);
  await expect.poll(() => savedSetting(page, 'background')).toBe('scene');
});

test('denied camera permission explains recovery and permits practice', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => { throw new DOMException('Permission denied for browser test.', 'NotAllowedError'); },
    });
  });
  await page.goto('./');
  await page.getByRole('button', { name: /start a set/i }).click();
  await expect(page.getByText('CAMERA UNAVAILABLE', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toContainText(/permission|allow camera|blocked/i);
  await startPractice(page);
  await page.getByRole('button', { name: /end this set/i }).click();
  await expect(page.getByRole('button', { name: /save image/i })).toBeVisible();
});

test('mobile home, settings and history fit the viewport without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('./');
  for (const tab of ['PLAY', 'SETTINGS', 'HISTORY']) {
    await page.getByRole('button', { name: tab, exact: true }).click();
    await expect.poll(() => page.evaluate(() => Math.max(
      document.documentElement.scrollWidth,
      document.body.scrollWidth,
    ) - window.innerWidth)).toBeLessThanOrEqual(1);
  }
  await page.getByRole('button', { name: 'PLAY', exact: true }).click();
  await expect(page.getByRole('button', { name: /start a set/i })).toBeVisible();
  await expect(practiceButton(page)).toBeVisible();
});
