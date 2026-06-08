export type PicksMainView = "list" | "bracket";

const STORAGE_KEY = "ashbracket.wc.picks.mainView";

export function readPicksMainViewPreference(
  fallback: PicksMainView,
): PicksMainView {
  if (typeof window === "undefined") return fallback;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "list" || stored === "bracket") return stored;
  } catch {
    /* private mode / blocked storage */
  }
  return fallback;
}

export function writePicksMainViewPreference(view: PicksMainView): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, view);
  } catch {
    /* ignore */
  }
}
