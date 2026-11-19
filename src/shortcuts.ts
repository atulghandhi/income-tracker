// Every keyboard shortcut in one place. The global key handler checks events
// against these, and the command bar shows the same keys beside each action,
// so what the palette teaches is always what the keyboard does.

export type ShortcutId = "palette" | "search" | "newTransaction" | "prevMonth" | "nextMonth" | "focusMode";

type Shortcut = {
  /** Keys as shown to people. "Mod" becomes ⌘ on Apple devices and Ctrl elsewhere. */
  keys: string[];
  /** For aria-keyshortcuts. */
  aria: string;
  match: (event: KeyboardEvent, editable: boolean) => boolean;
};

const mod = (e: KeyboardEvent) => e.metaKey || e.ctrlKey;
const plain = (e: KeyboardEvent, editable: boolean) => !editable && !mod(e) && !e.altKey;
const altOnly = (e: KeyboardEvent, editable: boolean) => !editable && e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey;

export const SHORTCUTS: Record<ShortcutId, Shortcut> = {
  palette: { keys: ["Mod", "K"], aria: "Meta+K Control+K", match: (e) => mod(e) && e.key.toLowerCase() === "k" },
  search: { keys: ["/"], aria: "/", match: (e, ed) => plain(e, ed) && e.key === "/" },
  newTransaction: {
    keys: ["N"],
    aria: "N Meta+N Control+N",
    match: (e, ed) => (mod(e) && e.key.toLowerCase() === "n") || (plain(e, ed) && (e.key.toLowerCase() === "n" || e.key.toLowerCase() === "c")),
  },
  prevMonth: { keys: ["Alt", "←"], aria: "Alt+ArrowLeft", match: (e, ed) => altOnly(e, ed) && e.key === "ArrowLeft" },
  nextMonth: { keys: ["Alt", "→"], aria: "Alt+ArrowRight", match: (e, ed) => altOnly(e, ed) && e.key === "ArrowRight" },
  focusMode: { keys: ["Mod", "\\"], aria: "Meta+Backslash Control+Backslash", match: (e) => mod(e) && (e.key === "\\" || e.code === "Backslash") },
};

export function isApple(): boolean {
  try {
    return /Mac|iPhone|iPad|iPod/i.test(navigator.platform || navigator.userAgent);
  } catch {
    return false;
  }
}

/** The keys of a shortcut as people should read them on this device. */
export function shortcutKeys(id: ShortcutId): string[] {
  const apple = isApple();
  return SHORTCUTS[id].keys.map((k) => (k === "Mod" ? (apple ? "⌘" : "Ctrl") : k === "Alt" && apple ? "⌥" : k));
}

export function matchShortcut(event: KeyboardEvent, editable: boolean): ShortcutId | null {
  for (const id of Object.keys(SHORTCUTS) as ShortcutId[]) {
    if (SHORTCUTS[id].match(event, editable)) return id;
  }
  return null;
}
