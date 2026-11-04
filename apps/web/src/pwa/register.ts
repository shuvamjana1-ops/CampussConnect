/** Registers the service staff (push handler, app-shell cache, Background Sync relay). */
export function registerServiceWorker(): void {
  if (!("serviceWorker" in navigator) || import.meta.env.DEV) return;
  window.addEventListener("load", () => {
    void navigator.serviceWorker.register("/sw.js", { scope: "/" });
  });
}
