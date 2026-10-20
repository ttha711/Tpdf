/** Keep whole-file pdf-lib strictly on the small/known-size save path. */
export const DEFAULT_LARGE_FILE_BYTES = 30 * 1024 * 1024;
export type SaveRoute = "bytes" | "changes" | "blocked";

/** Unknown URL size is never evidence that a download is safe. */
export function chooseSaveRoute(
  size: number | undefined, hasHostChanges: boolean,
  threshold = DEFAULT_LARGE_FILE_BYTES,
): SaveRoute {
  if (!Number.isFinite(threshold) || threshold <= 0) throw Error("Invalid largeFileBytes");
  if (size === undefined || !Number.isFinite(size) || size < 0) {
    return hasHostChanges ? "changes" : "blocked";
  }
  return size > threshold ? (hasHostChanges ? "changes" : "blocked") : "bytes";
}

/** HEAD never downloads the PDF body; cannot claim a safe byte route without a size. */
export async function sizeForSave(
  source: { url: string; size?: number } | { bytes: Uint8Array },
): Promise<number | undefined> {
  if ("bytes" in source) return source.bytes.byteLength;
  if (source.size !== undefined) return source.size;
  try {
    const response = await fetch(source.url, { method: "HEAD", credentials: "same-origin" });
    const length = response.headers.get("Content-Length");
    return response.ok && length && /^\d+$/.test(length) ? Number(length) : undefined;
  } catch {
    return undefined;
  }
}
