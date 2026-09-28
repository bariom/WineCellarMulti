"""Benchmark the existing cutout pipeline without uploading or storing user photos.

Run each thread count in a fresh process, e.g. from backend/:
python -m scripts.benchmark_bottle_photo --threads 0 --runs 3
python -m scripts.benchmark_bottle_photo --threads 2 --runs 3
Optionally pass --image /path/to/bottle.jpg to use a representative capture.
The default synthetic bottle tests speed/output stability, not real-photo quality.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from io import BytesIO
from pathlib import Path
from time import perf_counter


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--threads", type=int, default=0)
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--model", default="birefnet-general-lite")
    parser.add_argument("--image", type=Path)
    parser.add_argument("--jit", action="store_true", help="Include unused PyMatting JIT startup")
    args = parser.parse_args()
    if args.threads < 0 or args.runs < 1:
        parser.error("threads must be nonnegative and runs must be positive")
    if args.threads:
        os.environ["OMP_NUM_THREADS"] = str(args.threads)
    else:
        os.environ.pop("OMP_NUM_THREADS", None)
    os.environ["NUMBA_DISABLE_JIT"] = "0" if args.jit else "1"

    import psutil
    from PIL import Image, ImageDraw

    from app.services.bottle_photo_ai import _model_session, _process_bottle_photo_with_session

    if args.image:
        content = args.image.read_bytes()
    else:
        image = Image.new("RGB", (480, 720), (224, 216, 195))
        draw = ImageDraw.Draw(image)
        draw.polygon(
            [
                (218, 52),
                (262, 52),
                (264, 200),
                (309, 250),
                (309, 659),
                (171, 659),
                (171, 250),
                (216, 200),
            ],
            fill=(32, 49, 28),
        )
        draw.rectangle((218, 52, 262, 135), fill=(100, 36, 36))
        draw.rectangle((179, 355, 301, 485), fill=(236, 227, 193))
        draw.text((207, 400), "TEST", fill=(50, 48, 35))
        buffer = BytesIO()
        image.save(buffer, format="PNG")
        content = buffer.getvalue()

    started = perf_counter()
    session = _model_session(args.model)
    print(
        json.dumps(
            {"threads": args.threads, "model_load_ms": round((perf_counter() - started) * 1000)}
        ),
        flush=True,
    )
    for run in range(args.runs):
        output, timings = _process_bottle_photo_with_session(content, session)
        pixels = Image.open(BytesIO(output)).tobytes()
        print(
            json.dumps(
                {
                    "run": run + 1,
                    **timings,
                    "rss_mb": round(psutil.Process().memory_info().rss / 1_000_000),
                    "pixel_sha256": hashlib.sha256(pixels).hexdigest(),
                }
            ),
            flush=True,
        )


if __name__ == "__main__":
    main()
