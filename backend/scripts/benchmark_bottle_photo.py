"""Benchmark the existing cutout pipelines without uploading or storing user photos.

Run each configuration in a fresh process, e.g. from backend/:
python -m scripts.benchmark_bottle_photo --threads 0 --runs 3
python -m scripts.benchmark_bottle_photo --threads 4 --runs 3 --catalog
Optionally pass --image /path/to/bottle.jpg to use a representative capture (for
--catalog, a 2:3 frame around one bottle of a shop photo).
The default synthetic bottle tests speed/output stability, not real-photo quality.

Memory is the resident set size of this process, which is what the photo worker costs
the server: rss_mb after each step, and peak_rss_mb sampled every 20 ms over the whole
run (native ONNX Runtime allocations included, unlike tracemalloc).
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
from io import BytesIO
from pathlib import Path
from threading import Event, Thread
from time import perf_counter


class PeakRss:
    """Sample this process's resident memory in the background."""

    def __init__(self, process: object, interval: float = 0.02) -> None:
        self.process = process
        self.interval = interval
        self.peak = 0
        self._stop = Event()
        self._thread = Thread(target=self._run, daemon=True)

    def _run(self) -> None:
        while not self._stop.wait(self.interval):
            self.sample()

    def sample(self) -> int:
        rss = self.process.memory_info().rss  # type: ignore[attr-defined]
        self.peak = max(self.peak, rss)
        return rss

    def __enter__(self) -> PeakRss:
        self.sample()
        self._thread.start()
        return self

    def __exit__(self, *args: object) -> None:
        self._stop.set()
        self._thread.join()
        self.sample()


def megabytes(value: int) -> int:
    return round(value / 1_000_000)


def synthetic_bottle() -> bytes:
    from PIL import Image, ImageDraw

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
    return buffer.getvalue()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--threads", type=int, default=0)
    parser.add_argument("--runs", type=int, default=3)
    parser.add_argument("--model", default="birefnet-general-lite")
    parser.add_argument("--image", type=Path)
    parser.add_argument("--jit", action="store_true", help="Include unused PyMatting JIT startup")
    parser.add_argument(
        "--catalog", action="store_true", help="Cutout of a bottle framed from a catalog photo"
    )
    parser.add_argument("--save", type=Path, help="Write the last output PNG here")
    args = parser.parse_args()
    if args.threads < 0 or args.runs < 1:
        parser.error("threads must be nonnegative and runs must be positive")
    if args.threads:
        os.environ["OMP_NUM_THREADS"] = str(args.threads)
    else:
        os.environ.pop("OMP_NUM_THREADS", None)
    os.environ["NUMBA_DISABLE_JIT"] = "0" if args.jit else "1"

    import psutil
    from PIL import Image

    process = psutil.Process()
    with PeakRss(process) as memory:
        print(json.dumps({"step": "start", "rss_mb": megabytes(memory.sample())}), flush=True)
        from app.services import bottle_photo_ai

        content = args.image.read_bytes() if args.image else synthetic_bottle()
        with Image.open(BytesIO(content)) as source:
            input_size = source.size
        print(
            json.dumps(
                {
                    "step": "imports",
                    "rss_mb": megabytes(memory.sample()),
                    "input_bytes": len(content),
                    "input_size": input_size,
                    "threads": args.threads,
                    "catalog": args.catalog,
                    "cpus": psutil.cpu_count(),
                }
            ),
            flush=True,
        )
        started = perf_counter()
        session = bottle_photo_ai._model_session(args.model)
        print(
            json.dumps(
                {
                    "step": "model",
                    "model": args.model,
                    "model_load_ms": round((perf_counter() - started) * 1000),
                    "rss_mb": megabytes(memory.sample()),
                }
            ),
            flush=True,
        )
        output = b""
        for run in range(args.runs):
            before = memory.peak
            started = perf_counter()
            if args.catalog:
                output, timings = bottle_photo_ai._process_catalog_bottle_photo_with_session(
                    content, session
                )
            else:
                output, timings = bottle_photo_ai._process_bottle_photo_with_session(
                    content, session
                )
            pixels = Image.open(BytesIO(output)).tobytes()
            print(
                json.dumps(
                    {
                        "run": run + 1,
                        **timings,
                        "wall_ms": round((perf_counter() - started) * 1000),
                        "rss_mb": megabytes(memory.sample()),
                        "peak_rss_mb": megabytes(max(before, memory.peak)),
                        "threads_alive": process.num_threads(),
                        "pixel_sha256": hashlib.sha256(pixels).hexdigest(),
                    }
                ),
                flush=True,
            )
        if args.save and output:
            args.save.write_bytes(output)
    print(json.dumps({"step": "end", "peak_rss_mb": megabytes(memory.peak)}), flush=True)


if __name__ == "__main__":
    main()
