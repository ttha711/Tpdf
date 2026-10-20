import { PNG } from "pngjs";
const levels = new Set([0.25, 0.5, 1, 2, 4, 8, 16]);
const glyphs: Record<string, string[]> = {
  "0":["111","101","101","101","111"], "1":["010","110","010","010","111"],
  "2":["111","001","111","100","111"], "3":["111","001","111","001","111"],
  "4":["101","101","111","001","001"], "5":["111","100","111","001","111"],
  "6":["111","100","111","101","111"], "7":["111","001","010","010","010"],
  "8":["111","101","111","101","111"], "9":["111","101","111","001","111"],
  "P":["110","101","110","100","100"], "L":["100","100","100","100","111"],
  "X":["101","101","010","101","101"], "Y":["101","101","010","010","010"],
  ".":["000","000","000","000","010"], " ":["000","000","000","000","000"],
};
export const dynamic = "force-dynamic";
export async function GET(_req: Request, { params }: {
  params: { page: string; level: string; x: string; y: string };
}) {
  const page = Number(params.page), level = Number(params.level), x = Number(params.x), y = Number(params.y);
  const widthPt = page % 2 ? 2384.3 : 3370.5, heightPt = page % 2 ? 3370.5 : 2384.3;
  if (![page, level, x, y].every(Number.isFinite) || !Number.isInteger(page) ||
      !Number.isInteger(x) || !Number.isInteger(y) || page < 0 || page >= 100 ||
      x < 0 || y < 0 || !levels.has(level)) return new Response("Invalid tile", { status: 400 });
  const width = Math.min(512, Math.ceil(widthPt * level - x * 512));
  const height = Math.min(512, Math.ceil(heightPt * level - y * 512));
  if (width <= 0 || height <= 0) return new Response("Outside page", { status: 404 });
  const png = new PNG({ width, height });
  function pixel(px: number, py: number, r: number, g: number, b: number) {
    if (px < 0 || py < 0 || px >= width || py >= height) return;
    const off = (py * width + px) * 4;
    png.data[off] = r; png.data[off + 1] = g; png.data[off + 2] = b; png.data[off + 3] = 255;
  }
  for (let j = 0; j < height; j++) for (let i = 0; i < width; i++) {
    const gx = x * 512 + i, gy = y * 512 + j;
    const major = gx % 128 === 0 || gy % 128 === 0;
    const minor = gx % 32 === 0 || gy % 32 === 0;
    const border = gx === 0 || gy === 0 || i === 0 || j === 0;
    pixel(i, j, border ? 200 : major ? 40 : minor ? 185 : 248,
      border ? 35 : major ? 90 : minor ? 200 : 249,
      border ? 35 : major ? 185 : minor ? 215 : 251);
  }
  const label = "P" + page + " L" + level + " X" + x + " Y" + y;
  for (let c = 0; c < label.length; c++) {
    const glyph = glyphs[label[c]] || glyphs[" "];
    glyph.forEach((row, iy) => [...row].forEach((bit, ix) => {
      if (bit === "1") for (let dy = 0; dy < 3; dy++) for (let dx = 0; dx < 3; dx++)
        pixel(10 + c * 12 + ix * 3 + dx, 12 + iy * 3 + dy, 12, 30, 45);
    }));
  }
  return new Response(PNG.sync.write(png), { headers: {
    "Content-Type": "image/png", "Cache-Control": "public, max-age=31536000, immutable",
    "Access-Control-Allow-Origin": "*",
  } });
}
