const TABLET_LAYOUT_KEY = "vinaris-tablet-desktop-layout";
const TABLET_VIEWPORT = "width=device-width, initial-scale=1.0, viewport-fit=cover";
const DESKTOP_VIEWPORT = "width=1280, initial-scale=1.0, viewport-fit=cover";

export function isTabletDevice() {
  const shortSide = Math.min(window.screen.width, window.screen.height, window.innerWidth);
  const tabletUserAgent = /iPad|Tablet|Android(?!.*Mobile)/i.test(navigator.userAgent);
  const coarsePointer = window.matchMedia("(pointer: coarse)").matches;
  // iPadOS can identify as a Mac; touch support alone also includes Windows laptops.
  const desktopIpad = /Macintosh/i.test(navigator.userAgent) && navigator.maxTouchPoints > 0;
  return (tabletUserAgent || coarsePointer || desktopIpad) && shortSide >= 600 && shortSide <= 1100;
}

export function applyTabletLayout(desktop: boolean) {
  const viewport = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
  if (viewport) viewport.content = desktop ? DESKTOP_VIEWPORT : TABLET_VIEWPORT;
  document.documentElement.classList.toggle("tablet-desktop-mode", desktop);
  if (desktop) document.documentElement.style.setProperty("--tablet-short-side", `${Math.min(window.screen.width, window.screen.height)}px`);
  else document.documentElement.style.removeProperty("--tablet-short-side");
}

export function initializeTabletLayout() {
  if (!isTabletDevice()) {
    applyTabletLayout(false);
    return false;
  }
  let desktop = false;
  try {
    desktop = window.localStorage.getItem(TABLET_LAYOUT_KEY) === "desktop";
  } catch {
    // Storage may be unavailable in private browsing; the choice still works for this visit.
  }
  applyTabletLayout(desktop);
  return desktop;
}

export function saveTabletLayout(desktop: boolean) {
  applyTabletLayout(desktop);
  try {
    window.localStorage.setItem(TABLET_LAYOUT_KEY, desktop ? "desktop" : "tablet");
  } catch {
    // Keep the current layout even if the browser cannot persist the preference.
  }
}
