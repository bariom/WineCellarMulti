from __future__ import annotations

import json
import logging

from app.db.session import SessionLocal
from app.services.wine_news import collect_wine_news


def main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    with SessionLocal() as db:
        run = collect_wine_news(db)
        print(
            json.dumps(
                {
                    "run_id": str(run.id),
                    "status": run.status,
                    "stats": run.stats,
                },
                separators=(",", ":"),
            )
        )


if __name__ == "__main__":
    main()
