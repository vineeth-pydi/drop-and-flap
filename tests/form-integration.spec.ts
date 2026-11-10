import { expect, test, type Page } from '@playwright/test';
import type { FormHarnessControls } from './harness/form';

declare global {
  interface Window {
    formHarness: FormHarnessControls;
    harnessCameraTracks: MediaStreamTrack[];
  }
}

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem('drop-flap-settings', JSON.stringify({ sound: false, haptics: false }));
    const state = window;
    state.harnessCameraTracks = [];
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        const canvas = document.createElement('canvas');
        canvas.width = 640;
        canvas.height = 480;
        const context = canvas.getContext('2d')!;
        context.fillStyle = '#111820';
        context.fillRect(0, 0, canvas.width, canvas.height);
        const stream = canvas.captureStream(20);
        const track = stream.getVideoTracks()[0];
        state.harnessCameraTracks.push(track);
        let tick = 0;
        const timer = window.setInterval(() => {
          context.fillStyle = ++tick % 2 ? '#111821' : '#111820';
          context.fillRect(0, 0, canvas.width, canvas.height);
          if (track.readyState === 'ended') window.clearInterval(timer);
        }, 50);
        return stream;
      },
    });
  });
  await page.goto('/tests/harness/form.html');
  await page.waitForFunction(() => !!window.formHarness);
  await page.getByRole('button', { name: 'FORM', exact: true }).click();
});

async function setPose(page: Page, angle: number, hipY = 0.35, bentKnee = false, holdMs = 350): Promise<void> {
  await page.evaluate(({ angle, hipY, bentKnee }) => {
    window.formHarness.setPose(angle, hipY, bentKnee);
  }, { angle, hipY, bentKnee });
  // The real counter uses elapsed time. These holds supply distinct 20 Hz
  // observations and exceed its descent/ascent thresholds without a fake clock.
  await page.waitForTimeout(holdMs);
}

async function startSet(page: Page): Promise<void> {
  await expect(page.getByRole('button', { name: 'Start form set', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Start form set', exact: true }).click();
  await expect(page.locator('.form-panel')).toHaveAttribute('data-stage', 'countdown');
  await expect(page.getByRole('button', { name: 'HISTORY', exact: true })).toBeDisabled();
  await expect(page.locator('.form-panel')).toHaveAttribute('data-stage', 'active', { timeout: 10_000 });
  await page.waitForTimeout(150);
}

async function fullCycle(page: Page, options: { hipY?: number; bentKnee?: boolean } = {}): Promise<void> {
  const bentKnee = options.bentKnee ?? false;
  await setPose(page, 135, 0.35, bentKnee);
  await setPose(page, 90, options.hipY ?? 0.35, bentKnee);
  await setPose(page, 130, 0.35, bentKnee);
  await setPose(page, 170, 0.35, bentKnee, 200);
}

async function expectCameraStopped(page: Page): Promise<void> {
  await expect.poll(() => page.evaluate(() => window.formHarness.status().activeSources)).toBe(0);
  await expect.poll(() => page.evaluate(() => window.harnessCameraTracks.every((track) => track.readyState === 'ended'))).toBe(true);
}

test('real form UI accepts a cycle, rejects hip faults, resets a paused partial, and persists one set', async ({ page }) => {
  await page.getByRole('button', { name: 'Start camera', exact: true }).click();
  await startSet(page);
  await expect(page.getByRole('button', { name: 'PLAY', exact: true })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'SETTINGS', exact: true })).toBeDisabled();
  await fullCycle(page);
  await expect(page.getByLabel('Reps meeting checks', { exact: true })).toHaveText('1');
  await expect(page.getByLabel('Full attempts not meeting checks', { exact: true })).toHaveText('0');

  await fullCycle(page, { hipY: 0.49 });
  await expect(page.getByLabel('Reps meeting checks', { exact: true })).toHaveText('1');
  await expect(page.getByLabel('Full attempts not meeting checks', { exact: true })).toHaveText('1');
  await expect(page.locator('.form-last-feedback')).toContainText(/not counted:.*hips/i);

  await setPose(page, 135);
  await setPose(page, 90);
  await page.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(page.locator('.form-panel')).toHaveAttribute('data-stage', 'paused');
  await page.evaluate(() => window.formHarness.setVisible(false));
  await expect(page.getByRole('button', { name: 'Resume form set', exact: true })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'HISTORY', exact: true })).toBeDisabled();
  await page.getByRole('button', { name: 'Resume form set', exact: true }).click();
  await expect(page.locator('.form-panel')).toHaveAttribute('data-stage', 'countdown');
  await expect(page.locator('.form-panel')).toHaveAttribute('data-stage', 'active', { timeout: 10_000 });
  await setPose(page, 170, 0.35, false, 0);
  await page.evaluate(() => window.formHarness.setVisible(true));
  await page.waitForTimeout(250);
  await expect(page.getByLabel('Reps meeting checks', { exact: true })).toHaveText('1');
  await expect(page.getByLabel('Full attempts not meeting checks', { exact: true })).toHaveText('1');

  await page.getByRole('button', { name: 'End form set', exact: true }).click();
  await expect(page.locator('.form-result-count strong')).toHaveText('1');
  await expect(page.locator('.form-result-detail strong')).toHaveText('1');
  await expect(page.getByText('Saved to your workout history.', { exact: true })).toBeVisible();
  await expectCameraStopped(page);
  await page.getByRole('button', { name: 'HISTORY', exact: true }).click();
  await expect(page.locator('.history-row')).toHaveCount(1);
  await expect(page.getByLabel('Form check set', { exact: true })).toHaveText('FORM');
  await expect(page.locator('.history-meta')).toContainText('Standard pushups · 1 full attempts outside checks');
  await expect(page.locator('.history-value').first().locator('strong')).toHaveText('1');

  await page.reload();
  await page.getByRole('button', { name: 'HISTORY', exact: true }).click();
  await expect(page.locator('.history-row')).toHaveCount(1);
  await expect(page.getByLabel('Form check set', { exact: true })).toHaveText('FORM');
  await expect(page.locator('.history-value').first().locator('strong')).toHaveText('1');
});

test('setup can start before posture is ready and the Knees variant counts a real UI cycle', async ({ page }) => {
  await setPose(page, 170, 0.35, true, 0);
  await page.getByRole('button', { name: 'Start camera', exact: true }).click();
  await expect(page.locator('.form-panel')).toHaveAttribute('data-stage', 'ready');
  await expect(page.getByRole('button', { name: 'Start form set', exact: true })).toBeEnabled();
  await expect(page.locator('.form-cue')).toContainText(/keep your knees straight/i);
  await page.getByRole('radio', { name: /Knees/ }).check();
  await startSet(page);
  await expect(page.getByRole('radio', { name: /Standard/ })).toBeDisabled();
  await fullCycle(page, { bentKnee: true });
  await expect(page.getByLabel('Reps meeting checks', { exact: true })).toHaveText('1');
  await expect(page.getByLabel('Full attempts not meeting checks', { exact: true })).toHaveText('0');
  await page.getByRole('button', { name: 'End form set', exact: true }).click();
  await expect(page.getByText('Saved to your workout history.', { exact: true })).toBeVisible();
  await expectCameraStopped(page);
  await page.getByRole('button', { name: 'HISTORY', exact: true }).click();
  await expect(page.locator('.history-row')).toHaveCount(1);
  await expect(page.locator('.history-meta')).toContainText('Knee pushups · 0 full attempts outside checks');
  await expect(page.locator('.history-value').first().locator('strong')).toHaveText('1');
});

test('a set starts without a body, checks posture after preparation, and recovers tracking without another tap', async ({ page }) => {
  await page.evaluate(() => window.formHarness.setVisible(false));
  await page.getByRole('button', { name: 'Start camera', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start form set', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Start form set', exact: true }).click();
  await expect(page.locator('.form-panel')).toHaveAttribute('data-stage', 'countdown');
  await expect(page.getByRole('button', { name: 'HISTORY', exact: true })).toBeDisabled();
  await page.waitForTimeout(1200);
  await expect(page.locator('.form-panel')).toHaveAttribute('data-stage', 'countdown');
  await expect(page.getByLabel('Reps meeting checks', { exact: true })).toHaveText('0');
  await expect(page.locator('.form-panel')).toHaveAttribute('data-stage', 'active', { timeout: 10_000 });

  // Unseen movements cannot earn credit, even though the set has started.
  await fullCycle(page);
  await expect(page.locator('.form-panel')).toHaveAttribute('data-stage', 'active');
  await expect(page.getByLabel('Reps meeting checks', { exact: true })).toHaveText('0');
  await expect(page.getByLabel('Full attempts not meeting checks', { exact: true })).toHaveText('0');

  // Enter the camera after preparation. The real counter still rejects a
  // completed movement with a sustained hip fault, then accepts a valid one.
  await setPose(page, 170, 0.35, false, 0);
  await page.evaluate(() => window.formHarness.setVisible(true));
  await page.waitForTimeout(250);
  await fullCycle(page, { hipY: 0.49 });
  await expect(page.getByLabel('Reps meeting checks', { exact: true })).toHaveText('0');
  await expect(page.getByLabel('Full attempts not meeting checks', { exact: true })).toHaveText('1');
  await fullCycle(page);
  await expect(page.getByLabel('Reps meeting checks', { exact: true })).toHaveText('1');

  // Lose tracking halfway through a movement. Reappearing at the top must
  // discard that partial, stay active and allow a fresh cycle without tapping.
  await setPose(page, 135);
  await setPose(page, 90);
  await page.evaluate(() => window.formHarness.setVisible(false));
  await page.waitForTimeout(800);
  await expect(page.locator('.form-panel')).toHaveAttribute('data-stage', 'active');
  await expect(page.getByRole('button', { name: 'Resume form set', exact: true })).toHaveCount(0);
  await setPose(page, 170, 0.35, false, 0);
  await page.evaluate(() => window.formHarness.setVisible(true));
  await page.waitForTimeout(250);
  await expect(page.getByLabel('Reps meeting checks', { exact: true })).toHaveText('1');
  await fullCycle(page);
  await expect(page.getByLabel('Reps meeting checks', { exact: true })).toHaveText('2');
  await expect(page.getByLabel('Full attempts not meeting checks', { exact: true })).toHaveText('1');
  await page.getByRole('button', { name: 'End form set', exact: true }).click();
  await expect(page.locator('.form-result-count strong')).toHaveText('2');
  await expect(page.getByText('Saved to your workout history.', { exact: true })).toBeVisible();
  await expectCameraStopped(page);
});
