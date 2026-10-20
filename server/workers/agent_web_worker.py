"""Untrusted PDF rasterization and visual comparison; only server-resolved paths."""
import json
import os
import sys

try:
    import pymupdf as fitz
except ImportError:
    import fitz
from PIL import Image, ImageChops

MAX_PAGES = 100


def verify_doc(path):
    doc = fitz.open(path)
    if doc.needs_pass:
        raise ValueError("Encrypted PDF is unsupported")
    if len(doc) > 1500:
        raise ValueError("Page count limit exceeded")
    return doc


def export_images(args):
    doc = verify_doc(args["pdf"])
    pages = args["pages"]
    fmt = args["format"]
    dpi = args["dpi"]
    if fmt not in ("png", "jpeg") or not isinstance(dpi, int) or not 36 <= dpi <= 180:
        raise ValueError("Invalid image format or DPI")
    if not isinstance(pages, list) or not 1 <= len(pages) <= 8:
        raise ValueError("Export requires 1-8 pages")
    if any(not isinstance(n, int) or n < 1 or n > len(doc) for n in pages):
        raise ValueError("Invalid page number")
    files = []
    for number in pages:
        page = doc[number - 1]
        matrix = fitz.Matrix(dpi / 72, dpi / 72)
        if page.rect.width * dpi / 72 > 6000 or page.rect.height * dpi / 72 > 6000:
            raise ValueError("Raster page dimensions exceed limit")
        pix = page.get_pixmap(matrix=matrix, colorspace=fitz.csRGB, alpha=False)
        img = Image.frombytes("RGB", (pix.width, pix.height), pix.samples)
        path = os.path.join(args["dir"], str(number) + "." + fmt)
        img.save(path, format="PNG" if fmt == "png" else "JPEG", quality=86)
        if os.path.getsize(path) > 15 * 1024 * 1024:
            raise ValueError("Page image exceeds 15MB")
        files.append({"page": number, "path": path, "format": fmt})
    doc.close()
    return {"images": files}


def grayscale(page):
    pix = page.get_pixmap(matrix=fitz.Matrix(1, 1), colorspace=fitz.csGRAY, alpha=False)
    return Image.frombytes("L", (pix.width, pix.height), pix.samples).resize((512, 512))


def compare(args):
    left, right = verify_doc(args["left"]), verify_doc(args["right"])
    if max(len(left), len(right)) > MAX_PAGES:
        raise ValueError("Comparison supports at most 100 pages")
    differences = []
    for i in range(max(len(left), len(right))):
        if i >= len(left) or i >= len(right):
            differences.append({"page": i + 1, "changedPercent": 100.0,
                "region": {"page": i + 1, "x": 0, "y": 0, "width": 100, "height": 100},
                "status": "added" if i >= len(left) else "removed"})
            continue
        first, second = grayscale(left[i]), grayscale(right[i])
        mask = ImageChops.difference(first, second).point(lambda pixel: 255 if pixel > 24 else 0)
        bbox = mask.getbbox()
        if not bbox:
            continue
        histogram = mask.histogram()
        ratio = round(histogram[255] * 100 / (512 * 512), 3)
        x0, y0, x1, y1 = bbox
        differences.append({"page": i + 1, "changedPercent": ratio,
            "region": {"page": i + 1, "x": round(x0 * 100 / 512, 2),
                "y": round(y0 * 100 / 512, 2), "width": round((x1 - x0) * 100 / 512, 2),
                "height": round((y1 - y0) * 100 / 512, 2)}, "status": "modified"})
    left_count, right_count = len(left), len(right)
    left.close()
    right.close()
    return {"pageCountLeft": left_count, "pageCountRight": right_count, "differences": differences}


if __name__ == "__main__":
    try:
        spec = json.loads(sys.stdin.read(65536))
        result = export_images(spec) if spec["type"] == "export-images" else compare(spec)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as exc:
        print(json.dumps({"error": str(exc)[:400]}))
        sys.exit(1)
