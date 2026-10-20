#!/usr/bin/env python3
"""Create a non-linearized, xref-valid PDF; real per-page JPEG streams, no padding."""
import argparse
from io import BytesIO
from pathlib import Path
import os
import fitz
from PIL import Image

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--pages", type=int, default=300)
    parser.add_argument("--out", default="public/large-fixture.pdf")
    parser.add_argument("--quality", type=int, default=89)
    args = parser.parse_args()
    if not 1 <= args.pages <= 1000 or not 80 <= args.quality <= 95:
        parser.error("pages must be 1..1000 and quality 80..95")
    out = Path(args.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    doc = fitz.open()
    for index in range(args.pages):
        page = doc.new_page(width=2384, height=1684)  # A0 landscape points
        page.insert_text((65, 95), f"TPDF LOAD TEST - DRAWING A0 / PAGE {index + 1:03d}", fontsize=30)
        for x in range(60, 2320, 50):
            page.draw_line((x, 170), (x, 1600), color=(0.20, 0.32, 0.44), width=0.4)
        for y in range(170, 1600, 50):
            page.draw_line((60, y), (2320, y), color=(0.20, 0.32, 0.44), width=0.4)
        image = Image.frombytes("RGB", (1200, 900), os.urandom(1200 * 900 * 3))
        output = BytesIO()
        image.save(output, format="JPEG", quality=args.quality, subsampling=2)
        page.insert_image(fitz.Rect(250, 300, 2050, 1500), stream=output.getvalue())
        if (index + 1) % 25 == 0:
            print(f"generated {index + 1}/{args.pages} pages", flush=True)
    doc.save(str(out), garbage=0, deflate=True, linear=False)
    doc.close()
    with fitz.open(out) as check:
        assert check.page_count == args.pages
        assert check.is_pdf and not check.is_repaired
        print(f"VALID_PDF pages={check.page_count} bytes={out.stat().st_size} "
              f"MiB={out.stat().st_size / (1024**2):.2f} repaired={check.is_repaired}")

if __name__ == "__main__":
    main()
