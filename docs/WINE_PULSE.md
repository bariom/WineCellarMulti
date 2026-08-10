# Vinaris Wine Pulse

Wine Pulse is an autonomous editorial feed for wine-sector news. A separate
oneshot worker collects a curated set of RSS feeds, normalizes and deduplicates
their entries, asks GPT-5.6 Luna for a structured editorial decision, and stores
only the selected metadata and summaries. The Vinaris web application reads the
already prepared feed and never waits for source websites or OpenAI.

## Production operation

`update.sh` installs and enables `vinaris-wine-pulse.timer` when the production
backend systemd service is present. The timer runs three times daily with a
random delay of up to fifteen minutes.

Inspect it with:

```bash
systemctl list-timers vinaris-wine-pulse.timer
sudo journalctl -u vinaris-wine-pulse.service -n 100 --no-pager
```

Run a collection manually with:

```bash
cd /home/administrator/progetti/WineCellarMulti/backend
.venv/bin/python scripts/collect_wine_news.py
```

The first execution can require several runs to process the initial feed
backlog. Each run deliberately limits AI work to 80 candidates.

## Configuration

The relevant backend environment variables are:

```env
WINE_PULSE_ENABLED=true
WINE_PULSE_AI_ENABLED=true
WINE_PULSE_MODEL=gpt-5.6-luna
WINE_PULSE_MIN_SCORE=72
WINE_PULSE_MAX_DAILY_ARTICLES=10
WINE_PULSE_FEED_TIMEOUT_SECONDS=20
WINE_PULSE_RETENTION_DAYS=180
WINE_PULSE_SOURCES_JSON=
```

`OPENAI_API_KEY` must be configured and `OPENAI_ENABLE_GPT56=true` must be set
for the configured Luna model to be used. The normal Vinaris rollback switch is
respected: while GPT-5.6 is disabled, the existing safe fallback model is used.

`WINE_PULSE_SOURCES_JSON` can replace the built-in registry without a code
deployment. Example:

```json
[
  {
    "id": "publisher-slug",
    "name": "Publisher",
    "feed_url": "https://publisher.example/feed/",
    "website_url": "https://publisher.example/",
    "language": "it",
    "enabled": true
  }
]
```

Only `it` and `en` are accepted as source languages. Sources missing from a
custom registry are disabled, not deleted.

## Editorial and legal safeguards

- The worker reads RSS/Atom metadata only and does not scrape full articles.
- Original title, publisher, date and canonical link are always retained.
- Generated titles and summaries are explicitly identified as Vinaris AI copy.
- HTML is stripped and feed content is treated as untrusted model input.
- At most ten stories are selected in a 72-hour edition window, with no more
  than two from one publisher and one from the same story cluster. The first
  edition may use a seven-day bootstrap window so a new installation is not
  empty while it waits for fresh stories.
- Earlier selected stories remain available in the authenticated Wine Pulse
  archive until the configured retention period expires (180 days by default).
- When a collection adds stories to the edition, Vinaris creates one in-app
  Wine Pulse notification for each active user. Alerts open Wine Pulse directly,
  are limited to one every twelve hours per user, and never send email or push.
- A source must be reviewed for syndication and attribution terms before it is
  added or retained in production. Availability of an RSS endpoint alone is
  not a blanket republication licence.
- Publisher images are stored as source metadata but the MVP interface does not
  display them.

The authenticated feed is available at `GET /api/v1/wine-pulse`. Application
administrators can inspect collection health at `GET /api/v1/wine-pulse/status`.
