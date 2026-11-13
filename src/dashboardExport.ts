export type DashboardExportFormat = "png" | "pdf";

/** Render pixels only: hidden amounts never become searchable PDF text. */
export async function exportDashboard(element: HTMLElement, format: DashboardExportFormat, month: string, label = month): Promise<void> {
  const { snapdom } = await import("@zumer/snapdom");
  await document.fonts.ready;
  const widgets = [...element.querySelectorAll<HTMLElement>("[data-widget-id]")];
  if (!widgets.length) throw new Error("Add a dashboard widget before exporting.");
  const bounds = element.getBoundingClientRect();
  if (!bounds.width || !bounds.height) throw new Error("The dashboard is not ready. Please try again.");
  // Keep a complete image within browser canvas limits, even with every widget visible.
  const scale = Math.min(2, 16000 / bounds.width, 16000 / (bounds.height + 70), Math.sqrt(32_000_000 / (bounds.width * (bounds.height + 70))));
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(bounds.width * scale);
  canvas.height = Math.ceil((bounds.height + 70) * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Your browser could not create the export.");
  const style = getComputedStyle(element);
  const background = style.getPropertyValue("--surface").trim() || getComputedStyle(document.body).backgroundColor || "#ffffff";
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = style.color;
  ctx.font = `600 ${20 * scale}px ${style.fontFamily}`;
  ctx.fillText(`The Income Tracker · ${label}`, 16 * scale, 36 * scale);
  const hidden = Boolean(element.closest(".privacy-on"));
  // Gaps between rows of widgets, where a PDF page may end without slicing a card in half.
  const breaks = new Set<number>();
  for (const widget of widgets) {
    if (!element.isConnected) throw new Error("The dashboard changed. Open it and try again.");
    const rect = widget.getBoundingClientRect();
    const capture = await snapdom.toCanvas(widget, {
      scale, dpr: 1, embedFonts: true, backgroundColor: background,
      plugins: [{
        name: "final-financial-values",
        afterClone: ({ clone }) => {
          // Number animations may still be running after a month change.
          // Only update the detached capture; private amounts were already excluded.
          clone?.querySelectorAll<HTMLElement>("[data-export-value]").forEach((value) => {
            value.textContent = value.dataset.exportValue ?? "";
          });
          // Privacy mode blurs amounts on screen. A blur can be undone, so the export swaps the
          // digits for dots instead: the picture keeps its shape and holds no figures.
          if (hidden) {
            clone?.querySelectorAll<HTMLElement>(".sensitive, .masked, .rowTotal").forEach((value) => {
              const walker = document.createTreeWalker(value, NodeFilter.SHOW_TEXT);
              for (let text = walker.nextNode(); text; text = walker.nextNode()) {
                if (/\d/.test(text.textContent ?? "")) text.textContent = "•••";
              }
              value.style.filter = "none";
              value.style.opacity = "1";
            });
            clone?.querySelectorAll<HTMLInputElement>(".maskedInput input").forEach((input) => {
              input.value = "•••";
              input.setAttribute("value", "•••");
              input.style.filter = "none";
            });
          }
        },
      }],
      exclude: ".widgetResizeHandle, .widgetToolbar, .infoHint, .flowDetail, [data-export-ignore]",
    });
    ctx.drawImage(capture, (rect.left - bounds.left) * scale, (rect.top - bounds.top + 60) * scale, rect.width * scale, rect.height * scale);
    breaks.add(Math.floor((rect.top - bounds.top + 60 - 8) * scale));
  }
  const filename = `income-tracker-${month}`;
  if (format === "png") {
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("Image export failed. Please try PDF.")), "image/png"));
    downloadBlob(blob, `${filename}.png`);
  } else {
    const { jsPDF } = await import("jspdf");
    const pdf = new jsPDF({ unit: "mm", format: "a4" });
    const pageWidth = 190;
    const pageHeight = Math.floor(canvas.width * 277 / pageWidth);
    const stops = [...breaks].sort((x, y) => x - y);
    for (let top = 0; top < canvas.height; ) {
      // End the page at the last gap between widget rows that fits; a single widget taller than
      // a page is the only thing that gets cut.
      const limit = top + pageHeight;
      const gap = limit >= canvas.height ? canvas.height : stops.filter((stop) => stop > top + pageHeight * 0.25 && stop <= limit).pop();
      const bottom = gap ?? limit;
      if (top) pdf.addPage();
      const slice = document.createElement("canvas");
      slice.width = canvas.width;
      slice.height = bottom - top;
      const page = slice.getContext("2d");
      if (!page) throw new Error("Your browser could not create the PDF.");
      page.drawImage(canvas, 0, top, slice.width, slice.height, 0, 0, slice.width, slice.height);
      pdf.addImage(slice.toDataURL("image/png"), "PNG", 10, 10, pageWidth, slice.height * pageWidth / slice.width);
      top = bottom;
    }
    downloadBlob(pdf.output("blob"), `${filename}.pdf`);
  }
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  // Give Safari time to start consuming the download before releasing its URL.
  window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
