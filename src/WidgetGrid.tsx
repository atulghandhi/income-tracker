import { useRef, useState } from "react";
import type { DragEvent, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { ArrowLeft, ArrowRight, Check, GripVertical, Minus, Plus, RotateCcw, SlidersHorizontal, X } from "lucide-react";
import { SIZE_LABELS, spanFor, widgetDefinition, type LayoutPage, type PageLayout, type WidgetDefinition, type WidgetSize } from "./layout";
import type { RegionKey } from "./region";

// The customisable grid behind the Dashboard. In normal use it simply lays the
// widgets out; in edit mode each widget grows a toolbar (drag handle, move, resize, remove) and a
// tray of hidden widgets appears underneath so they can be added back. Its bottom corners can also be
// dragged to resize: the width snaps to the nearest size the widget allows.

export type WidgetRenderer = (id: string, size: WidgetSize) => ReactNode;

type DropPreview = { targetId: string; edge: "before" | "after" } | null;

const GRID_COLUMNS = 6;

// The allowed size whose column span is closest to the dragged width.
export function sizeForWidth(width: number, gridWidth: number, gap: number, sizes: WidgetSize[]): WidgetSize {
  const column = (gridWidth - gap * (GRID_COLUMNS - 1)) / GRID_COLUMNS;
  const span = (width + gap) / (column + gap);
  return sizes.reduce((best, size) => (Math.abs(spanFor(size) - span) < Math.abs(spanFor(best) - span) ? size : best), sizes[0]);
}

export function WidgetGrid({
  page,
  region,
  layout,
  editing,
  hidden,
  render,
  onMove,
  onDrop,
  onResize,
  onSetSize,
  onRemove,
  onAdd,
  onReset,
}: {
  page: LayoutPage;
  region: RegionKey;
  layout: PageLayout;
  editing: boolean;
  hidden: WidgetDefinition[];
  render: WidgetRenderer;
  onMove: (id: string, delta: number) => void;
  onDrop: (id: string, targetId: string, edge: "before" | "after") => void;
  onResize: (id: string, direction: 1 | -1) => void;
  onSetSize: (id: string, size: WidgetSize) => void;
  onRemove: (id: string) => void;
  onAdd: (id: string) => void;
  onReset: () => void;
}) {
  const [draggingId, setDraggingId] = useState<string | null>(null);
  const [dropPreview, setDropPreview] = useState<DropPreview>(null);
  const [resizing, setResizing] = useState<{ id: string; size: WidgetSize } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);

  function startCornerResize(event: ReactPointerEvent<HTMLElement>, id: string, corner: "left" | "right", sizes: WidgetSize[], current: WidgetSize) {
    const grid = gridRef.current;
    const cell = event.currentTarget.closest<HTMLElement>(".widgetCell");
    if (!grid || !cell) return;
    event.preventDefault();
    const gridWidth = grid.getBoundingClientRect().width;
    const gap = parseFloat(getComputedStyle(grid).columnGap) || 0;
    // The edge that stays put while the other is dragged.
    const anchor = corner === "right" ? cell.getBoundingClientRect().left : cell.getBoundingClientRect().right;
    let size = current;
    setResizing({ id, size });
    const move = (moveEvent: PointerEvent) => {
      const width = corner === "right" ? moveEvent.clientX - anchor : anchor - moveEvent.clientX;
      const next = sizeForWidth(width, gridWidth, gap, sizes);
      if (next !== size) {
        size = next;
        setResizing({ id, size });
      }
    };
    // On the window, so the drag keeps tracking when the pointer leaves the small grip.
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      setResizing(null);
      if (size !== current) onSetSize(id, size);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }

  function previewDrop(event: DragEvent<HTMLElement>, targetId: string) {
    if (!draggingId || draggingId === targetId) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    const rect = event.currentTarget.getBoundingClientRect();
    const edge = event.clientX - rect.left < rect.width / 2 ? "before" : "after";
    setDropPreview((current) => (current?.targetId === targetId && current.edge === edge ? current : { targetId, edge }));
  }

  function finishDrop(targetId: string) {
    if (draggingId && dropPreview?.targetId === targetId) onDrop(draggingId, targetId, dropPreview.edge);
    setDraggingId(null);
    setDropPreview(null);
  }

  return (
    <>
      <div ref={gridRef} className={`widgetGrid ${editing ? "isEditing" : ""}`} aria-label={`${page} widgets`}>
        {layout.widgets.map((placement, index) => {
          const definition = widgetDefinition(page, placement.id);
          if (!definition) return null;
          const title = definition.title[region];
          const sizeIndex = definition.sizes.indexOf(placement.size);
          const preview = dropPreview?.targetId === placement.id ? dropPreview.edge : null;
          const size = resizing?.id === placement.id ? resizing.size : placement.size;
          return (
            <section
              key={placement.id}
              className={`widgetCell size-${size} ${draggingId === placement.id ? "isDragging" : ""} ${preview ? `drop-${preview}` : ""} ${resizing?.id === placement.id ? "isResizing" : ""}`}
              style={{ gridColumn: `span ${spanFor(size)}` }}
              data-widget-id={placement.id}
              aria-label={title}
              onDragOver={editing ? (event) => previewDrop(event, placement.id) : undefined}
              onDragLeave={editing ? () => setDropPreview((current) => (current?.targetId === placement.id ? null : current)) : undefined}
              onDrop={editing ? () => finishDrop(placement.id) : undefined}
            >
              {editing && (
                <div className="widgetToolbar" role="toolbar" aria-label={`${title} layout controls`}>
                  <span
                    className="widgetHandle"
                    draggable
                    title="Drag to move"
                    onDragStart={(event) => {
                      event.dataTransfer.effectAllowed = "move";
                      event.dataTransfer.setData("text/plain", placement.id);
                      setDraggingId(placement.id);
                    }}
                    onDragEnd={() => {
                      setDraggingId(null);
                      setDropPreview(null);
                    }}
                  >
                    <GripVertical size={15} aria-hidden="true" />
                  </span>
                  <strong className="widgetToolbarTitle">{title}</strong>
                  <div className="widgetToolbarGroup">
                    <button className="iconButton" type="button" onClick={() => onMove(placement.id, -1)} disabled={index === 0} aria-label={`Move ${title} earlier`} data-tip="Move earlier">
                      <ArrowLeft size={15} />
                    </button>
                    <button
                      className="iconButton"
                      type="button"
                      onClick={() => onMove(placement.id, 1)}
                      disabled={index === layout.widgets.length - 1}
                      aria-label={`Move ${title} later`}
                      data-tip="Move later"
                    >
                      <ArrowRight size={15} />
                    </button>
                  </div>
                  <div className="widgetToolbarGroup widgetSizeGroup">
                    <button className="iconButton" type="button" onClick={() => onResize(placement.id, -1)} disabled={sizeIndex <= 0} aria-label={`Make ${title} narrower`} data-tip="Narrower">
                      <Minus size={15} />
                    </button>
                    <span className="widgetSizeLabel">{SIZE_LABELS[placement.size]}</span>
                    <button
                      className="iconButton"
                      type="button"
                      onClick={() => onResize(placement.id, 1)}
                      disabled={sizeIndex >= definition.sizes.length - 1}
                      aria-label={`Make ${title} wider`}
                      data-tip="Wider"
                    >
                      <Plus size={15} />
                    </button>
                  </div>
                  <button className="iconButton widgetRemove" type="button" onClick={() => onRemove(placement.id)} aria-label={`Remove ${title}`} data-tip="Remove">
                    <X size={15} />
                  </button>
                </div>
              )}
              <div className="widgetBody">{render(placement.id, placement.size)}</div>
              {editing &&
                definition.sizes.length > 1 &&
                (["left", "right"] as const).map((corner) => (
                  <span
                    key={corner}
                    className={`widgetResizeCorner ${corner}`}
                    title="Drag to resize"
                    aria-hidden="true"
                    onPointerDown={(event) => startCornerResize(event, placement.id, corner, definition.sizes, placement.size)}
                  />
                ))}
              {resizing?.id === placement.id && <span className="widgetResizeLabel">{SIZE_LABELS[size]}</span>}
            </section>
          );
        })}
        {!layout.widgets.length && (
          <div className="widgetEmpty" style={{ gridColumn: "1 / -1" }}>
            <SlidersHorizontal size={18} />
            <p>No widgets on this page. Add some from the tray below, or reset the layout.</p>
          </div>
        )}
      </div>

      {editing && (
        <div className="widgetTray" aria-label="Add widgets">
          <div className="widgetTrayHead">
            <div>
              <h3>Add widgets</h3>
              <p>Drag widgets to rearrange them, drag a bottom corner or use − / + to resize, × to remove. Changes save on this device.</p>
            </div>
            <button className="commandButton" type="button" onClick={onReset}>
              <RotateCcw size={14} />
              Reset layout
            </button>
          </div>
          {hidden.length ? (
            <div className="widgetTrayList">
              {hidden.map((definition) => (
                <div className="widgetTrayItem" key={definition.id}>
                  <div>
                    <strong>{definition.title[region]}</strong>
                    <p>{definition.description[region]}</p>
                  </div>
                  <button className="commandButton" type="button" onClick={() => onAdd(definition.id)} aria-label={`Add ${definition.title[region]} widget`}>
                    <Plus size={14} />
                    Add
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="widgetTrayEmpty">
              <Check size={14} />
              Every available widget is on the page.
            </p>
          )}
        </div>
      )}
    </>
  );
}
