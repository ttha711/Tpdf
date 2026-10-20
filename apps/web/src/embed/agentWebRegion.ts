export type PdfRegion = { page: number; x: number; y: number; width: number; height: number; note: string };
export type Point = { x: number; y: number };

export function isValidRegion(value: PdfRegion | undefined | null, count: number): boolean {
  return Boolean(value && Number.isInteger(value.page) && value.page >= 1 && value.page <= count &&
    [value.x, value.y, value.width, value.height].every((v) => Number.isFinite(v) && v >= 0 && v <= 100) &&
    value.width > 0 && value.height > 0 && value.x + value.width <= 100 && value.y + value.height <= 100);
}
export function selectedRegion(page: number, start: Point, end: Point): PdfRegion | null {
  const clamp = (n: number) => Math.max(0, Math.min(100, n));
  const a = { x: clamp(start.x), y: clamp(start.y) }, b = { x: clamp(end.x), y: clamp(end.y) };
  const region = { page, x: Math.min(a.x, b.x), y: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x), height: Math.abs(a.y - b.y), note: "" };
  return isValidRegion(region, page) ? region : null;
}
export function trustedParentMessage(origin: string, source: unknown, allowedOrigin: string, parent: unknown) {
  return origin === allowedOrigin && source === parent && allowedOrigin !== "";
}
