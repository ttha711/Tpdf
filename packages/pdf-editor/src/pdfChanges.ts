import type { PdfChange, Mark } from "./history.js";
import type { PdfSource } from "./types.js";

export async function sourceBytes(source: PdfSource): Promise<Uint8Array> {
  if ("bytes" in source) return new Uint8Array(source.bytes);
  // This is exactly the host-provided URL; no Tpdf endpoint is constructed.
  const response = await fetch(source.url, { credentials: "same-origin" });
  if (!response.ok) throw new Error("PDF download failed (" + response.status + ")");
  return new Uint8Array(await response.arrayBuffer());
}
function ascii(text: string): string {
  return text.normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d").replace(/Đ/g, "D").replace(/[^\x20-\x7e]/g, "").slice(0, 2000);
}
export async function applyChanges(bytes: Uint8Array, changes: PdfChange[]): Promise<Uint8Array> {
  if (!changes.length) return new Uint8Array(bytes);
  const pdf = await import("pdf-lib");
  const doc = await pdf.PDFDocument.load(bytes, { updateMetadata: false });
  const font = await doc.embedFont(pdf.StandardFonts.Helvetica);
  const origin = [...doc.getPages()];
  for (const edit of changes) {
    if (edit.kind === "mark") {
      const page = origin[edit.mark.region.page - 1];
      if (!page) throw new Error("Mark references a missing page.");
      drawMark(pdf, page, edit.mark, font);
    } else if (edit.kind === "field") {
      // Fail clearly for missing or non-text AcroForm fields.
      doc.getForm().getTextField(edit.field).setText(edit.value.slice(0, 2000));
    }
  }
  const order = [...origin];
  let structural = false;
  for (const edit of changes) {
    if (edit.kind === "rotate") {
      const page = order[edit.page - 1];
      if (!page) throw new Error("Invalid page number.");
      page.setRotation(pdf.degrees((page.getRotation().angle + 90) % 360));
    } else if (edit.kind === "delete") {
      if (order.length <= 1 || !order[edit.page - 1]) throw new Error("Cannot delete this page.");
      order.splice(edit.page - 1, 1);
      structural = true;
    } else if (edit.kind === "insert") {
      order.splice(Math.max(0, Math.min(order.length, edit.page)), 0, doc.addPage([612, 792]));
      structural = true;
    } else if (edit.kind === "move") {
      const moving = order.splice(edit.page - 1, 1)[0];
      if (!moving) throw new Error("Invalid page number.");
      order.splice(Math.max(0, Math.min(order.length, edit.to - 1)), 0, moving);
      structural = true;
    }
  }
  if (structural) {
    // Copying page streams preserves visual content but may discard AcroForm
    // interactivity; do not claim form preservation across structural changes.
    const reordered = await pdf.PDFDocument.create();
    const sourcePages = doc.getPages();
    const copied = await reordered.copyPages(doc, order.map((page) => sourcePages.indexOf(page)));
    copied.forEach((page) => reordered.addPage(page));
    return new Uint8Array(await reordered.save());
  }
  return new Uint8Array(await doc.save());
}
function drawMark(pdf: typeof import("pdf-lib"), page: import("pdf-lib").PDFPage,
  mark: Mark, font: import("pdf-lib").PDFFont) {
  if (mark.schemaVersion === 1) throw Error("P1 marks require host adapter.applyChanges for PDF annotations");
  const { x, y, width, height, note } = mark.region;
  const size = page.getSize();
  const px = x * size.width / 100, py = (100 - y - height) * size.height / 100;
  const pw = width * size.width / 100, ph = height * size.height / 100;
  if (mark.type === "draw" && mark.points && mark.points.length > 1) {
    for (let i = 1; i < mark.points.length; i++) {
      const [ax, ay] = mark.points[i - 1], [bx, by] = mark.points[i];
      page.drawLine({ start: { x: ax * size.width / 100, y: (100 - ay) * size.height / 100 },
        end: { x: bx * size.width / 100, y: (100 - by) * size.height / 100 },
        color: pdf.rgb(0.12, 0.28, 0.9), thickness: 2 });
    }
    return;
  }
  if (mark.type === "highlight") {
    page.drawRectangle({ x: px, y: py, width: pw, height: ph,
      color: pdf.rgb(1, 0.84, 0.18), opacity: 0.3 });
  } else if (mark.type === "cover") {
    // Visual cover only; underlying source text remains extractable!
    page.drawRectangle({ x: px, y: py, width: pw, height: ph, color: pdf.rgb(0, 0, 0) });
  } else if (mark.type === "note" || mark.type === "signature") {
    const label = ascii(mark.value || note || (mark.type === "signature" ? "Signed" : "Note"));
    if (label) page.drawText(label.slice(0, 160), { x: px, y: Math.max(0, py),
      size: Math.min(15, Math.max(7, ph * 0.6)), font, color: pdf.rgb(0.12, 0.28, 0.8) });
  }
}
