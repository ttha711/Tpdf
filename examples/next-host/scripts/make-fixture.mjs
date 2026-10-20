import { PDFDocument, StandardFonts } from "pdf-lib";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
const pdf = await PDFDocument.create();
const font = await pdf.embedFont(StandardFonts.Helvetica);
pdf.addPage([612,792]).drawText("Fire escape minimum width 1.2 m", {
  x: 90, y: 690, size: 19, font });
pdf.addPage([612,792]).drawText("Floor plan level 2", { x: 90, y: 690, size: 19, font });
await mkdir("public", { recursive: true });
await writeFile(join("public", "fixture.pdf"), await pdf.save());
console.log("Generated public/fixture.pdf (2 pages)");
