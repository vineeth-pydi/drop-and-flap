import { afterEach, expect, test, vi } from 'vitest';

afterEach(() => { vi.unstubAllGlobals(); });

async function setup(waiting = true) {
  vi.resetModules();
  const reload = vi.fn();
  const worker = { postMessage: vi.fn() };
  const registration = Object.assign(new EventTarget(), { waiting: waiting ? worker : null, installing: null });
  const serviceWorker = Object.assign(new EventTarget(), { register: vi.fn().mockResolvedValue(registration) });
  vi.stubGlobal('navigator', { serviceWorker });
  vi.stubGlobal('window', { location: { reload } });
  const update = await import('./appUpdate');
  await update.registerAppWorker();
  return { update, serviceWorker, registration, worker, reload };
}

test('an update activated by another tab does not reload a running set', async () => {
  const { update, serviceWorker, worker, reload } = await setup();
  expect(update.hasAppUpdate()).toBe(true);
  serviceWorker.dispatchEvent(new Event('controllerchange'));
  expect(worker.postMessage).not.toHaveBeenCalled();
  expect(reload).not.toHaveBeenCalled();
});

test('the explicit update action waits for the new controller before reloading', async () => {
  const { update, serviceWorker, worker, reload } = await setup();
  expect(update.applyAppUpdate()).toBe(true);
  expect(worker.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  expect(reload).not.toHaveBeenCalled();
  serviceWorker.dispatchEvent(new Event('controllerchange'));
  expect(reload).toHaveBeenCalledOnce();
});

test('no pending worker means no activation or reload request', async () => {
  const { update, serviceWorker, reload } = await setup(false);
  expect(update.hasAppUpdate()).toBe(false);
  expect(update.applyAppUpdate()).toBe(false);
  serviceWorker.dispatchEvent(new Event('controllerchange'));
  expect(reload).not.toHaveBeenCalled();
});
