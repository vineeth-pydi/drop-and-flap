let registration: ServiceWorkerRegistration | null = null;
let reloadRequested = false;
const listeners = new Set<() => void>();

export function hasAppUpdate(): boolean {
  return !!registration?.waiting;
}

export function subscribeAppUpdate(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function applyAppUpdate(): boolean {
  const waiting = registration?.waiting;
  if (!waiting) return false;
  reloadRequested = true;
  waiting.postMessage({ type: 'SKIP_WAITING' });
  return true;
}

export async function registerAppWorker(): Promise<void> {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    // Another tab may activate an update. Only reload this tab after its own
    // explicit update action, so an in-progress set is never interrupted.
    if (reloadRequested) window.location.reload();
  });
  try {
    registration = await navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`);
    const notify = () => { if (hasAppUpdate()) listeners.forEach((listener) => listener()); };
    notify();
    const watchInstalling = () => {
      const installing = registration?.installing;
      installing?.addEventListener('statechange', () => {
        if (installing.state === 'installed') notify();
      });
    };
    watchInstalling();
    registration.addEventListener('updatefound', watchInstalling);
  } catch { /* Camera and local play still work if offline installation fails. */ }
}
