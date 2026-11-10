import { expect, test } from '@playwright/test'

test('form checks request camera only on click and explain denied access without fabricating a set', async ({ page }) => {
  await page.addInitScript(() => {
    const state = window as typeof window & { formCameraRequests: number }
    state.formCameraRequests = 0
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        state.formCameraRequests += 1
        throw new DOMException('Permission denied in browser test.', 'NotAllowedError')
      },
    })
  })
  await page.goto('./')
  await page.getByRole('button', { name: 'FORM', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Check your form.' })).toBeVisible()
  await expect(page.getByRole('radio', { name: /Standard/ })).toBeChecked()
  await page.getByRole('radio', { name: /Knees/ }).check()
  await expect(page.getByRole('radio', { name: /Knees/ })).toBeChecked()
  expect(await page.evaluate(() => (window as typeof window & { formCameraRequests: number }).formCameraRequests)).toBe(0)
  await page.getByRole('button', { name: 'Start camera', exact: true }).click()
  await expect(page.locator('.form-error')).toContainText(/permission|allow the camera/i)
  await expect(page.getByRole('button', { name: 'Retry camera', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Start form set', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('Reps meeting checks', { exact: true })).toHaveText('0')
  expect(await page.evaluate(() => (window as typeof window & { formCameraRequests: number }).formCameraRequests)).toBe(1)
  await page.getByRole('button', { name: 'HISTORY', exact: true }).click()
  await expect(page.locator('.history-row')).toHaveCount(0)
})

test('a live camera starts a set before a person is visible but cannot give unseen reps credit', async ({ page }) => {
  test.setTimeout(60_000)
  await page.addInitScript(() => {
    Object.defineProperty(navigator.mediaDevices, 'getUserMedia', {
      configurable: true,
      value: async () => {
        const canvas = document.createElement('canvas')
        canvas.width = 640
        canvas.height = 480
        const context = canvas.getContext('2d')!
        context.fillStyle = '#111820'
        context.fillRect(0, 0, 640, 480)
        const stream = canvas.captureStream(10)
        const track = stream.getVideoTracks()[0]
        ;(window as typeof window & { formCameraTrack: MediaStreamTrack }).formCameraTrack = track
        let tick = 0
        const timer = window.setInterval(() => {
          context.fillStyle = ++tick % 2 ? '#111821' : '#111820'
          context.fillRect(0, 0, 640, 480)
          if (track.readyState === 'ended') window.clearInterval(timer)
        }, 100)
        return stream
      },
    })
  })
  await page.goto('./')
  await page.getByRole('button', { name: 'FORM', exact: true }).click()
  await page.getByRole('button', { name: 'Start camera', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Start form set', exact: true })).toBeEnabled({ timeout: 35_000 })
  await page.getByRole('button', { name: 'Start form set', exact: true }).click()
  await expect(page.locator('.form-panel')).toHaveAttribute('data-stage', 'countdown')
  await page.waitForTimeout(1200)
  await expect(page.locator('.form-panel')).toHaveAttribute('data-stage', 'countdown')
  await expect(page.locator('.form-panel')).toHaveAttribute('data-stage', 'active', { timeout: 10_000 })
  await page.waitForTimeout(800)
  await expect(page.locator('.form-panel')).toHaveAttribute('data-stage', 'active')
  await expect(page.getByLabel('Reps meeting checks', { exact: true })).toHaveText('0')
  await expect(page.getByLabel('Full attempts not meeting checks', { exact: true })).toHaveText('0')
  await page.getByRole('button', { name: 'End form set', exact: true }).click()
  await expect(page.locator('.form-result-count strong')).toHaveText('0')
  await expect(page.getByText('Saved to your workout history.', { exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => (window as typeof window & { formCameraTrack: MediaStreamTrack }).formCameraTrack.readyState)).toBe('ended')
  await page.getByRole('button', { name: 'HISTORY', exact: true }).click()
  await expect(page.locator('.history-row')).toHaveCount(1)
  await expect(page.locator('.history-value').first().locator('strong')).toHaveText('0')
})

test('form setup fits a 390px screen and leaves real checks unknown before camera access', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('./')
  await page.getByRole('button', { name: 'FORM', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Check your form.' })).toBeVisible()
  await expect(page.getByText('Not visible', { exact: true })).toBeVisible()
  await expect(page.locator('.form-measures')).toContainText('—')
  await expect(page.getByText('Experimental form cues. Side-view estimates; not a safety assessment.', { exact: true })).toBeVisible()
  await expect.poll(() => page.evaluate(() => Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - window.innerWidth)).toBeLessThanOrEqual(1)
  const frame = await page.locator('.form-camera-frame').boundingBox()
  expect(frame?.width).toBeLessThanOrEqual(390)
})
