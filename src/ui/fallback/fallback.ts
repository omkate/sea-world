/** Static descent shown when neither WebGPU nor WebGL2 is available. */
export function showFallback(reason: 'unsupported' | 'preview'): void {
  document.body.classList.add('fallback-mode');
  document.querySelector<HTMLElement>('#ocean')?.remove();
  document.querySelector<HTMLElement>('#hud')?.setAttribute('hidden', '');
  const el = document.querySelector<HTMLElement>('#fallback');
  if (!el) return;
  el.hidden = false;
  el.dataset.reason = reason;
}
