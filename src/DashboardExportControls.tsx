import { useEffect, useRef, useState } from "react";
import { ChevronDown, Download, FileText, Image as ImageIcon } from "lucide-react";
import { exportDashboard, type DashboardExportFormat } from "./dashboardExport";

// One "Export" button beside the dashboard title, opening a two-item menu (image or PDF). The
// outcome is announced through the app's toast, so the title row never shifts.
export function DashboardExportControls({ month, label, notify }: { month: string; label: string; notify: (message: string) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!shellRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setOpen(false);
      buttonRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function run(format: DashboardExportFormat) {
    setOpen(false);
    buttonRef.current?.focus();
    const grid = document.querySelector<HTMLElement>('[aria-label="dashboard widgets"]');
    if (!grid || busy) return;
    setBusy(true);
    grid.setAttribute("data-exporting", "true");
    try {
      await exportDashboard(grid, format, month, label);
      notify(format === "png" ? `Dashboard image saved · ${label}` : `Dashboard PDF saved · ${label}`);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Export failed. Please try again.");
    } finally {
      grid.removeAttribute("data-exporting");
      setBusy(false);
    }
  }

  // Arrow keys walk the two items, as in any menu.
  function onMenuKey(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowDown" && event.key !== "ArrowUp") return;
    event.preventDefault();
    const items = [...event.currentTarget.querySelectorAll<HTMLButtonElement>("button")];
    const next = items.indexOf(document.activeElement as HTMLButtonElement) + (event.key === "ArrowDown" ? 1 : -1);
    items[(next + items.length) % items.length]?.focus();
  }

  return (
    <div className="dashboardExport" ref={shellRef} data-export-ignore>
      <button ref={buttonRef} type="button" className="commandButton" aria-haspopup="menu" aria-expanded={open} disabled={busy} onClick={() => setOpen((value) => !value)}>
        <Download size={14} />
        {busy ? "Exporting…" : "Export"}
        {!busy && <ChevronDown size={13} aria-hidden="true" />}
      </button>
      {open && (
        <div className="navContextMenu dashboardExportMenu" role="menu" aria-label="Export dashboard" onKeyDown={onMenuKey}>
          <button type="button" role="menuitem" autoFocus onClick={() => void run("png")}>
            <ImageIcon size={15} />
            Image (PNG)
          </button>
          <button type="button" role="menuitem" onClick={() => void run("pdf")}>
            <FileText size={15} />
            PDF document
          </button>
        </div>
      )}
    </div>
  );
}
