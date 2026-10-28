/*
 * One delegated listener for the cursor light (docs/UI_WOW_RECIPE.md):
 * writes --mx/--my on the lit surface under a mouse pointer. Touch and pen
 * are ignored; nothing runs on devices without a fine hover pointer.
 */
const LIT_SURFACES = ".wine-row, .cellar-home-stat, .cellar-showcase-card";

let installed = false;

export function installPointerLight() {
  if (installed || typeof window === "undefined" || !window.matchMedia("(hover: hover) and (pointer: fine)").matches) return;
  installed = true;
  let frame = 0;
  let pending: { target: HTMLElement; x: number; y: number } | null = null;
  document.addEventListener("pointermove", (event) => {
    if (event.pointerType !== "mouse") return;
    const target = (event.target as Element | null)?.closest<HTMLElement>(LIT_SURFACES);
    if (!target) return;
    const rect = target.getBoundingClientRect();
    pending = { target, x: event.clientX - rect.left, y: event.clientY - rect.top };
    if (frame) return;
    frame = window.requestAnimationFrame(() => {
      frame = 0;
      if (!pending) return;
      pending.target.style.setProperty("--mx", `${pending.x.toFixed(0)}px`);
      pending.target.style.setProperty("--my", `${pending.y.toFixed(0)}px`);
      pending = null;
    });
  }, { passive: true });
}
