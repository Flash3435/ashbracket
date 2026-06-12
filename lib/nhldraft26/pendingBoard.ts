export const NHL_DRAFT26_PENDING_BOARD_KEY = "nhldraft26.pendingBoard";

export type NhlDraft26PendingBoard = {
  prospectIds: string[];
  displayName: string;
  updatedAt: string;
};

function isPendingBoard(value: unknown): value is NhlDraft26PendingBoard {
  if (!value || typeof value !== "object") return false;
  const o = value as Record<string, unknown>;
  return (
    Array.isArray(o.prospectIds) &&
    o.prospectIds.every((id) => typeof id === "string") &&
    typeof o.displayName === "string" &&
    typeof o.updatedAt === "string"
  );
}

export function readNhlDraft26PendingBoard(): NhlDraft26PendingBoard | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(NHL_DRAFT26_PENDING_BOARD_KEY);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isPendingBoard(parsed)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeNhlDraft26PendingBoard(board: NhlDraft26PendingBoard): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(NHL_DRAFT26_PENDING_BOARD_KEY, JSON.stringify(board));
  } catch {
    /* private mode / blocked storage */
  }
}

export function clearNhlDraft26PendingBoard(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(NHL_DRAFT26_PENDING_BOARD_KEY);
  } catch {
    /* ignore */
  }
}
