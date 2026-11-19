import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Search } from "lucide-react";
import { shortcutKeys, type ShortcutId } from "./shortcuts";

export type PaletteGroup = "Go to" | "Months" | "Transactions" | "Categories" | "Actions";

export type PaletteItem = {
  id: string;
  group: PaletteGroup;
  label: string;
  hint?: string;
  icon?: ReactNode;
  shortcut?: ShortcutId;
  keywords?: string;
  run: () => void;
};

const GROUP_ORDER: PaletteGroup[] = ["Actions", "Go to", "Transactions", "Categories", "Months"];
const EMPTY_LIMIT: Partial<Record<PaletteGroup, number>> = { Actions: 6, "Go to": 9, Months: 4 };
const PER_GROUP = 6;

// Forgiving match: a contiguous hit scores highest, earlier and at a word start
// better; failing that, the letters in order (so "nwtr" finds "New transaction").
export function score(text: string, query: string): number {
  const t = text.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return 1;
  const at = t.indexOf(q);
  if (at >= 0) return 100 - Math.min(at, 40) + (at === 0 || t[at - 1] === " " ? 20 : 0);
  let ti = 0;
  let gaps = 0;
  for (const ch of q) {
    if (ch === " ") continue;
    const next = t.indexOf(ch, ti);
    if (next < 0) return 0;
    gaps += next - ti;
    ti = next + 1;
  }
  return Math.max(1, 40 - gaps);
}

type Props = {
  onClose: () => void;
  items: PaletteItem[];
  /** Searched only once there is a query: too many to list up front. */
  searchMore?: (query: string) => PaletteItem[];
};

export default function CommandPalette({ onClose, items, searchMore }: Props) {
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const returnFocus = useRef<Element | null>(null);

  useEffect(() => {
    returnFocus.current = document.activeElement;
    inputRef.current?.focus();
    return () => {
      const el = returnFocus.current as HTMLElement | null;
      if (el && typeof el.focus === "function" && document.contains(el)) el.focus();
    };
  }, []);

  const groups = useMemo(() => {
    const q = query.trim();
    const pool = q.length >= 2 && searchMore ? [...items, ...searchMore(q)] : items;
    const scored = pool
      .map((item) => ({ item, s: Math.max(score(item.label, q), item.keywords ? score(item.keywords, q) * 0.8 : 0) }))
      .filter((r) => r.s > 0);
    const out: { group: PaletteGroup; items: PaletteItem[] }[] = [];
    for (const group of GROUP_ORDER) {
      const inGroup = scored.filter((r) => r.item.group === group);
      if (q) inGroup.sort((a, b) => b.s - a.s);
      const limit = q ? PER_GROUP : EMPTY_LIMIT[group] ?? 0;
      const list = inGroup.slice(0, limit).map((r) => r.item);
      if (list.length) out.push({ group, items: list });
    }
    // With a query, the group holding the best match leads.
    if (q) {
      const best = (g: { items: PaletteItem[] }) => Math.max(...g.items.map((i) => score(i.label, q)));
      out.sort((a, b) => best(b) - best(a));
    }
    return out;
  }, [items, query, searchMore]);

  const flat = useMemo(() => groups.flatMap((g) => g.items), [groups]);

  useEffect(() => setActive(0), [query]);

  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function run(item: PaletteItem | undefined) {
    if (!item) return;
    onClose();
    // After the palette has gone, so focus moves to wherever the action points.
    requestAnimationFrame(() => item.run());
  }

  function onKeyDown(event: React.KeyboardEvent) {
    // Keys handled here never reach the app's own shortcuts underneath.
    if (["ArrowDown", "ArrowUp", "Enter", "Escape", "Tab"].includes(event.key)) event.stopPropagation();
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive((i) => (flat.length ? (i + 1) % flat.length : 0));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive((i) => (flat.length ? (i - 1 + flat.length) % flat.length : 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      run(flat[active]);
    } else if (event.key === "Escape") {
      event.preventDefault();
      onClose();
    } else if (event.key === "Tab") {
      // Focus stays in the palette: it is the only thing on screen that takes input.
      event.preventDefault();
    }
  }

  let index = -1;
  return (
    <div className="paletteLayer" onPointerDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-modal="true" aria-label="Command bar" onKeyDown={onKeyDown}>
        <label className="paletteSearch">
          <Search size={18} aria-hidden="true" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search pages, months, transactions and actions"
            role="combobox"
            aria-expanded="true"
            aria-controls="paletteList"
            aria-activedescendant={flat[active] ? `palette-${flat[active].id}` : undefined}
            aria-autocomplete="list"
            spellCheck={false}
          />
          <kbd className="paletteEsc">Esc</kbd>
        </label>
        <div className="paletteList" id="paletteList" role="listbox" ref={listRef} aria-label="Results">
          {groups.length === 0 && <p className="paletteEmpty">Nothing matches &ldquo;{query}&rdquo;.</p>}
          {groups.map((g) => (
            <div key={g.group} role="group" aria-label={g.group} className="paletteGroup">
              <div className="paletteGroupLabel" aria-hidden="true">{g.group}</div>
              {g.items.map((item) => {
                index += 1;
                const i = index;
                return (
                  <div
                    key={item.id}
                    id={`palette-${item.id}`}
                    data-index={i}
                    role="option"
                    aria-selected={i === active}
                    className={i === active ? "paletteItem active" : "paletteItem"}
                    onPointerMove={() => i !== active && setActive(i)}
                    onClick={() => run(item)}
                  >
                    <span className="paletteIcon" aria-hidden="true">{item.icon}</span>
                    <span className="paletteLabel">{item.label}</span>
                    {item.hint && <span className="paletteHint">{item.hint}</span>}
                    {item.shortcut && (
                      <span className="paletteKeys" aria-label={`Shortcut ${shortcutKeys(item.shortcut).join(" ")}`}>
                        {shortcutKeys(item.shortcut).map((k) => (
                          <kbd key={k}>{k}</kbd>
                        ))}
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
        <div className="paletteFoot" aria-hidden="true">
          <span><kbd>↑</kbd><kbd>↓</kbd> to move</span>
          <span><kbd>↵</kbd> to open</span>
          <span><kbd>/</kbd> searches this month&rsquo;s ledger</span>
        </div>
      </div>
    </div>
  );
}
